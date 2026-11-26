/**
 * Contrast-critical pairs for the kill-test board captions
 * (rialto-signature-pass, ux.md § Kill-test board). Values come from the DTCG
 * JSON that token-contrast.test.ts reads, through the same formula
 * (src/test/contrast.ts), so a caption cannot drift from the tested value.
 */
import colors from "../tokens/colors.json";
import darkColors from "../tokens/colors.dark.json";
import surfaces from "../tokens/colors.surfaces.json";
import { contrastRatio, resolveOn } from "../test/contrast";

export type BoardSurface = "tinted" | "velvet";

export interface BoardColumn {
  readonly id: string;
  readonly label: string;
  readonly theme: "light" | "dark";
  readonly surface: BoardSurface | null;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: "light-canvas", label: "Light canvas", theme: "light", surface: null },
  { id: "light-tinted", label: "Light tinted", theme: "light", surface: "tinted" },
  { id: "velvet", label: "Velvet", theme: "light", surface: "velvet" },
  { id: "dark-canvas", label: "Dark canvas", theme: "dark", surface: null },
  { id: "dark-tinted", label: "Dark tinted", theme: "dark", surface: "tinted" },
];

export const BOARD_ROWS = ["Button", "Input", "Select", "Card", "Tabs"] as const;
export type BoardRow = (typeof BOARD_ROWS)[number];

/** A caption pair: semantic token names (without `--rialto-`) and the AA floor. */
export interface PairSpec {
  readonly label: string;
  readonly fg: string;
  readonly bg: string;
  readonly min: 3 | 4.5;
}

export interface Pair extends PairSpec {
  readonly ratio: number;
}

type ScopeFile = Record<string, Record<string, Record<string, { $value: string }>>>;

/** Semantic token values a column's content reads: the theme, then the band's scope. */
export function columnTokens(column: BoardColumn): Readonly<Record<string, string>> {
  const c = (column.theme === "dark" ? darkColors : colors).color;
  const base: Record<string, string> = {
    surface: c.surface.default.$value,
    "surface-elevated": c.surface.elevated.$value,
    "surface-recessed": c.surface.recessed.$value,
    "surface-tinted": c.surface.tinted.$value,
    "text-primary": c.text.primary.$value,
    "text-secondary": c.text.secondary.$value,
    "text-tertiary": c.text.tertiary.$value,
    plum: c.plum.default.$value,
    "plum-muted": c.plum.muted.$value,
    "focus-ring": c.focus.ring.$value,
    "focus-gap": c.focus.gap.$value,
  };
  if (column.surface === null) return base;
  const scoped = (surfaces["surface-scope"] as ScopeFile)[column.surface]?.[column.theme] ?? {};
  return {
    ...base,
    ...Object.fromEntries(Object.entries(scoped).map(([key, token]) => [key, token.$value])),
  };
}

/** What each primitive's after cell paints, mirroring component-tokens.css's signature blocks. */
function specs(row: BoardRow, column: BoardColumn): PairSpec[] {
  const focus: PairSpec = { label: "focus ring", fg: "focus-ring", bg: "focus-gap", min: 3 };
  // The Input well: elevated on tinted; on velvet it is the band deepened, so
  // the band is the floor; recessed on canvas.
  const well =
    column.surface === "tinted"
      ? "surface-elevated"
      : column.surface === "velvet"
        ? "surface"
        : "surface-recessed";
  switch (row) {
    case "Button":
      return [
        { label: "secondary text", fg: "plum", bg: "surface-elevated", min: 4.5 },
        { label: "ghost text", fg: "text-secondary", bg: "surface", min: 4.5 },
        focus,
      ];
    case "Input":
    case "Select":
      return [{ label: "text on well", fg: "text-primary", bg: well, min: 4.5 }, focus];
    case "Card": {
      const sheet = column.surface === "velvet" ? "surface" : "surface-elevated";
      return [
        { label: "title", fg: "text-primary", bg: sheet, min: 4.5 },
        { label: "subtitle", fg: "text-secondary", bg: sheet, min: 4.5 },
      ];
    }
    case "Tabs": {
      const track = column.surface === null ? "surface-tinted" : "surface";
      const hover = column.surface === "velvet" ? "text-primary" : "plum";
      return [
        { label: "tab text on track", fg: "text-primary", bg: track, min: 4.5 },
        { label: "hover text", fg: hover, bg: track, min: 4.5 },
      ];
    }
  }
}

export function rowPairs(row: BoardRow, column: BoardColumn): Pair[] {
  const tokens = columnTokens(column);
  const surface = tokens["surface"] as string;
  return specs(row, column).map((spec) => {
    const bg = resolveOn(tokens[spec.bg] as string, surface);
    return { ...spec, ratio: contrastRatio(resolveOn(tokens[spec.fg] as string, bg), bg) };
  });
}
