/** The relationship diagram's geometry, in SVG user units. A node is a box on a grid cell. */

export const CELL_WIDTH = 112;
export const CELL_HEIGHT = 64;
export const NODE_WIDTH = 94;
export const NODE_HEIGHT = 38;

/** A label longer than this wraps onto two lines inside its box. */
const ONE_LINE_LIMIT = 13;

/** One or two lines: a long label breaks at the space nearest its middle. */
export function labelLines(label: string): readonly string[] {
  if (label.length <= ONE_LINE_LIMIT || !label.includes(" ")) return [label];
  const middle = label.length / 2;
  const breaks = [...label.matchAll(/ /g)].map((m) => m.index);
  const at = breaks.reduce((best, i) =>
    Math.abs(i - middle) < Math.abs(best - middle) ? i : best
  );
  return [label.slice(0, at), label.slice(at + 1)];
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function nodeCenter([column, row]: readonly [number, number]): Point {
  return { x: CELL_WIDTH / 2 + column * CELL_WIDTH, y: CELL_HEIGHT / 2 + row * CELL_HEIGHT };
}

/** Where the line from `from`'s centre to `to`'s centre leaves `from`'s box. */
function edgeOfBox(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.min(
    dx === 0 ? Infinity : NODE_WIDTH / 2 / Math.abs(dx),
    dy === 0 ? Infinity : NODE_HEIGHT / 2 / Math.abs(dy)
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/** An arrow from one box's edge to the other's, so the head lands on the target box. */
export function edgeBetween(
  from: readonly [number, number],
  to: readonly [number, number]
): { readonly start: Point; readonly end: Point } {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  return { start: edgeOfBox(a, b), end: edgeOfBox(b, a) };
}

/** The diagram's size: the grid columns and rows its nodes occupy. */
export function diagramSize(cells: readonly (readonly [number, number])[]): {
  readonly width: number;
  readonly height: number;
} {
  const columns = Math.max(...cells.map(([column]) => column)) + 1;
  const rows = Math.max(...cells.map(([, row]) => row)) + 1;
  return { width: columns * CELL_WIDTH, height: rows * CELL_HEIGHT };
}
