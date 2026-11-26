/// <reference types="node" />
// @vitest-environment node
/**
 * The document's scroll-behavior is the native path for hash jumps (the skip
 * link, in-page anchors). Route changes override it in `useScrollToTop` with
 * an instant jump. This file pins the stylesheet those hash jumps inherit.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "global.css"), "utf8");

describe("document scroll behavior", () => {
  it("smooth-scrolls hash jumps when the visitor has no motion preference", () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth\s*;/);
  });

  it("cancels smooth scrolling under prefers-reduced-motion", () => {
    const reduced = css.match(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*)/
    )?.[1];
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(/scroll-behavior:\s*auto\s*;/);
  });
});
