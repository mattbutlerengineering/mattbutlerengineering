/**
 * Signature board (rialto-signature-pass, ux.md § Kill-test board).
 *
 * Five primitive rows, each before and after, across five columns. After cells
 * sit inside the signature palette scope; band cells carry data-surface. Each
 * caption ratio is recomputed here from the token JSON the contrast test reads,
 * so a caption cannot drift from the tested value.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import colors from "../tokens/colors.json";
import darkColors from "../tokens/colors.dark.json";
import surfaces from "../tokens/colors.surfaces.json";
import { contrastRatio, resolveOn } from "../test/contrast";
import { SignatureBoard } from "./SignaturePalette.stories";

const ROWS = ["Button", "Input", "Select", "Card", "Tabs"];
const COLUMNS = ["light-canvas", "light-tinted", "velvet", "dark-canvas"];

type Flat = Record<string, string>;

/** Semantic token name (without --rialto-) → value, for one board column. */
function columnTokens(column: string): Flat {
  const theme = column.startsWith("dark") ? "dark" : "light";
  const source = theme === "dark" ? darkColors : colors;
  const c = source.color;
  const base: Flat = {
    surface: c.surface.default.$value,
    "surface-elevated": c.surface.elevated.$value,
    "surface-recessed": c.surface.recessed.$value,
    "surface-tinted": c.surface.tinted.$value,
    "text-primary": c.text.primary.$value,
    "text-secondary": c.text.secondary.$value,
    "text-tertiary": c.text.tertiary.$value,
    error: c.semantic.error.default.$value,
    plum: c.plum.default.$value,
    "plum-muted": c.plum.muted.$value,
    "focus-ring": c.focus.ring.$value,
    "focus-gap": c.focus.gap.$value,
  };
  const scope = column === "light-tinted" ? "tinted" : column === "velvet" ? "velvet" : undefined;
  if (scope === undefined) return base;
  const scoped = (
    surfaces["surface-scope"] as Record<string, Record<string, Record<string, { $value: string }>>>
  )[scope]![theme]!;
  return { ...base, ...Object.fromEntries(Object.entries(scoped).map(([k, v]) => [k, v.$value])) };
}

describe("SignatureBoard", () => {
  it("renders five rows across four columns, with no scope attribute", () => {
    const { container } = render(<SignatureBoard />);
    const rows = screen.getAllByTestId(/^row-/);
    expect(rows.map((r) => r.dataset.row)).toEqual(ROWS);
    for (const row of rows) {
      const cells = within(row).getAllByTestId(/^cell-/);
      expect(cells.map((cell) => cell.dataset.column)).toEqual(COLUMNS);
    }
    expect(container.querySelector("[data-palette]")).toBeNull();
  });

  it("puts every band cell on its surface", () => {
    render(<SignatureBoard />);
    const cells = screen.getAllByTestId(/^cell-/);
    expect(cells).toHaveLength(ROWS.length * COLUMNS.length);
    for (const cell of cells) {
      const column = cell.dataset.column as string;
      const expectedSurface =
        column === "light-tinted" ? "tinted" : column === "velvet" ? "velvet" : null;
      const band = cell.querySelector("[data-surface]");
      expect(band?.getAttribute("data-surface") ?? null, column).toBe(expectedSurface);
    }
  });

  it("shows an invalid Input on velvet, legible through the velvet error red", () => {
    render(<SignatureBoard />);
    const cell = within(screen.getByTestId("row-Input")).getByTestId("cell-velvet");
    expect(within(cell).getByText("Too short")).toBeTruthy();
  });

  it("captions each row's contrast-critical pairs with ratios computed from the token JSON", () => {
    render(<SignatureBoard />);
    const pairs = screen.getAllByTestId("pair");
    // At least one pair per row and column.
    expect(pairs.length).toBeGreaterThanOrEqual(ROWS.length * COLUMNS.length);
    for (const pair of pairs) {
      const { column, fg, bg, min } = pair.dataset as Record<string, string>;
      const tokens = columnTokens(column as string);
      const bgValue = tokens[bg as string];
      const fgValue = tokens[fg as string];
      expect(bgValue, `${column} ${bg}`).toBeDefined();
      expect(fgValue, `${column} ${fg}`).toBeDefined();
      const bgHex = resolveOn(bgValue as string, tokens["surface"] as string);
      const ratio = contrastRatio(resolveOn(fgValue as string, bgHex), bgHex);
      expect(pair.textContent).toContain(`${ratio.toFixed(2)}:1`);
      expect(ratio, `${column} ${fg}/${bg}`).toBeGreaterThanOrEqual(Number(min));
    }
  });

  it("anchors a known value: plum secondary text on light elevated is 8.44:1", () => {
    render(<SignatureBoard />);
    const row = screen.getByTestId("row-Button");
    const pair = within(row)
      .getAllByTestId("pair")
      .find((p) => p.dataset.column === "light-canvas" && p.dataset.fg === "plum");
    expect(pair?.textContent).toContain("8.44:1");
  });
});
