/// <reference types="node" />
/**
 * `.body` is `isolation: isolate`, so a Drawer's fixed z-index never competes
 * with the sticky nav (a sibling of this column). The same lift Dialog uses
 * has to apply while a drawer panel is open, or the title and close button
 * paint under the nav.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ShowcaseLayout drawer stacking", () => {
  const css = readFileSync(path.join(__dirname, "ShowcaseLayout.module.css"), "utf8");

  it("lifts the content column above the sticky nav while a drawer is open", () => {
    const rule = /\.body:has\(\[data-rialto-drawer\]\)\s*\{([^}]+)\}/.exec(css);
    expect(rule?.[1]).toMatch(/z-index:\s*calc\(var\(--rialto-z-sticky\)\s*\+\s*1\)/);
  });
});
