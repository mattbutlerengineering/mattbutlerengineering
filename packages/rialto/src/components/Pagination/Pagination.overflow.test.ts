/**
 * A page row wider than its column was overflowing the card and the viewport.
 * Overflow stays visible while the buttons fit, so the focus glow is not
 * clipped. Once they don't, the nav itself scrolls.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Pagination narrow-column overflow", () => {
  const css = readFileSync(path.join(__dirname, "Pagination.module.css"), "utf8");
  const source = readFileSync(path.join(__dirname, "Pagination.tsx"), "utf8");

  it("scrolls the page row only once the buttons exceed the column", () => {
    const nav = /\.pagination\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(nav).toMatch(/min-inline-size:\s*0/);
    expect(nav).toMatch(/max-inline-size:\s*100%/);
    expect(css).toMatch(/\.pagination\[data-overflowing="true"\]\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(
      /\.pagination\[data-overflowing="true"\]\s*\{[^}]*overscroll-behavior-x:\s*contain/
    );
    expect(source).toMatch(/dataset\.overflowing/);
    expect(source).toMatch(/scrollWidth\s*>\s*nav\.clientWidth/);
  });
});
