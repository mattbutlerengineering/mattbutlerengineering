import { describe, it, expect } from "vitest";
import { toSegments, toTiles } from "./tiles";

describe("toSegments", () => {
  it("promotes a plain string line to a single ink run", () => {
    expect(toSegments("SOUP")).toEqual([{ text: "SOUP" }]);
  });

  it("passes a segment line through untouched", () => {
    const line = [{ text: "SOUP " }, { text: "$9", accent: true }] as const;
    expect(toSegments(line)).toBe(line);
  });
});

describe("toTiles", () => {
  it("cuts a line into one tile per character", () => {
    expect(toTiles("OK")).toEqual([
      { char: "O", accent: false, empty: false },
      { char: "K", accent: false, empty: false },
    ]);
  });

  it("upper-cases every character — the board owns no lowercase pieces", () => {
    expect(toTiles("ok").map((tile) => tile.char)).toEqual(["O", "K"]);
  });

  it("marks whitespace as an empty ridge rather than a letter piece", () => {
    const tiles = toTiles("A B");
    expect(tiles.map((tile) => tile.empty)).toEqual([false, true, false]);
  });

  it("accents only the characters of an accented run", () => {
    const tiles = toTiles([{ text: "PIE" }, { text: "$4", accent: true }]);
    expect(tiles.map((tile) => tile.accent)).toEqual([false, false, false, true, true]);
  });

  it("treats an explicit accent:false run as ink", () => {
    expect(toTiles([{ text: "A", accent: false }])[0]?.accent).toBe(false);
  });

  it("yields no tiles for an empty line", () => {
    expect(toTiles("")).toEqual([]);
  });
});
