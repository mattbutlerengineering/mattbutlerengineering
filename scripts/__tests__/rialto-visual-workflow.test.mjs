/**
 * Shape guard for .github/workflows/rialto-visual.yml — the Storybook visual
 * suite on main-derived baselines (#9702, same model as rialto-web-e2e.yml
 * #9696 and apps-visual.yml #9701).
 *
 * Text-level, like apps-visual-workflow.test.mjs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/rialto-visual.yml"), "utf8");

const SHOTS = "packages/rialto/src/test/visual/__screenshots__";

/** A top-level job's block, up to the next job key at two-space indent. */
function job(name) {
  const match = WORKFLOW.match(
    new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}[\\w-]+:\\n|(?![\\s\\S]))`, "m")
  );
  expect(match, `job ${name} is missing`).not.toBeNull();
  return match[1];
}

function step(block, name) {
  const idx = block.indexOf(`- name: ${name}`);
  expect(idx, `step "${name}" is missing`).toBeGreaterThan(-1);
  const next = block.indexOf("      - name:", idx + 1);
  return { idx, text: block.slice(idx, next === -1 ? undefined : next) };
}

describe("rialto-visual.yml — baselines", () => {
  it("fetches the main-derived baseline on pull requests only, before Playwright", () => {
    const block = job("visual");
    const fetch = step(block, "Fetch the main-derived baseline");
    expect(fetch.text).toContain("if: github.event_name == 'pull_request'");
    expect(fetch.text).toContain(
      "git fetch -q --no-tags --depth=50 origin main:refs/remotes/origin/main"
    );
    expect(fetch.text).toContain(
      `node scripts/visual-baselines.mjs fetch --suite rialto --dir ${SHOTS}`
    );
    expect(fetch.text).toContain("set -o pipefail");
    expect(fetch.idx).toBeLessThan(block.indexOf("- name: Run visual regression tests"));
  });

  it("captures with --update-snapshots=all on push only, with the JSON reporter", () => {
    const run = step(job("visual"), "Run visual regression tests").text;
    expect(run).toContain(
      "UPDATE_FLAG: ${{ github.event_name == 'push' && '--update-snapshots=all' || '' }}"
    );
    expect(run).toContain(
      "PLAYWRIGHT_JSON_OUTPUT_FILE: ${{ github.workspace }}/visual-report/report.json"
    );
    expect(run).toMatch(/test:visual --reporter=github,json \$UPDATE_FLAG/);
  });

  it("uploads the captured baseline on push after the visual step", () => {
    const block = job("visual");
    const up = step(block, "Upload the captured baseline");
    expect(up.text).toContain("if: success() && github.event_name == 'push'");
    expect(up.text).toContain("name: rialto-visual-baseline");
    expect(up.text).toContain(`path: ${SHOTS}/*.png`);
    expect(up.text).toContain("if-no-files-found: error");
    expect(up.text).toContain("retention-days: 3");
    expect(up.idx).toBeGreaterThan(block.indexOf("- name: Run visual regression tests"));
  });

  it("publishes the baseline from a push-only job with job-level contents: write", () => {
    const block = job("publish-visual-baseline");
    expect(block).toContain("needs: [visual]");
    expect(block).toContain("if: github.event_name == 'push' && needs.visual.result == 'success'");
    expect(block).toMatch(/permissions:\n\s+contents: write/);
    expect(block).toContain("name: rialto-visual-baseline");
    expect(block).toContain(
      'node scripts/visual-baselines.mjs publish --suite rialto --dir "$RUNNER_TEMP/baseline" --sha "$GITHUB_SHA"'
    );
  });

  it("keeps workflow-level permissions read-only and has no baseline-ref push filter", () => {
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(WORKFLOW).not.toContain("visual-baselines/**");
  });
});

describe("rialto-visual.yml — PR diff comment", () => {
  it("uploads the JSON report and the test-results diffs from the visual job", () => {
    const block = job("visual");
    expect(block).toContain("name: rialto-visual-report");
    expect(block).toContain("path: visual-report/report.json");
    const diffs = step(block, "Upload diff images for the PR comment");
    expect(diffs.text).toContain("if: failure()");
    expect(diffs.text).toContain("name: rialto-visual-diffs");
    expect(diffs.text).toContain(`path: ${SHOTS}/test-results/`);
  });

  it("publishes a sticky comment from a PR-only job with a fork decline", () => {
    const block = job("publish-visual-diffs");
    expect(block).toContain("needs: [visual]");
    expect(block).toContain(
      "if: always() && github.event_name == 'pull_request' && needs.visual.result != 'skipped'"
    );
    expect(block).toMatch(/permissions:\n\s+contents: write\n\s+pull-requests: write/);
    expect(block).toContain("declined=true");
    expect(block).toContain("name: rialto-visual-report");
    expect(block).toContain("name: rialto-visual-diffs");
    expect(block).toMatch(/VISUAL_SUITE:\s*rialto\s*$/m);
    expect(block).toContain("node scripts/publish-visual-diffs.mjs");
  });

  it("opens every multi-line run block with set -o pipefail", () => {
    const blocks = [...WORKFLOW.matchAll(/run: \|\n((?: {10}.*\n?)+)/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, body] of blocks) {
      expect(body.trimStart().startsWith("set -o pipefail")).toBe(true);
    }
  });
});

describe("rialto-visual.yml — triggers", () => {
  const EXPECTED = [
    "scripts/visual-baselines.mjs",
    "scripts/publish-visual-diffs.mjs",
    "scripts/visual-diff-*.mjs",
  ];

  it.each(["push", "pull_request"])("watches the baseline and diff scripts on %s", (trigger) => {
    const re = new RegExp(
      trigger === "push"
        ? "^ {2}push:\\n([\\s\\S]*?)(?=^ {2}pull_request:)"
        : "^ {2}pull_request:\\n([\\s\\S]*?)(?=^# |^concurrency:)",
      "m"
    );
    const section = WORKFLOW.match(re)?.[1] ?? "";
    for (const path of EXPECTED) expect(section).toContain(`"${path}"`);
  });
});
