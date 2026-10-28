import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { TableStatusLegend } from "./TableStatusLegend.js";
import { STATUS_GLYPHS, STATUS_GLYPH_KEYS, statusFillToken } from "./table-status-glyph.js";
import type { TableDisplayStatus } from "./table-status.js";

// jsdom cannot compute colour contrast; token-level contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const STATUSES = new Map<string, TableDisplayStatus>([["t1", "available"]]);
const CSS = readFileSync(
  resolve(process.cwd(), "src/components/floor-plan/TableStatusLegend.module.css"),
  "utf-8"
);

function renderLegend() {
  return render(
    <main>
      <TableStatusLegend statuses={STATUSES} />
    </main>
  );
}

describe("TableStatusLegend", () => {
  it("renders nothing when no statuses are supplied (editor-only usage)", () => {
    const { container } = render(<TableStatusLegend statuses={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the four statuses and Inactive by name", () => {
    renderLegend();
    const list = screen.getByRole("list", { name: "Table status" });
    const names = within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(names).toEqual(["Available", "Reserved soon", "Seated", "Needs bussing", "Inactive"]);
  });

  it("draws, for each entry, the same glyph path and swatch token the canvas uses", () => {
    renderLegend();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    STATUS_GLYPH_KEYS.forEach((key, index) => {
      const item = items[index]!;
      expect(item.querySelector("path")?.getAttribute("d")).toBe(STATUS_GLYPHS[key].path);
      expect(item.querySelector("[data-swatch]")?.getAttribute("style")).toContain(
        statusFillToken(key)
      );
    });
  });

  it("hides the swatches and glyphs from assistive tech, so each status is read once", () => {
    renderLegend();
    const list = screen.getByRole("list");
    for (const node of list.querySelectorAll("svg, [data-swatch]")) {
      expect(node.closest("[aria-hidden=true]")).not.toBeNull();
    }
  });

  it.each(["light", "dark"] as const)("has zero axe violations in %s", async (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    const { container } = renderLegend();
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations).toEqual([]);
    document.documentElement.removeAttribute("data-theme");
  });

  describe("stylesheet", () => {
    it("uses only var(--rialto-*) colours: no hex, rgb or hsl literals", () => {
      expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
    });

    it("wraps at narrow widths without horizontal scroll", () => {
      expect(CSS).toMatch(/flex-wrap:\s*wrap/);
      expect(CSS).not.toMatch(/overflow-x:\s*(auto|scroll)/);
      expect(CSS).not.toMatch(/white-space:\s*nowrap/);
      // No fixed pixel width on the strip that could exceed a 375px viewport.
      expect(CSS).not.toMatch(/(^|[^-])(min-)?width:\s*\d+px/m);
    });
  });
});
