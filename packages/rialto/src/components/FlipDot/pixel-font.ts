/**
 * 5x7 pixel font for flip-dot displays.
 *
 * Each character is stored as 7 numbers (one per row), where each number
 * is a 5-bit bitmask. Bit 4 (0b10000) = leftmost column, bit 0 = rightmost.
 *
 * Standard dot-matrix format matching real flip-dot / LED signage hardware.
 */

const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 7;

/** 5x7 bitmask font — printable ASCII subset. */
const FONT: Record<string, readonly number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  ":": [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  ";": [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0b00000, 0b00100],
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "+": [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  "=": [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  '"': [0b01010, 0b01010, 0b10100, 0b00000, 0b00000, 0b00000, 0b00000],
  "@": [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01110],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  "$": [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  "%": [0b11001, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b10011],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "*": [0b00000, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0b00000],
  _: [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
  "<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  ">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  "[": [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  "]": [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  "{": [0b00110, 0b01000, 0b01000, 0b11000, 0b01000, 0b01000, 0b00110],
  "}": [0b01100, 0b00010, 0b00010, 0b00011, 0b00010, 0b00010, 0b01100],
};

/** Decode a bitmask row into a boolean array of `CHAR_WIDTH` columns. */
function decodeBitmaskRow(mask: number): boolean[] {
  const row: boolean[] = [];
  for (let bit = CHAR_WIDTH - 1; bit >= 0; bit--) {
    row.push(((mask >> bit) & 1) === 1);
  }
  return row;
}

/** Convert a single character to a 7x5 boolean matrix. Unknown chars render blank. */
export function charToMatrix(char: string): readonly (readonly boolean[])[] {
  const upper = char.toUpperCase();
  const bitmasks = FONT[upper] ?? FONT[" "]!;
  return bitmasks.map(decodeBitmaskRow);
}

export interface TextToMatrixOptions {
  /** Columns of empty space between characters. Default 1. */
  letterSpacing?: number;
  /** Target row count — vertically centers the text if taller than 7. */
  rows?: number;
  /** Target column count — pads or truncates horizontally. */
  cols?: number;
  /** Horizontal alignment when cols is specified. Default "start". */
  align?: "start" | "center" | "end";
}

/**
 * Convert a text string into a boolean dot matrix using the 5x7 pixel font.
 *
 * Each character occupies 5 columns; `letterSpacing` empty columns separate them.
 * The result is always `CHAR_HEIGHT` (7) rows tall unless `rows` is specified.
 */
export function textToMatrix(
  text: string,
  options: TextToMatrixOptions = {},
): readonly (readonly boolean[])[] {
  const { letterSpacing = 1, rows, cols, align = "start" } = options;

  if (text.length === 0) {
    const h = rows ?? CHAR_HEIGHT;
    const w = cols ?? 0;
    return createEmptyMatrix(h, w);
  }

  // Build raw character matrices
  const charMatrices = [...text].map(charToMatrix);

  // Calculate total width
  const rawWidth =
    charMatrices.length * CHAR_WIDTH +
    (charMatrices.length - 1) * letterSpacing;

  // Compose into a single matrix (CHAR_HEIGHT rows)
  const composed: boolean[][] = Array.from({ length: CHAR_HEIGHT }, () =>
    Array<boolean>(rawWidth).fill(false),
  );

  let colOffset = 0;
  for (const charMatrix of charMatrices) {
    for (let row = 0; row < CHAR_HEIGHT; row++) {
      for (let col = 0; col < CHAR_WIDTH; col++) {
        composed[row]![colOffset + col] = charMatrix[row]![col]!;
      }
    }
    colOffset += CHAR_WIDTH + letterSpacing;
  }

  // Apply vertical centering if rows > CHAR_HEIGHT
  let result: boolean[][];
  const targetRows = rows ?? CHAR_HEIGHT;
  if (targetRows > CHAR_HEIGHT) {
    const topPad = Math.floor((targetRows - CHAR_HEIGHT) / 2);
    result = Array.from({ length: targetRows }, (_, r) => {
      const srcRow = r - topPad;
      if (srcRow >= 0 && srcRow < CHAR_HEIGHT) {
        return composed[srcRow]!;
      }
      return Array<boolean>(rawWidth).fill(false);
    });
  } else {
    result = composed;
  }

  // Apply horizontal alignment if cols specified
  if (cols !== undefined) {
    const currentWidth = result[0]?.length ?? 0;
    if (currentWidth < cols) {
      const pad = cols - currentWidth;
      const leftPad =
        align === "center"
          ? Math.floor(pad / 2)
          : align === "end"
            ? pad
            : 0;
      result = result.map((row) => [
        ...Array<boolean>(leftPad).fill(false),
        ...row,
        ...Array<boolean>(pad - leftPad).fill(false),
      ]);
    } else if (currentWidth > cols) {
      result = result.map((row) => row.slice(0, cols));
    }
  }

  return result;
}

/** Create a matrix of all-false (off) dots. */
export function createEmptyMatrix(
  rows: number,
  cols: number,
): readonly (readonly boolean[])[] {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
}

/**
 * Immutably overlay `source` onto `target` at the given offset.
 * Returns a new matrix — neither input is mutated.
 */
export function mergeMatrices(
  target: readonly (readonly boolean[])[],
  source: readonly (readonly boolean[])[],
  offsetRow: number,
  offsetCol: number,
): readonly (readonly boolean[])[] {
  return target.map((row, r) => {
    const srcRow = r - offsetRow;
    if (srcRow < 0 || srcRow >= source.length) return row;
    return row.map((dot, c) => {
      const srcCol = c - offsetCol;
      if (srcCol < 0 || srcCol >= source[srcRow]!.length) return dot;
      return dot || source[srcRow]![srcCol]!;
    });
  });
}
