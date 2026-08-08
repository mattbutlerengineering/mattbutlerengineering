import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { walkFiles, DEFAULT_IGNORE_DIRS } from "../lib/repo-scan.mjs";

/**
 * Regression test for #3915: the root vitest.config.ts documents itself as
 * aggregating every package's vitest config so `vitest --workspace` / the
 * ACMM prereq-test-suite check can discover them, but `infrastructure/pulumi`
 * was missing from the `workspace` array (#3911 added `infrastructure/worker`
 * but not its sibling). This test enumerates every default vitest.config.*
 * file on disk and fails if any isn't matched by an entry in the root
 * array's globs, making that class of drift structurally impossible to
 * reintroduce.
 *
 * Scope: only the *default* config filename per package (`vitest.config.ts`
 * / `.mjs` / `.js` / `.mts` / `.cjs`) is in scope. A non-default config like
 * `packages/rialto/vitest.config.storybook.ts` is invoked via its own npm
 * script (`test:storybook`), not the root aggregator — including it would
 * pull Storybook's browser-mode test run into a plain `vitest --workspace`
 * invocation, which is a behavior change this issue doesn't ask for.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT_CONFIG_PATH = path.join(REPO_ROOT, "vitest.config.ts");

const DEFAULT_CONFIG_NAME_RE = /^vitest\.config\.(ts|mjs|js|mts|cjs)$/;

function discoverDefaultConfigs() {
  return walkFiles(REPO_ROOT, {
    ignoreDirs: DEFAULT_IGNORE_DIRS,
    match: (name) => DEFAULT_CONFIG_NAME_RE.test(name),
  })
    .map((absPath) => path.relative(REPO_ROOT, absPath).split(path.sep).join("/"))
    .filter((relPath) => relPath !== "vitest.config.ts"); // the aggregator can't cover itself
}

function workspaceGlobs() {
  const source = fs.readFileSync(ROOT_CONFIG_PATH, "utf8");
  const arrayMatch = source.match(/workspace:\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) {
    throw new Error(`could not find a "workspace" array in ${ROOT_CONFIG_PATH}`);
  }
  return [...arrayMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Simple glob→RegExp: `*` matches one path segment, everything else is literal. */
function globToRegExp(glob) {
  const pattern = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}

describe("root vitest.config.ts workspace array", () => {
  it("covers every package's default vitest.config.* file", () => {
    const globs = workspaceGlobs().map(globToRegExp);
    const configs = discoverDefaultConfigs();

    const uncovered = configs.filter((cfg) => !globs.some((re) => re.test(cfg)));

    expect(
      uncovered,
      `vitest.config.* files not covered by any entry in ${ROOT_CONFIG_PATH}'s ` +
        `workspace array: ${uncovered.join(", ")}. Add a matching glob/path entry.`
    ).toEqual([]);
  });
});
