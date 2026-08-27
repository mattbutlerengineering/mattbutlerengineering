#!/usr/bin/env node

/**
 * Fails when a `packages/rialto/src/components/<X>/` directory has no
 * sibling `*.stories.tsx` file.
 *
 * This exact gap — 28 components with no Storybook coverage — was closed
 * once already (#1019) and silently regressed as new components were added
 * without matching stories, until #4439/#4445/#4454/#4471 closed it a
 * second time. Nothing caught the regression between those two events
 * because story coverage was never enforced, only fixed. This check is the
 * guard: it fails CI the moment a component directory is added (or a story
 * file is deleted) without a matching `*.stories.tsx`, so the gap can't
 * silently reopen a third time.
 *
 * Follows scripts/check-orphaned-tests.mjs's structure: a pure finder that
 * delegates the file walk to scripts/lib/repo-scan.mjs's `walkFiles` rather
 * than hand-rolling recursion, and the shared scripts/lib/fitness-check.mjs
 * reporter for PASS/FAIL output and exit code.
 */

import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";

import { root } from "./dep-graph-discovery.mjs";
import { walkFiles, DEFAULT_IGNORE_DIRS } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/** Repo-relative directory holding one folder per rialto component. */
export const COMPONENTS_DIR = "packages/rialto/src/components";

/** Matches a Storybook story file, the vitest/CSF convention used in this repo. */
export const STORY_FILE_RE = /\.stories\.tsx$/;

/**
 * Component directories: the direct children of `componentsDir`.
 *
 * @param {string} componentsDir - Absolute path to the components directory.
 * @returns {string[]} Directory names, sorted.
 */
export function findComponentDirs(componentsDir) {
  return readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Component directory names that contain at least one `*.stories.tsx` file.
 *
 * @param {string} componentsDir - Absolute path to the components directory.
 * @param {Set<string>} [ignoreDirs]
 * @returns {Set<string>}
 */
export function findComponentsWithStories(componentsDir, ignoreDirs = DEFAULT_IGNORE_DIRS) {
  const storyFiles = walkFiles(componentsDir, {
    ignoreDirs,
    match: (name) => STORY_FILE_RE.test(name),
  });

  const names = new Set();
  for (const file of storyFiles) {
    const [componentName] = relative(componentsDir, file).split(sep);
    names.add(componentName);
  }
  return names;
}

/**
 * Component directories with no matching story file.
 *
 * @param {string} componentsDir - Absolute path to the components directory.
 * @returns {string[]} Missing component names, sorted.
 */
export function findMissingStories(componentsDir) {
  const withStories = findComponentsWithStories(componentsDir);
  return findComponentDirs(componentsDir).filter((name) => !withStories.has(name));
}

export const FAIL_MESSAGE =
  "FAIL: Some rialto components have no Storybook story.\n" +
  "Every packages/rialto/src/components/<X>/ directory must ship a matching\n" +
  "<X>.stories.tsx — this gap has silently regressed once already (#1019).\n" +
  "Add a story file for each component listed below.";

/**
 * @param {string} name - Missing component name.
 * @returns {string}
 */
export function formatFinding(name) {
  return `${COMPONENTS_DIR}/${name}/ — no *.stories.tsx file`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-story-coverage.mjs");

if (isMain) {
  const findings = findMissingStories(`${root}/${COMPONENTS_DIR}`);

  process.exit(
    runCheck({
      name: "rialto story coverage",
      findings,
      formatFinding,
      passMessage: "PASS: Every rialto component directory has a Storybook story.",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
