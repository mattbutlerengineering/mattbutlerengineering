import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isExemptLargeFile, filterLargeFiles, countLines } from "../check-large-files.mjs";

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

  it("reports a genuinely oversized non-exempt markdown file, proving this isn't a blanket .md carve-out", () => {
    const result = filterLargeFiles([
      { path: "docs/architecture/dependency-graph.md", lines: 2272 },
      { path: ".claude/improvement-loop/log.md", lines: 2264 },
    ]);
    expect(result).toEqual([{ path: "docs/architecture/dependency-graph.md", lines: 2272 }]);
  });
});

describe("countLines", () => {
  const tmpFile = resolve(tmpdir(), `check-large-files-test-${process.pid}.txt`);

  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  it("matches `wc -l` for a file ending in a trailing newline", () => {
    writeFileSync(tmpFile, "a\nb\nc\n");
    expect(countLines(tmpFile)).toBe(3);
  });

  it("matches `wc -l` for a file with NO trailing newline (the off-by-one case)", () => {
    // `wc -l` counts newline characters, not physical lines: "a\nb\nc" has only
    // 2 newlines, so `wc -l` reports 2, not 3. A naive split("\n").length would
    // over-count by one here, and would have flagged an 800-newline file with
    // one trailing unterminated line as 801 lines when `wc -l` reports 800.
    writeFileSync(tmpFile, "a\nb\nc");
    expect(countLines(tmpFile)).toBe(2);
  });

  it("returns 0 for an empty file", () => {
    writeFileSync(tmpFile, "");
    expect(countLines(tmpFile)).toBe(0);
  });
});

describe("auto-review.yml — large-file check wiring (#5786)", () => {
  it("delegates the large-file check to the pure, testable script", () => {
    expect(AUTO_REVIEW_WORKFLOW).toContain("scripts/check-large-files.mjs");
  });
});
