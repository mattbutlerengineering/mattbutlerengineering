import { describe, it, expect, afterEach } from "vitest";
import { parseCssColor, readFactoryPalette } from "./factory-palette.js";

const FALLBACK = [0.5, 0.5, 0.5] as const;

describe("parseCssColor", () => {
  it("reads six-digit hex, the light theme's token format", () => {
    expect(parseCssColor("#b0841e", FALLBACK)).toEqual([176 / 255, 132 / 255, 30 / 255]);
  });

  it("reads shorthand hex", () => {
    expect(parseCssColor("#fff", FALLBACK)).toEqual([1, 1, 1]);
  });

  it("reads eight-digit hex — what Chrome normalises the dark theme's tokens to", () => {
    // `rgb(253 252 250 / 0.92)` in colors.css comes back from getComputedStyle
    // as `#fdfcfaeb`. Missing this case paints the scene near-black on a dark
    // background, i.e. invisible.
    const [r, g, b] = parseCssColor("#fdfcfaeb", FALLBACK);
    expect(r).toBeCloseTo(253 / 255, 5);
    expect(g).toBeCloseTo(252 / 255, 5);
    expect(b).toBeCloseTo(250 / 255, 5);
  });

  it("reads four-digit hex", () => {
    expect(parseCssColor("#fff8", FALLBACK)).toEqual([1, 1, 1]);
  });

  it("reads space-separated rgb with an alpha slash, the dark theme's token format", () => {
    const [r, g, b] = parseCssColor("rgb(253 252 250 / 0.92)", FALLBACK);
    expect(r).toBeCloseTo(253 / 255, 5);
    expect(g).toBeCloseTo(252 / 255, 5);
    expect(b).toBeCloseTo(250 / 255, 5);
  });

  it("reads legacy comma-separated rgb", () => {
    expect(parseCssColor("rgb(176, 132, 30)", FALLBACK)).toEqual([176 / 255, 132 / 255, 30 / 255]);
  });

  it("tolerates surrounding whitespace from getPropertyValue", () => {
    expect(parseCssColor("  #b0841e  ", FALLBACK)).toEqual([176 / 255, 132 / 255, 30 / 255]);
  });

  it("falls back when the custom property is unset or unreadable", () => {
    expect(parseCssColor("", FALLBACK)).toEqual(FALLBACK);
    expect(parseCssColor("color-mix(in srgb, red, blue)", FALLBACK)).toEqual(FALLBACK);
  });
});

describe("readFactoryPalette", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  it("resolves every channel the scene paints with, even with no tokens loaded", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const palette = readFactoryPalette(host);

    for (const channel of [
      palette.surface,
      palette.line,
      palette.accent,
      palette.pass,
      palette.fail,
    ]) {
      expect(channel).toHaveLength(3);
      for (const component of channel) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reports the theme of the nearest scope so a nested sample paints itself", () => {
    const scope = document.createElement("div");
    scope.setAttribute("data-theme", "dark");
    const host = document.createElement("div");
    scope.append(host);
    document.body.append(scope);

    expect(readFactoryPalette(host).isDark).toBe(true);
    expect(readFactoryPalette(document.body).isDark).toBe(false);
  });
});
