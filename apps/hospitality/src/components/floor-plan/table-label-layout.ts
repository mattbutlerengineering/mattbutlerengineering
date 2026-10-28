/**
 * Sizing for the plate that carries a table's number and cover range.
 *
 * The plate sits inside the table's rotated group, so it is counter-rotated to
 * stay upright, and it is sized in canvas units from the stage scale so the
 * text stays readable when the plan is shrunk to a phone width. Konva measures
 * text on a canvas, which is not available to unit tests, so the width is an
 * estimate from the character count; the Text node ellipsizes rather than wraps
 * if the estimate is ever short.
 */

import { SEAT_GAP } from "./floor-plan-geometry.js";

/** Smallest rendered font size, in screen pixels, at any stage scale. */
export const LABEL_MIN_SCREEN_PX = 10;
/** Largest font size, in canvas units, when there is room. */
export const LABEL_MAX_FONT_SIZE = 14;
/** Plate padding in canvas units. */
export const LABEL_PADDING = 2;
/** Line height as a multiple of the font size. */
export const LABEL_LINE_HEIGHT = 1.15;
/** Average glyph advance of the bold label face, as a multiple of the font size. */
const GLYPH_WIDTH_EM = 0.6;

export interface TableLabelInput {
  number: string;
  covers: string;
  /** The table footprint's width in canvas units. */
  tableWidth: number;
  /** The stage's scale (rendered px per canvas unit). */
  stageScale: number;
}

export interface TableLabelLayout {
  text: string;
  fontSize: number;
  /** Plate size in canvas units, including padding. */
  width: number;
  height: number;
}

/** The rotation that cancels a parent group's `rotation`, keeping the label upright. */
export function counterRotation(rotation: number): number {
  return rotation === 0 ? 0 : -rotation;
}

export function tableLabelLayout(input: TableLabelInput): TableLabelLayout {
  const lines = [input.number, input.covers];
  const longest = Math.max(...lines.map((line) => line.length), 1);
  // Seats start SEAT_GAP beyond the table edge; stay clear of them.
  const maxWidth = input.tableWidth + 2 * (SEAT_GAP - 2);
  const fitFont = (maxWidth - 2 * LABEL_PADDING) / (longest * GLYPH_WIDTH_EM);
  const floor = LABEL_MIN_SCREEN_PX / input.stageScale;
  // Legibility wins over fit: the floor applies even if the text no longer fits.
  const fontSize = Math.max(floor, Math.min(LABEL_MAX_FONT_SIZE, fitFont));
  const textWidth = longest * GLYPH_WIDTH_EM * fontSize + 2 * LABEL_PADDING;
  return {
    text: lines.join("\n"),
    fontSize,
    width: Math.min(textWidth, maxWidth),
    height: lines.length * fontSize * LABEL_LINE_HEIGHT + 2 * LABEL_PADDING,
  };
}
