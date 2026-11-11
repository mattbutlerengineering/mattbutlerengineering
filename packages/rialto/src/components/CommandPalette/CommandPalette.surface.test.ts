/**
 * The panel composes `.glass`. The dark glass fill is `rgb(42 39 37 / 0.9)` at
 * the same specificity as a single `[data-theme="dark"] .panel` override, so
 * bundle order was letting the page title show through "No results found".
 * jsdom does not apply these stylesheets.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Command palette dark surface", () => {
  const css = readFileSync(path.join(__dirname, "CommandPalette.module.css"), "utf8");

  it("paints an opaque elevated surface over the dark glass recipe", () => {
    const rule = /:global\(\[data-theme="dark"\]\) \.panel\.panel\s*\{([^}]+)\}/.exec(css);
    expect(rule?.[1]).toBeTruthy();
    expect(rule?.[1]).toMatch(/background:\s*var\(--rialto-surface-elevated\)/);
    expect(rule?.[1]).toMatch(/backdrop-filter:\s*none/);
    expect(rule?.[1]).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
