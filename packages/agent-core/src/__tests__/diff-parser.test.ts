import { describe, it, expect } from "vitest";
import { parseDiff } from "../diff-parser.js";

describe("parseDiff", () => {
  it("returns an empty ParsedDiff for an empty diff", () => {
    const result = parseDiff("");
    expect(result).toEqual({ files: [], totalAddedLines: 0, totalRemovedLines: 0 });
  });

  it("returns an empty ParsedDiff for a whitespace-only diff", () => {
    const result = parseDiff("   \n\t  ");
    expect(result).toEqual({ files: [], totalAddedLines: 0, totalRemovedLines: 0 });
  });

  it("parses a single file with a normal hunk", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -10,3 +10,5 @@",
      " const x = 1;",
      '+console.log("added at 11");',
      " const y = 2;",
      '+console.log("added at 13");',
      "-const dead = 1;",
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/app.ts");
    expect(result.files[0].addedLines).toEqual([
      { line: 11, content: 'console.log("added at 11");' },
      { line: 13, content: 'console.log("added at 13");' },
    ]);
    expect(result.files[0].removedLineCount).toBe(1);
    expect(result.totalAddedLines).toBe(2);
    expect(result.totalRemovedLines).toBe(1);
  });

  it("parses multiple files in one diff, attributing lines to the correct file", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,0 +1,1 @@",
      '+console.log("a");',
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -5,0 +5,1 @@",
      '+const c = "b";',
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("src/a.ts");
    expect(result.files[0].addedLines).toEqual([{ line: 1, content: 'console.log("a");' }]);
    expect(result.files[1].path).toBe("src/b.ts");
    expect(result.files[1].addedLines).toEqual([{ line: 5, content: 'const c = "b";' }]);
    expect(result.totalAddedLines).toBe(2);
  });

  it("registers a renamed file even when no content hunk follows (path from diff --git header)", () => {
    const diff = [
      "diff --git a/old-name.ts b/new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("new-name.ts");
    expect(result.files[0].addedLines).toEqual([]);
    expect(result.files[0].removedLineCount).toBe(0);
  });

  it("attributes lines to the post-rename path when a rename carries content changes", () => {
    const diff = [
      "diff --git a/old-name.ts b/new-name.ts",
      "similarity index 88%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "--- a/old-name.ts",
      "+++ b/new-name.ts",
      "@@ -1,2 +1,2 @@",
      " context line",
      "-removed line",
      "+added line",
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("new-name.ts");
    expect(result.files[0].removedLineCount).toBe(1);
    expect(result.files[0].addedLines).toHaveLength(1);
  });

  it("registers a binary file with zero added/removed lines", () => {
    const diff = [
      "diff --git a/logo.png b/logo.png",
      "index abc123..def456 100644",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("logo.png");
    expect(result.files[0].addedLines).toEqual([]);
    expect(result.files[0].removedLineCount).toBe(0);
    expect(result.totalAddedLines).toBe(0);
    expect(result.totalRemovedLines).toBe(0);
  });

  it("handles a file with removals but no additions", () => {
    const diff = [
      "diff --git a/src/dead.ts b/src/dead.ts",
      "--- a/src/dead.ts",
      "+++ b/src/dead.ts",
      "@@ -1,2 +1,0 @@",
      "-const a = 1;",
      "-const b = 2;",
    ].join("\n");

    const result = parseDiff(diff);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/dead.ts");
    expect(result.files[0].addedLines).toEqual([]);
    expect(result.files[0].removedLineCount).toBe(2);
    expect(result.totalAddedLines).toBe(0);
    expect(result.totalRemovedLines).toBe(2);
  });

  it("does not attribute lines to any file when no diff --git header precedes them", () => {
    const diff = "+some change\n-old line";

    const result = parseDiff(diff);

    expect(result.files).toEqual([]);
  });
});
