// @vitest-environment node
/**
 * Coarse-pointer touch-target floor — issue #7734
 *
 * The Drawer close button is 28px, under the 44px minimum for touch (ux.md F7.1).
 * Mouse users keep the compact button; only `(pointer: coarse)` gets the floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "Drawer.module.css");

describe("Drawer close button coarse-pointer touch target", () => {
  it("is 44px square under (pointer: coarse)", () => {
    const css = readFileSync(CSS_PATH, "utf-8");
    const block = css.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/);
    expect(block, "expected an @media (pointer: coarse) block").not.toBeNull();
    const rule = (block?.[1] ?? "").match(/\.close\s*\{([^}]*)\}/);
    expect(rule?.[1] ?? "").toMatch(/width:\s*44px/);
    expect(rule?.[1] ?? "").toMatch(/height:\s*44px/);
  });

  it("keeps the 28px close button outside the coarse-pointer query", () => {
    const css = readFileSync(CSS_PATH, "utf-8").replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
    const rule = css.match(/\.close\s*\{([^}]*)\}/);
    expect(rule?.[1] ?? "").toMatch(/width:\s*28px/);
  });
});
