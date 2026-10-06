import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const WORKSPACE = readFileSync(resolve(ROOT, "pnpm-workspace.yaml"), "utf8");

/**
 * The Test job's "Upload test results" step took 73s on main run 37527830915
 * to upload one 13KB file: `**\/test-results/*.xml` makes @actions/glob walk
 * every directory, node_modules included, because a `**` pattern can never be
 * ruled out for a subtree. Fixed-depth patterns let it prune. The patterns
 * must still cover every place vitest's junit reporter writes: the repo root
 * and each workspace package's own `test-results/`.
 */
function uploadPaths() {
  const start = WORKFLOW.indexOf("name: test-results-node");
  if (start === -1) throw new Error("ci.yml has no test-results-node upload");
  const block = WORKFLOW.slice(start).split(/\n\s*retention-days:/)[0];
  const literal = block.match(/^\s*path:\s*"([^"]+)"\s*$/m);
  if (literal) return [literal[1]];
  const multi = block.match(/^\s*path:\s*\|\n((?:\s+\S.*\n?)+)/m);
  if (!multi) throw new Error("test-results upload has no path");
  return multi[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function workspaceDirs() {
  return WORKSPACE.split(/\n\S/)[0]
    .split("\n")
    .map((l) => l.match(/^\s*-\s*"([^"]+)"/))
    .filter(Boolean)
    .map((m) => m[1]);
}

function covered(file, patterns) {
  return patterns.some((p) => {
    const source = p
      .split("/")
      .map((seg) =>
        seg === "*" ? "[^/]+" : seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")
      )
      .join("/");
    return new RegExp(`^${source}$`).test(file);
  });
}

describe("ci.yml test-results upload glob", () => {
  it("never uses a recursive ** pattern", () => {
    for (const p of uploadPaths()) expect(p).not.toContain("**");
  });

  it.each(["test-results/junit.xml", ...workspaceDirs().map((d) => `${d}/test-results/junit.xml`)])(
    "covers %s",
    (file) => {
      expect(covered(file.replace(/\/\*\//, "/pkg/"), uploadPaths())).toBe(true);
    }
  );
});
