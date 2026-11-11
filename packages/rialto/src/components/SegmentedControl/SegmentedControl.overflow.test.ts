/**
 * Segments are nowrap. The large "Segment A / B / C" control is wider than a
 * 375px column, and the overflow widened the page. The track scrolls only
 * once the segments exceed it, so a fitting control keeps its focus glow.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SegmentedControl narrow-column overflow", () => {
  const css = readFileSync(path.join(__dirname, "SegmentedControl.module.css"), "utf8");
  const source = readFileSync(path.join(__dirname, "SegmentedControl.tsx"), "utf8");

  it("scrolls the track only once the segments exceed the column", () => {
    const container = /\.container\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(container).toMatch(/min-inline-size:\s*0/);
    expect(container).toMatch(/max-inline-size:\s*100%/);
    const track = /\.track\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(track).toMatch(/min-inline-size:\s*0/);
    expect(css).toMatch(/\.track\[data-overflowing="true"\]\s*\{[^}]*overflow-x:\s*auto/);
    expect(source).toMatch(/dataset\.overflowing/);
    expect(source).toMatch(/scrollWidth\s*>\s*container\.clientWidth/);
    expect(source).toMatch(/scrollLeft/);
  });
});
