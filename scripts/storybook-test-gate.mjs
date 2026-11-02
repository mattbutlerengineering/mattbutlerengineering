#!/usr/bin/env node
/**
 * Gate for rialto's Storybook browser tests (`pnpm test:storybook`), #8088.
 *
 * Runs the suite, then judges the per-story results against an explicit
 * quarantine list (`packages/rialto/storybook-quarantine.json`) instead of
 * trusting vitest's exit code alone:
 *
 *   - a failing story that is not quarantined fails the gate (a new regression);
 *   - a quarantined story that passes fails the gate (prune the entry);
 *   - a quarantined story that no longer exists fails the gate (stale entry);
 *   - a required guard file that did not run fails the gate;
 *   - an empty report fails the gate (a graceful skip must not look like green).
 *
 * The verdict logic is pure and exported; `main()` only runs the suite.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RIALTO = join(ROOT, "packages/rialto");
const QUARANTINE_PATH = join(RIALTO, "storybook-quarantine.json");

/**
 * Story files that must run: jsdom has no layout, so these are the only
 * real-browser checks that an overlay is not clipped inside a Dialog.
 */
export const REQUIRED_STORY_FILES = ["src/components/Dialog/Dialog.overlays.stories.tsx"];

const label = (file, title) => `${file.replace(/^src\/components\//, "")} > ${title}`;

/**
 * Flatten vitest's json reporter output into `{ file, title, status }` rows,
 * with `file` relative to packages/rialto (everything from `src/` onward).
 */
export function summarizeVitestJson(report) {
  return (report.testResults ?? []).flatMap((suite) => {
    const at = suite.name.lastIndexOf("/src/");
    const file = at === -1 ? suite.name : suite.name.slice(at + 1);
    return (suite.assertionResults ?? []).map((test) => ({
      file,
      title: test.title,
      status: test.status,
    }));
  });
}

/** @returns {{ ok: boolean, problems: string[] }} */
export function evaluateStorybookReport(results, quarantine) {
  const problems = [];
  if (results.length === 0) {
    return { ok: false, problems: ["The report contains no stories: nothing was tested."] };
  }
  const find = (file, title) => results.find((r) => r.file === file && r.title === title);
  const quarantined = new Set(quarantine.map((q) => `${q.file}::${q.story}`));

  for (const r of results) {
    if (r.status === "failed" && !quarantined.has(`${r.file}::${r.title}`)) {
      problems.push(`New story failure: ${label(r.file, r.title)}`);
    }
  }
  for (const q of quarantine) {
    const hit = find(q.file, q.story);
    if (!hit) {
      problems.push(`Quarantined story not found (renamed or removed?): ${label(q.file, q.story)}`);
    } else if (hit.status === "passed") {
      problems.push(
        `Quarantined story now passes, remove it from the quarantine: ${label(q.file, q.story)}`
      );
    }
  }
  for (const file of REQUIRED_STORY_FILES) {
    if (!results.some((r) => r.file === file)) {
      problems.push(`Required guard did not run: ${file}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

function main() {
  const outDir = mkdtempSync(join(tmpdir(), "storybook-gate-"));
  const jsonPath = join(outDir, "report.json");
  const run = spawnSync(
    "pnpm",
    [
      "--dir",
      RIALTO,
      "test:storybook",
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${jsonPath}`,
    ],
    { stdio: "inherit" }
  );

  let report;
  try {
    report = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (error) {
    console.error(`storybook-test-gate: no readable vitest report (${error.message}).`);
    console.error(`vitest exited ${run.status}; the suite did not complete.`);
    process.exit(1);
  }

  const quarantine = JSON.parse(readFileSync(QUARANTINE_PATH, "utf8"));
  const verdict = evaluateStorybookReport(summarizeVitestJson(report), quarantine);
  if (!verdict.ok) {
    console.error("\nstorybook-test-gate: FAILED");
    for (const problem of verdict.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `\nstorybook-test-gate: ok (${quarantine.length} quarantined stories still failing as listed)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
