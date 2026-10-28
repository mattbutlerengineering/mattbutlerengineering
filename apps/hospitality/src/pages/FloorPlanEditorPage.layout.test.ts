import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_CSS = readFileSync(
  resolve(process.cwd(), "src/pages/FloorPlanEditorPage.module.css"),
  "utf-8"
);
const LEGEND_CSS = readFileSync(
  resolve(process.cwd(), "src/components/floor-plan/TableStatusLegend.module.css"),
  "utf-8"
);

function phoneBlock(css: string): string {
  const start = css.indexOf("@media (max-width: 767px)");
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

function rule(block: string, selector: string): string {
  const match = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(block);
  return match?.[1] ?? "";
}

describe("FloorPlanEditorPage phone layout (375px)", () => {
  const phone = phoneBlock(PAGE_CSS);

  it("stacks the canvas above the side panel below the app's 768px breakpoint", () => {
    expect(rule(phone, "content")).toMatch(/flex-direction:\s*column/);
    expect(rule(phone, "content")).toMatch(/overflow-y:\s*auto/);
  });

  it("gives the canvas and sidebar the full width instead of side-by-side columns", () => {
    expect(rule(phone, "canvasArea")).toMatch(/flex:\s*none/);
    expect(rule(phone, "sidebar")).toMatch(/width:\s*auto/);
    expect(rule(phone, "sidebar")).toMatch(/flex-shrink:\s*0/);
  });

  it("never introduces horizontal scroll", () => {
    expect(phone).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});

describe("TableStatusLegend items never break mid-word", () => {
  it("keeps each item on one line; the list wraps between items", () => {
    expect(rule(LEGEND_CSS, "item")).toMatch(/white-space:\s*nowrap/);
    expect(LEGEND_CSS).toMatch(/\.legend\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(LEGEND_CSS).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});
