import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/layouts/ShowcaseLayout.module.css"
  ),
  "utf8"
);

describe("ShowcaseLayout modal stacking", () => {
  it("lifts the isolated body above the sticky nav while a dialog overlay is open", () => {
    const rule = /\.body:has\(\[data-rialto-dialog-overlay\]\)\s*\{([^}]+)\}/.exec(css);
    expect(rule?.[1]).toMatch(/z-index:\s*calc\(var\(--rialto-z-sticky\)\s*\+\s*1\)/);
  });
});
