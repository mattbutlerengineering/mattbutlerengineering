/**
 * Letterboard text model — the pure half of the component.
 *
 * A physical letterboard holds one moulded piece per character, and each piece
 * is either an ink (black) or an accent (red) letter. These helpers cut the
 * declarative line model the consumer writes into exactly that: a flat list of
 * pieces the renderer slots into a ridge, one at a time.
 */

/** A run of characters that shares one colour. */
export interface LetterboardSegment {
  /** The characters of the run. */
  readonly text: string;
  /** Slot this run's pieces as accent (red) letters. @default false */
  readonly accent?: boolean;
}

/**
 * One row of the board: a plain string for an all-ink row, or coloured runs
 * when some of its letters are red.
 */
export type LetterboardLine = string | readonly LetterboardSegment[];

/** One letter piece — or the bare ridge a space leaves behind. */
export interface LetterboardTile {
  /** The upper-cased glyph moulded on the piece. */
  readonly char: string;
  /** True for an accent (red) piece. */
  readonly accent: boolean;
  /** True when the character is whitespace: no piece, just ridge. */
  readonly empty: boolean;
}

/** Normalize either line form to the segment form. */
export function toSegments(line: LetterboardLine): readonly LetterboardSegment[] {
  return typeof line === "string" ? [{ text: line }] : line;
}

/** Cut a line into the letter pieces the board slots in, in reading order. */
export function toTiles(line: LetterboardLine): readonly LetterboardTile[] {
  return toSegments(line).flatMap((segment) =>
    [...segment.text].map((char) => ({
      char: char.toUpperCase(),
      accent: segment.accent === true,
      empty: char.trim() === "",
    }))
  );
}
