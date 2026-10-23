import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  checkThemeContrast,
  deriveAccentHover,
  paletteToTheme,
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

describe("deriveAccentHover", () => {
  it("shifts a dark accent toward the light text that sits on it", () => {
    expect(deriveAccentHover("#7a1f3d")).toBe("#8a3a54");
    expect(contrastRatio("#8a3a54", "#000000")).toBeGreaterThan(
      contrastRatio("#7a1f3d", "#000000")
    );
  });

  it("shifts a light accent toward the dark text that sits on it", () => {
    const hover = deriveAccentHover("#f5d77a");
    expect(contrastRatio(hover, "#ffffff")).toBeGreaterThan(contrastRatio("#f5d77a", "#ffffff"));
  });

  it("expands 3-digit hex", () => {
    expect(deriveAccentHover("#049")).toBe(deriveAccentHover("#004499"));
  });
});

describe("paletteToTheme", () => {
  it("returns null for an empty palette", () => {
    expect(paletteToTheme([])).toBeNull();
  });

  it("takes the dominant colour as the accent and marks the theme extracted", () => {
    expect(paletteToTheme(["#7a1f3d", "#1ec81e"])).toEqual({
      accent: "#7a1f3d",
      accentHover: "#8a3a54",
      source: "extracted",
    });
  });

  it("leaves surface, surfaceElevated and textPrimary to rialto's stock values", () => {
    const theme = paletteToTheme(["#7a1f3d"]);
    expect(theme?.surface).toBeUndefined();
    expect(theme?.surfaceElevated).toBeUndefined();
    expect(theme?.textPrimary).toBeUndefined();
  });

  it("is judged by the contrast gate exactly as a manual palette is", () => {
    const readable = paletteToTheme(["#7a1f3d"]);
    expect(readable && checkThemeContrast(readable).ok).toBe(true);
    const unreadable = paletteToTheme(["#808080"]);
    expect(unreadable && checkThemeContrast(unreadable)).toEqual(
      checkThemeContrast({ accent: "#808080", accentHover: "#888888", source: "manual" })
    );
  });

  it("is rejected by parseVenueTheme when the logo's colours are unreadable", () => {
    expect(parseVenueTheme({ theme: paletteToTheme(["#808080"]) })).toBeNull();
  });
});
