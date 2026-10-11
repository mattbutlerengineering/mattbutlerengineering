import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Extract the `run: |` block of the detect-changes "Check for code changes"
 * step. Parsed textually (no YAML dependency in scripts/), matching
 * ci-node-matrix.test.mjs.
 */
function detectChangesRunBlock(source) {
  const lines = source.split("\n");
  const jobStart = lines.findIndex((l) => /^ {2}detect-changes:\s*$/.test(l));
  if (jobStart === -1) throw new Error("ci.yml has no `detect-changes:` job");
  const runIdx = lines.findIndex((l, i) => i > jobStart && /^\s+run: \|\s*$/.test(l));
  if (runIdx === -1) throw new Error("detect-changes has no `run: |` block");
  const indent = lines[runIdx + 1].match(/^\s*/)[0].length;
  const block = [];
  for (const line of lines.slice(runIdx + 1)) {
    if (line.trim() !== "" && line.match(/^\s*/)[0].length < indent) break;
    block.push(line);
  }
  return block.join("\n");
}

describe("ci.yml detect-changes fail-closed", () => {
  const run = detectChangesRunBlock(WORKFLOW);

  it("enables errexit and pipefail before the git diff, so a failing diff fails the job", () => {
    const setIdx = run.search(/^\s*set -euo pipefail\s*$/m);
    const diffIdx = run.search(/^\s*CODE_CHANGES=.*git diff/m);
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(diffIdx).toBeGreaterThan(setIdx);
  });
});
