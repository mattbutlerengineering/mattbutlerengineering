// @vitest-environment node
/**
 * jsdom applies no stylesheet, so this reads the source CSS: the open menu must
 * be opaque in every theme, not only dark (#6866). The `glass` surface it
 * composes is translucent, so the base `.menu` rule has to override it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "DropdownMenu.module.css"),
  "utf-8"
);

describe("DropdownMenu surface", () => {
  it("sets an opaque elevated background that out-ranks the composed glass (all themes)", () => {
    const rule = /^\.wrapper \.menu\s*\{([^}]*)\}/m.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--rialto-surface-elevated\)/);
  });
});
