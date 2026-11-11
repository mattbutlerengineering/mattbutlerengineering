import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The listbox composes `.glass`, whose dark rule is `rgb(42 39 37 / 0.9)` at
 * the same specificity as a single `[data-theme="dark"] .dropdown` override.
 * Bundle order was letting that fill win, so the short "No results" row showed
 * the page caption through it. jsdom does not apply these stylesheets.
 */
describe("Combobox listbox surface", () => {
  const css = readFileSync(path.join(__dirname, "Combobox.module.css"), "utf8");

  it("paints an opaque elevated surface over the dark glass recipe", () => {
    const rule = /:global\(\[data-theme="dark"\]\) \.dropdown\.dropdown\s*\{([^}]+)\}/.exec(css);
    expect(rule?.[1]).toBeTruthy();
    expect(rule?.[1]).toMatch(/background:\s*var\(--rialto-surface-elevated\)/);
    expect(rule?.[1]).toMatch(/backdrop-filter:\s*none/);
    expect(rule?.[1]).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
