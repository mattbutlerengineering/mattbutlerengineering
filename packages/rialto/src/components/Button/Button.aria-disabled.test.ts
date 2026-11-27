// @vitest-environment node
/**
 * A Button that stays focusable while pending (aria-disabled, not native
 * disabled) must look disabled too — issue #9941.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "Button.module.css");

describe("Button aria-disabled styling", () => {
  it("shares the :disabled rule with .button[aria-disabled='true']", () => {
    const css = readFileSync(CSS_PATH, "utf-8");
    const match = css.match(/\.button:disabled,\s*\.button\[aria-disabled="true"\]\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("cursor: not-allowed");
    expect(match![1]).toContain("filter: saturate(0.6) brightness(0.95)");
  });
});
