import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRevertTarget, classifyRevertAttempt } from "../revert-watchdog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/revert-watchdog.yml"), "utf8");

const CULPRIT = "163e72421468d78717a26ecdb6d81f2801875ddb";
const NEWER_HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("resolveRevertTarget (#6040)", () => {
  it("targets the culprit even when main has moved on and HEAD is a different commit", () => {
    expect(resolveRevertTarget({ culpritSha: CULPRIT, headSha: NEWER_HEAD })).toBe(CULPRIT);
  });

  it.each(["", "   ", undefined, "HEAD", "163e724"])("rejects non-full-sha %j", (bad) => {
    expect(() => resolveRevertTarget({ culpritSha: bad })).toThrow(/40-hex/);
  });
});

describe("classifyRevertAttempt (#6040)", () => {
  it("opens a PR for a clean, non-empty revert", () => {
    expect(classifyRevertAttempt({ exitCode: 0, changedFileCount: 3 }).action).toBe("open-pr");
  });

  it("skips on a conflicting or already-reverted culprit", () => {
    expect(classifyRevertAttempt({ exitCode: 1, changedFileCount: 0 }).action).toBe("skip");
  });

  it("skips an empty revert", () => {
    expect(classifyRevertAttempt({ exitCode: 0, changedFileCount: 0 }).action).toBe("skip");
  });
});

describe("revert-watchdog.yml Propose Revert PR seam (#6040)", () => {
  const start = WORKFLOW.indexOf("- name: Propose Revert PR");
  const end = WORKFLOW.indexOf("  # Auto-close (#2958)");
  const step = WORKFLOW.slice(start, end);

  it("locates the step", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("reverts the culprit target resolved by the tested module, never HEAD", () => {
    expect(step).toMatch(/revert-target --sha "\$SHA"/);
    expect(step).toMatch(/git revert --no-edit "\$TARGET"/);
    expect(step).not.toMatch(/git revert[^\n]*\bHEAD\b/);
  });

  it("gates PR creation on the tested classifier", () => {
    expect(step).toMatch(/classify-revert --exit-code/);
    expect(step.indexOf("classify-revert")).toBeLessThan(step.indexOf("gh pr create"));
  });

  it("aborts a failed revert and starts with pipefail", () => {
    expect(step).toMatch(/set -o pipefail/);
    expect(step).toMatch(/git revert --abort/);
  });

  it("keeps the CI dispatch", () => {
    expect(step).toMatch(/gh workflow run ci\.yml --ref "\$BRANCH"/);
  });
});
