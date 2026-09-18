// @vitest-environment node
/**
 * Coarse-pointer touch-target floor — issue #4989
 *
 * `.sm` Button is 23px tall (padding + font-size, no min-block-size), well
 * under the WCAG 2.5.8 44px minimum target size for touch. Mouse/trackpad
 * users should keep the compact density; only coarse-pointer (touch) devices
 * need the floor, so the rule must live behind `@media (pointer: coarse)`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "Button.module.css");

describe("Button coarse-pointer touch target", () => {
  it("gives the .sm size a 44px min-block-size floor under (pointer: coarse)", () => {
    const css = readFileSync(CSS_PATH, "utf-8");

    const coarsePointerBlock = css.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/);
    expect(
      coarsePointerBlock,
      "expected an @media (pointer: coarse) block in Button.module.css"
    ).not.toBeNull();

    const blockBody = coarsePointerBlock?.[1] ?? "";
    expect(blockBody).toMatch(/\.sm\s*\{[^}]*min-block-size:\s*44px[^}]*\}/);
  });

  it("does not change the .sm rule outside the coarse-pointer query", () => {
    const css = readFileSync(CSS_PATH, "utf-8");
    const withoutMediaQueries = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");

    const smRule = withoutMediaQueries.match(/\.sm\s*\{([^}]*)\}/);
    expect(smRule?.[1] ?? "").not.toMatch(/min-block-size/);
  });
});
