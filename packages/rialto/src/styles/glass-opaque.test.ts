/**
 * `.glass` is composed by every modal and floating panel (Dialog, Popover,
 * menus, listboxes, Toast, Card and AppBar variants). A translucent fill let
 * page content show through each of them, and components patched it one at a
 * time (#9869). The recipe itself must paint an opaque surface in both themes,
 * with no backdrop blur behind a fill that hides it.
 * jsdom does not apply CSS modules, so assert on the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const surfaces = readFileSync(resolve(__dirname, "surfaces.module.css"), "utf8");
const tokens = readFileSync(resolve(__dirname, "../tokens/component-tokens.css"), "utf8");

function ruleBody(css: string, selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? "";
}

const lightGlass = ruleBody(surfaces, /(?:^|\n)\.glass/);
const darkGlass = ruleBody(surfaces, /:global\(\[data-theme="dark"\]\) \.glass/);

describe(".glass surface is opaque", () => {
  it.each([
    ["light", lightGlass],
    ["dark", darkGlass],
  ])("%s theme paints the opaque elevated surface", (_theme, body) => {
    expect(body).toMatch(/background:\s*var\(--rialto-surface-elevated\);/);
  });

  it.each([
    ["light", lightGlass],
    ["dark", darkGlass],
  ])("%s theme has no translucent fill or backdrop blur", (_theme, body) => {
    expect(body).not.toMatch(/background:\s*rgb\([^)]*\/[^)]*\)/);
    expect(body).not.toMatch(/backdrop-filter:\s*blur/);
  });

  it("Card's glass background token is opaque", () => {
    expect(tokens).toMatch(/--rialto-card-glass-bg:\s*var\(--rialto-surface-elevated\);/);
  });
});
