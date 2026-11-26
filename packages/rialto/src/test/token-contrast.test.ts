/**
 * Token Contrast Test — WCAG AA compliance verification
 *
 * axe-core cannot resolve CSS custom property contrast values in jsdom,
 * so this test is the ONLY reliable way to verify contrast compliance in CI.
 *
 * Both themes are read from the DTCG authoring sources (colors.json,
 * colors.dark.json). src/tokens/colors.css is GENERATED from those same
 * files (scripts/generate-colors-css.ts) and drift-checked by `pnpm
 * regen:check`, so asserting on the JSON asserts on the shipped values.
 *
 * Thresholds:
 *   - Text on surface: 4.5:1 (WCAG AA normal text)
 *   - UI controls on surface: 3:1 (WCAG AA UI components / graphical objects)
 */

import { describe, it, expect } from "vitest";
import colors from "../tokens/colors.json";
import darkColors from "../tokens/colors.dark.json";
import surfaces from "../tokens/colors.surfaces.json";
import { contrastRatio, parseColor, resolveOn } from "./contrast";

// ── Token extraction helpers ──────────────────────────────────────────────────

const surface = colors.color.surface.default.$value;
const surfaceElevated = colors.color.surface.elevated.$value;

const textPrimary = colors.color.text.primary.$value;
const textSecondary = colors.color.text.secondary.$value;
const textTertiary = colors.color.text.tertiary.$value;
const textOnAccent = colors.color["text"]["on-accent"].$value;

const accent = colors.color.accent.default.$value;

const borderDefault = colors.color.border.default.$value;
const borderStrong = colors.color.border.strong.$value;

const error = colors.color.semantic.error.default.$value;
const warning = colors.color.semantic.warning.default.$value;
const success = colors.color.semantic.success.default.$value;

const dark = {
  surface: darkColors.color.surface.default.$value,
  surfaceElevated: darkColors.color.surface.elevated.$value,
  textPrimary: darkColors.color.text.primary.$value,
  textSecondary: darkColors.color.text.secondary.$value,
  textTertiary: darkColors.color.text.tertiary.$value,
  textOnAccent: darkColors.color["text"]["on-accent"].$value,
  accent: darkColors.color.accent.default.$value,
  error: darkColors.color.semantic.error.default.$value,
  warning: darkColors.color.semantic.warning.default.$value,
  success: darkColors.color.semantic.success.default.$value,
  border: darkColors.color.border.default.$value,
  borderStrong: darkColors.color.border.strong.$value,
};

// ── Structural parity ─────────────────────────────────────────────────────────

/** Collect every DTCG leaf path (`a.b.c`) in a token tree. */
function tokenPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [];
  if ("$value" in node) return [prefix];
  const entries: Array<[string, unknown]> = Object.entries(node);
  return entries
    .filter(([key]) => !key.startsWith("$"))
    .flatMap(([key, child]) => tokenPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("Theme parity", () => {
  it("colors.dark.json declares exactly the token paths of colors.json", () => {
    expect(tokenPaths(darkColors).sort()).toEqual(tokenPaths(colors).sort());
  });
});

// ── Light Theme Tests ─────────────────────────────────────────────────────────

describe("Light theme — text on surface (4.5:1 minimum)", () => {
  it("text-primary on surface", () => {
    expect(contrastRatio(textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary on surface", () => {
    expect(contrastRatio(textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary on surface", () => {
    expect(contrastRatio(textTertiary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-primary on surface-elevated", () => {
    expect(contrastRatio(textPrimary, surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary on surface-elevated", () => {
    expect(contrastRatio(textSecondary, surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Light theme — semantic text on surface (4.5:1 minimum)", () => {
  it("error on surface", () => {
    expect(contrastRatio(error, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("warning on surface", () => {
    expect(contrastRatio(warning, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("success on surface", () => {
    expect(contrastRatio(success, surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Light theme — accent text and UI controls", () => {
  it("text-on-accent on accent (4.5:1 minimum)", () => {
    expect(contrastRatio(textOnAccent, accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent as UI control on surface (3:1 minimum)", () => {
    expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("Light theme — border UI controls on surface (3:1 minimum)", () => {
  it("border on surface", () => {
    expect(contrastRatio(borderDefault, surface)).toBeGreaterThanOrEqual(3);
  });

  it("border-strong on surface", () => {
    expect(contrastRatio(borderStrong, surface)).toBeGreaterThanOrEqual(3);
  });

  it("border on surface-elevated", () => {
    expect(contrastRatio(borderDefault, surfaceElevated)).toBeGreaterThanOrEqual(3);
  });
});

// ── Dark Theme Tests ──────────────────────────────────────────────────────────

describe("Dark theme — text on surface (4.5:1 minimum)", () => {
  it("text-primary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textPrimary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-primary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textPrimary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textSecondary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textSecondary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textTertiary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textTertiary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Dark theme — accent text and UI controls", () => {
  it("accent as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.accent, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("text-on-accent on dark accent (4.5:1 minimum)", () => {
    const accentHex = parseColor(dark.accent).hex;
    expect(
      contrastRatio(resolveOn(dark.textOnAccent, accentHex), accentHex)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("border (blended) as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.border, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("border-strong (blended) as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.borderStrong, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("Dark theme — semantic text on dark surface (4.5:1 minimum)", () => {
  it("error on dark surface", () => {
    expect(contrastRatio(resolveOn(dark.error, dark.surface), dark.surface)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("warning on dark surface", () => {
    expect(
      contrastRatio(resolveOn(dark.warning, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("success on dark surface", () => {
    expect(
      contrastRatio(resolveOn(dark.success, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// ── Signature palette (rialto-signature-pass, ADR-035) ─────────────────────────
//
// Every pair in docs/features/rialto-signature-pass/ux.md § Contrast checks,
// in both themes, read from the same JSON sources as the rest of this file.

const THEMES = [
  { name: "light", tokens: colors, mutedAlpha: 0.12 },
  { name: "dark", tokens: darkColors, mutedAlpha: 0.15 },
] as const;

const ACCENT_FAMILIES = ["plum", "verdigris"] as const;

describe.each(THEMES)("Signature accents — $name theme", ({ name, tokens, mutedAlpha }) => {
  const c = tokens.color;
  const grounds = {
    canvas: c.surface.default.$value,
    elevated: c.surface.elevated.$value,
    recessed: c.surface.recessed.$value,
    tinted: c.surface.tinted.$value,
  };

  describe.each(ACCENT_FAMILIES)("%s", (family) => {
    const accentHex = c[family].default.$value;
    const muted = c[family].muted.$value;
    const textOn = c[family]["text-on"].$value;

    it.each(Object.entries(grounds))(`${family} as text on %s (4.5:1)`, (_ground, bg) => {
      expect(contrastRatio(accentHex, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${family}-muted follows the accent-muted recipe (${mutedAlpha * 100}% of the accent)`, () => {
      const { hex, alpha } = parseColor(muted);
      expect(hex).toBe(accentHex);
      expect(alpha).toBe(mutedAlpha);
    });

    it(`${family} as text on its muted tint over canvas (4.5:1)`, () => {
      const tint = resolveOn(muted, grounds.canvas);
      expect(contrastRatio(accentHex, tint)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${family}-text-on on a ${family} fill (4.5:1)`, () => {
      expect(contrastRatio(textOn, accentHex)).toBeGreaterThanOrEqual(4.5);
    });

    it.each([
      ["canvas", grounds.canvas],
      ["tinted", grounds.tinted],
    ])(`${family} as an emphasis ring on %s (3:1)`, (_ground, bg) => {
      expect(contrastRatio(accentHex, bg)).toBeGreaterThanOrEqual(3);
    });
  });

  it(`${name}: the default focus ring clears 3:1 against the default focus gap`, () => {
    expect(contrastRatio(c.focus.ring.$value, c.focus.gap.$value)).toBeGreaterThanOrEqual(3);
  });
});

type ScopeTokens = Record<string, { $value: string }>;
const surfaceScopes = surfaces["surface-scope"] as Record<
  string,
  Record<"light" | "dark", ScopeTokens>
>;

describe.each(Object.keys(surfaceScopes))("Surface scope %s", (scope) => {
  describe.each(["light", "dark"] as const)("%s", (theme) => {
    const t = surfaceScopes[scope]![theme];
    const value = (key: string): string => {
      const token = t[key];
      if (token === undefined) throw new Error(`${scope}.${theme} has no "${key}"`);
      return token.$value;
    };
    const band = value("surface");

    it.each(["text-primary", "text-secondary", "text-tertiary"])(
      "%s on the band (4.5:1)",
      (key) => {
        expect(contrastRatio(resolveOn(value(key), band), band)).toBeGreaterThanOrEqual(4.5);
      }
    );

    it.each(["border", "border-strong"])("%s on the band (3:1)", (key) => {
      expect(contrastRatio(resolveOn(value(key), band), band)).toBeGreaterThanOrEqual(3);
    });

    it("focus ring against the focus gap (3:1)", () => {
      const gap = value("focus-gap");
      expect(contrastRatio(resolveOn(value("focus-ring"), gap), gap)).toBeGreaterThanOrEqual(3);
    });

    it("focus ring against the band (3:1)", () => {
      expect(contrastRatio(resolveOn(value("focus-ring"), band), band)).toBeGreaterThanOrEqual(3);
    });

    it("the band is the palette's surface token for this scope and theme", () => {
      const palette = theme === "light" ? colors : darkColors;
      const surfaceGroup = palette.color.surface as Record<string, { $value: string }>;
      expect(band).toBe(surfaceGroup[scope]?.$value);
    });
  });
});
