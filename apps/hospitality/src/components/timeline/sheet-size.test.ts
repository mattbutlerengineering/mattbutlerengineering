import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHEET_BLOCK_SIZE, reservationSheetSize } from "./sheet-size.js";

describe("reservationSheetSize", () => {
  it.each([
    ["Birthday celebration", false, "default"],
    ["Birthday celebration", true, "default"],
    [null, true, "default"],
    [null, false, "compact"],
  ] as const)("notes %j, expanded %s → %s", (notes, expanded, size) => {
    expect(reservationSheetSize(notes, expanded)).toBe(size);
  });

  it("stays compact for whitespace-only notes while collapsed", () => {
    expect(reservationSheetSize("   ", false)).toBe("compact");
  });
});

/* ── Rialto Drawer drift guard ─────────────────────────────────────
 * SHEET_BLOCK_SIZE mirrors the bottom Drawer's heights so the grid can keep
 * a selected block clear of the sheet. Read the real rialto source rather
 * than trusting the mirror: if rialto changes a height, this fails.
 *
 * Resolved from `process.cwd()` (vitest runs from apps/hospitality), as in
 * `components/floor-plan/TableShape.test.tsx`.
 */
const DRAWER_CSS_PATH = resolve(
  process.cwd(),
  "../../packages/rialto/src/components/Drawer/Drawer.module.css"
);

function heightOf(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  return block?.match(/(?:^|\s)height:\s*([^;]+);/)?.[1]?.trim();
}

describe("SHEET_BLOCK_SIZE mirrors rialto's bottom Drawer", () => {
  const css = readFileSync(DRAWER_CSS_PATH, "utf-8");

  it("default matches `.bottom`", () => {
    expect(heightOf(css, ".bottom")).toBe(SHEET_BLOCK_SIZE.default);
  });

  it("compact matches `.compact.bottom`", () => {
    expect(heightOf(css, ".compact.bottom")).toBe(SHEET_BLOCK_SIZE.compact);
  });
});
