import { describe, it, expect } from "vitest";
import {
  STATUS_GLYPHS,
  STATUS_GLYPH_KEYS,
  glyphKeyFor,
  statusFillToken,
} from "./table-status-glyph.js";

describe("STATUS_GLYPHS", () => {
  it("has a glyph for the four statuses and the inactive state", () => {
    expect([...STATUS_GLYPH_KEYS].sort()).toEqual(
      ["available", "inactive", "needs-bussing", "reserved-soon", "seated"].sort()
    );
    for (const key of STATUS_GLYPH_KEYS) expect(STATUS_GLYPHS[key].path.length).toBeGreaterThan(0);
  });

  it("gives every key a distinct shape, so colour is never the only cue", () => {
    const paths = STATUS_GLYPH_KEYS.map((key) => STATUS_GLYPHS[key].path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("tells reserved-soon from needs-bussing by glyph alone", () => {
    expect(STATUS_GLYPHS["reserved-soon"].path).not.toBe(STATUS_GLYPHS["needs-bussing"].path);
  });
});

describe("glyphKeyFor", () => {
  it("draws no glyph when no statuses are supplied (editor-only usage)", () => {
    expect(glyphKeyFor(undefined, true)).toBeNull();
    expect(glyphKeyFor(undefined, false)).toBeNull();
  });

  it("returns the status for an active table", () => {
    expect(glyphKeyFor("seated", true)).toBe("seated");
  });

  it("returns inactive for an inactive table whatever its status", () => {
    expect(glyphKeyFor("seated", false)).toBe("inactive");
  });
});

describe("statusFillToken", () => {
  it("uses rialto tokens only", () => {
    for (const key of STATUS_GLYPH_KEYS) expect(statusFillToken(key)).toMatch(/^var\(--rialto-/);
  });
});
