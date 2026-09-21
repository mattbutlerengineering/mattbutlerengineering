/// <reference types="node" />
// @vitest-environment node
/**
 * Contrast guard — the letter pieces must keep sitting on the token pair whose
 * WCAG AA compliance is already measured.
 *
 * Both letter colours (ink and accent) are painted on the piece face, and
 * `src/test/token-contrast.test.ts` already proves `text-primary on surface`
 * and `error on surface` clear 4.5:1 in BOTH themes. That proof only covers
 * this component while the piece face really is `--rialto-surface` and the two
 * letter colours really are those two tokens.
 *
 * jsdom applies no stylesheet and axe's colour-contrast rule is disabled in
 * this package (it cannot resolve custom properties), so nothing else in CI
 * notices if one of these four locals is re-pointed at a token whose contrast
 * was never measured — the sign would simply go quietly unreadable. This test
 * reads the source CSS and fails on that swap.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const componentDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(componentDir, "Letterboard.module.css"), "utf-8");

/** Read a custom property's declared value out of the sheet. */
function declaredValue(property: string): string | undefined {
  const match = new RegExp(`${property}:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim();
}

describe("Letterboard contrast guard", () => {
  it("paints both letter colours on the measured piece face", () => {
    expect(declaredValue("--lb-piece")).toBe("var(--rialto-surface)");
    expect(declaredValue("--lb-ink")).toBe("var(--rialto-text-primary)");
    expect(declaredValue("--lb-accent")).toBe("var(--rialto-error)");
  });

  it("hardcodes no hue — every painted colour is a token or neutral relief", () => {
    const declarations = [
      ...css.matchAll(/(?:^|[;{])\s*(--[\w-]+|color|background|background-color):([^;}]+)/g),
    ];
    expect(declarations.length).toBeGreaterThan(0);
    for (const [, property, value] of declarations) {
      // Relief shading — a pure black or white alpha wash over whatever token
      // is underneath — carries no hue, so it cannot move a contrast ratio in
      // an unmeasured direction. Anything else must resolve to a token.
      const relief = (value ?? "").replace(/rgb\((?:0 0 0|255 255 255) \/ [\d.]+\)/g, "");
      expect(relief, `${String(property)} must use a token or neutral relief`).not.toMatch(
        /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i
      );
    }
  });
});
