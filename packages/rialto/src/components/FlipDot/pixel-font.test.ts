import { describe, it, expect } from "vitest";
import { textToMatrix, createEmptyMatrix, mergeMatrices, charToMatrix } from "./pixel-font";

describe("charToMatrix", () => {
  it("returns a 7x5 boolean matrix for a known character", () => {
    const result = charToMatrix("A");
    expect(result).toHaveLength(7);
    for (const row of result) {
      expect(row).toHaveLength(5);
    }
  });

  it("maps uppercase and lowercase identically", () => {
    expect(charToMatrix("a")).toEqual(charToMatrix("A"));
  });

  it("returns a blank matrix for unknown characters", () => {
    const blank = charToMatrix(" ");
    const unknown = charToMatrix("~");
    // Unknown falls back to space
    expect(unknown).toEqual(blank);
  });
});

describe("textToMatrix", () => {
  it("returns a 7-row matrix for a single character", () => {
    const result = textToMatrix("A");
    expect(result).toHaveLength(7);
    // Single char = 5 columns
    expect(result[0]).toHaveLength(5);
  });

  it("adds letterSpacing between characters", () => {
    const result = textToMatrix("AB");
    // 5 (A) + 1 (gap) + 5 (B) = 11
    expect(result[0]).toHaveLength(11);
  });

  it("respects custom letterSpacing", () => {
    const result = textToMatrix("AB", { letterSpacing: 3 });
    // 5 + 3 + 5 = 13
    expect(result[0]).toHaveLength(13);
  });

  it("returns empty matrix for empty string", () => {
    const result = textToMatrix("");
    expect(result).toHaveLength(7);
    expect(result[0]).toHaveLength(0);
  });

  it("returns empty matrix with custom dimensions for empty string", () => {
    const result = textToMatrix("", { rows: 10, cols: 20 });
    expect(result).toHaveLength(10);
    expect(result[0]).toHaveLength(20);
  });

  it("vertically centers text when rows > 7", () => {
    const result = textToMatrix("A", { rows: 11 });
    expect(result).toHaveLength(11);
    // Top padding = floor((11-7)/2) = 2 rows of all-false
    expect(result[0]!.every((d) => !d)).toBe(true);
    expect(result[1]!.every((d) => !d)).toBe(true);
    // Row 2 should have content (first row of "A")
    expect(result[2]!.some((d) => d)).toBe(true);
  });

  it("pads to target cols with start alignment", () => {
    const result = textToMatrix("A", { cols: 20, align: "start" });
    expect(result[0]).toHaveLength(20);
    // Last column should be false (padding)
    expect(result[0]![19]).toBe(false);
  });

  it("pads to target cols with center alignment", () => {
    const result = textToMatrix("A", { cols: 20, align: "center" });
    expect(result[0]).toHaveLength(20);
    const leftPad = Math.floor((20 - 5) / 2);
    // First leftPad columns should be false
    for (let i = 0; i < leftPad; i++) {
      expect(result[0]![i]).toBe(false);
    }
  });

  it("truncates when cols < text width", () => {
    const result = textToMatrix("HELLO", { cols: 10 });
    expect(result[0]).toHaveLength(10);
  });
});

describe("createEmptyMatrix", () => {
  it("creates a matrix of all-false values", () => {
    const result = createEmptyMatrix(3, 4);
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row).toHaveLength(4);
      expect(row.every((d) => d === false)).toBe(true);
    }
  });
});

describe("mergeMatrices", () => {
  it("overlays source onto target at offset", () => {
    const target = createEmptyMatrix(5, 5);
    const source = [
      [true, true],
      [true, true],
    ];
    const result = mergeMatrices(target, source, 1, 1);

    expect(result[1]![1]).toBe(true);
    expect(result[1]![2]).toBe(true);
    expect(result[2]![1]).toBe(true);
    expect(result[2]![2]).toBe(true);
    // Unchanged cells
    expect(result[0]![0]).toBe(false);
  });

  it("does not mutate the original target", () => {
    const target = createEmptyMatrix(3, 3);
    const source = [[true]];
    mergeMatrices(target, source, 0, 0);
    expect(target[0]![0]).toBe(false);
  });

  it("ignores source outside target bounds", () => {
    const target = createEmptyMatrix(2, 2);
    const source = [[true, true, true]];
    const result = mergeMatrices(target, source, 0, 1);
    expect(result[0]).toHaveLength(2);
    expect(result[0]![1]).toBe(true);
  });
});
