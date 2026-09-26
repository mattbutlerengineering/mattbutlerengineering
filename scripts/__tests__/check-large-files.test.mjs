import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isExemptLargeFile, filterLargeFiles } from "../check-large-files.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const AUTO_REVIEW_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/auto-review.yml"),
  "utf8"
);

describe("isExemptLargeFile", () => {
  it("exempts the append-only improvement-loop log", () => {
    expect(isExemptLargeFile(".claude/improvement-loop/log.md")).toBe(true);
  });

  it("exempts the append-only revert log", () => {
    expect(isExemptLargeFile(".claude/improvement-loop/revert-log.md")).toBe(true);
  });

  it("does not exempt an arbitrary oversized markdown file", () => {
    expect(isExemptLargeFile("docs/architecture/dependency-graph.md")).toBe(false);
  });

  it("does not exempt an arbitrary oversized source file", () => {
    expect(isExemptLargeFile("packages/rialto/src/components/Table/Table.tsx")).toBe(false);
  });
});

describe("filterLargeFiles", () => {
  it("reports a genuinely oversized non-log file", () => {
    const result = filterLargeFiles([{ path: "packages/rialto/src/huge.ts", lines: 801 }]);
    expect(result).toEqual([{ path: "packages/rialto/src/huge.ts", lines: 801 }]);
  });

  it("does not report an oversized append-only log", () => {
    const result = filterLargeFiles([{ path: ".claude/improvement-loop/log.md", lines: 2307 }]);
    expect(result).toEqual([]);
  });

  it("does not report a file at or under the 800-line threshold", () => {
    const result = filterLargeFiles([{ path: "packages/rialto/src/small.ts", lines: 800 }]);
    expect(result).toEqual([]);
  });

  it("filters a mixed list, keeping only genuine non-exempt oversized files", () => {
    const result = filterLargeFiles([
      { path: ".claude/improvement-loop/log.md", lines: 2307 },
      { path: "packages/rialto/src/huge.ts", lines: 900 },
      { path: "packages/rialto/src/small.ts", lines: 10 },
    ]);
    expect(result).toEqual([{ path: "packages/rialto/src/huge.ts", lines: 900 }]);
  });
});

describe("auto-review.yml — large-file check wiring (#5786)", () => {
  it("delegates the large-file check to the pure, testable script", () => {
    expect(AUTO_REVIEW_WORKFLOW).toContain("scripts/check-large-files.mjs");
  });
});
