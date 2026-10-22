import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  checkThemeContrast,
  parseVenueTheme,
  themeToCssVars,
  onAccentColor,
} from "./venue-theme.js";

const good = { accent: "#7a1f3d", accentHover: "#8c2a4a", source: "manual" } as const;

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });
  it("expands 3-digit hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1);
  });
});

describe("onAccentColor", () => {
  it("picks light text on a dark accent and dark text on a light accent", () => {
    expect(onAccentColor("#10203a")).toBe("#fdfcfa");
    expect(onAccentColor("#f5d77a")).toBe("#1a1918");
  });
});

describe("checkThemeContrast", () => {
  it("passes a readable palette", () => {
    expect(checkThemeContrast(good)).toEqual({ ok: true, failures: [] });
  });
  it("rejects a mid-tone accent no text colour can sit on at AA", () => {
    const r = checkThemeContrast({ ...good, accent: "#808080", accentHover: "#888888" });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("accent-text");
  });
  it("rejects text that is unreadable on its surface", () => {
    const r = checkThemeContrast({ ...good, surface: "#ffffff", textPrimary: "#eeeeee" });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("text-surface");
  });
  it("rejects an accent that vanishes against the surface", () => {
    const r = checkThemeContrast({
      ...good,
      accent: "#f0f0f0",
      accentHover: "#e0e0e0",
      surface: "#ffffff",
    });
    expect(r.failures).toContain("accent-surface");
  });
});

describe("parseVenueTheme", () => {
  it("returns null for absent, malformed or unreadable themes", () => {
    expect(parseVenueTheme(null)).toBeNull();
    expect(parseVenueTheme({})).toBeNull();
    expect(parseVenueTheme({ theme: { accent: "nope" } })).toBeNull();
    expect(parseVenueTheme({ theme: { ...good, accent: "#808080" } })).toBeNull();
  });
  it("returns a valid readable theme", () => {
    expect(parseVenueTheme({ theme: good })).toEqual(good);
  });
});

describe("themeToCssVars", () => {
  it("maps to rialto custom properties and only what is set", () => {
    const vars = themeToCssVars(good);
    expect(vars["--rialto-accent"]).toBe("#7a1f3d");
    expect(vars["--rialto-accent-hover"]).toBe("#8c2a4a");
    expect(vars["--rialto-text-on-accent"]).toBe("#fdfcfa");
    expect(vars["--rialto-surface"]).toBeUndefined();
    expect(themeToCssVars({ ...good, surface: "#fff" })["--rialto-surface"]).toBe("#fff");
  });
});
