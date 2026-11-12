import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The listbox composes `.glass` (`rgb(253 252 250 / 0.85)`, and
 * `rgb(42 39 37 / 0.9)` in dark) at the same specificity as a single
 * `[data-theme] .dropdown` override. On the portaled menu backdrop-filter
 * computes to none, so the form behind the options shows through. jsdom
 * does not apply these stylesheets.
 */
describe("Select listbox surface", () => {
  const css = readFileSync(path.join(__dirname, "Select.module.css"), "utf8");

  it("paints an opaque elevated surface over the glass recipe in both themes", () => {
    const rule =
      /\.dropdown\.dropdown,\s*:global\(\[data-theme="dark"\]\) \.dropdown\.dropdown\s*\{([^}]+)\}/.exec(
        css
      );
    expect(rule?.[1]).toBeTruthy();
    expect(rule?.[1]).toMatch(/background:\s*var\(--rialto-surface-elevated\)/);
    expect(rule?.[1]).toMatch(/backdrop-filter:\s*none/);
    expect(rule?.[1]).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
