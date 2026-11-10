/**
 * A tab row wider than its column must scroll inside the tab list.
 * Overflow on the list is what keeps focus from sliding the page sideways,
 * and the gold indicator has to use layout coordinates so it stays under
 * the active tab once that list scrolls.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(dir, "Tabs.module.css"), "utf8");
const source = readFileSync(resolve(dir, "Tabs.tsx"), "utf8");

describe("Tabs narrow-column overflow", () => {
  it("scrolls the tab list only once its labels exceed the row", () => {
    expect(css).toMatch(/\.root\s*\{[^}]*min-inline-size:\s*0/);
    expect(css).toMatch(/\.tabList\[data-overflowing="true"\]\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(
      /\.tabList\[data-overflowing="true"\]\s*\{[^}]*overscroll-behavior-x:\s*contain/
    );
    expect(source).toMatch(/dataset\.overflowing/);
    expect(source).toMatch(/scrollWidth\s*>\s*list\.clientWidth/);
    expect(source).toMatch(/scrollIntoView\(\{ inline: "nearest", block: "nearest" \}\)/);
  });

  it("places the indicator with layout offsets so a scrolled list stays aligned", () => {
    expect(source).toMatch(/offsetLeft/);
    expect(source).toMatch(/offsetWidth/);
    expect(source).not.toMatch(/getBoundingClientRect/);
  });
});
