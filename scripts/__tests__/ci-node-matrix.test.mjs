import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Pull the `node-version:` line out of the `test` job's `strategy.matrix`
 * block.
 *
 * Parsed textually rather than with a YAML library, matching the precedent
 * in drift-fix-workflow.test.mjs: nothing in `scripts/` depends on a YAML
 * parser, and the line is a plain scalar/expression with no anchors or flow
 * mappings to get wrong.
 */
function testJobNodeVersionLine(source) {
  const lines = source.split("\n");
  const testJobStart = lines.findIndex((l) => /^ {2}test:\s*$/.test(l));
  if (testJobStart === -1) throw new Error("ci.yml has no top-level `test:` job");

  const relativeIdx = lines.slice(testJobStart).findIndex((l) => /^\s*node-version:/.test(l));
  if (relativeIdx === -1) throw new Error("`test` job has no `node-version:` matrix line");

  return lines[testJobStart + relativeIdx];
}

describe("ci.yml Test job Node matrix", () => {
  const line = testJobNodeVersionLine(WORKFLOW);

  it("runs the identical Node matrix on pull_request as on push/merge_group", () => {
    // A `github.event_name == 'pull_request' ? [...] : [...]` conditional (or its
    // inverse) makes PR-time CI structurally blind to failures that only reproduce
    // on a version skipped for PRs. #3558 was a Node-20-only failure that first
    // surfaced on a push-to-main run because the PR leg never exercised Node 20 —
    // this asserts the matrix can no longer diverge by event, so that gap cannot
    // silently come back.
    expect(line).not.toMatch(/event_name/);
    expect(line).not.toMatch(/fromJSON/);
  });

  it("pins the single Node major the rest of the repo declares as supported", () => {
    const nvmrc = readFileSync(resolve(ROOT, ".nvmrc"), "utf8").trim();
    const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

    expect(rootPkg.engines?.node).toBe(`>=${nvmrc}`);
    expect(line).toMatch(new RegExp(`\\[\\s*${nvmrc}\\s*\\]`));
  });
});
