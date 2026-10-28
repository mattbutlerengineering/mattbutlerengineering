/**
 * Sizing for the plate that carries a table's number and cover range.
 *
 * The plate sits inside the table's rotated group, so it is counter-rotated to
 * stay upright, and it is sized in canvas units from the stage scale so the
 * text stays readable when the plan is shrunk to a phone width.
 *
 * The plate must never cover a chair. Chairs are drawn from the real seat
 * placements (`seatPlacements` / `fittedSeatSize`), rotated with the table, and
 * the plate is shrunk until it clears all of them. Legibility is preferred but
 * does not win: when the 10 screen-px floor would put the plate over a chair,
 * the cover range is dropped first, then the number shrinks below the floor for
 * that table only. Konva measures text on a canvas, which unit tests don't have,
 * so the width is an estimate from the character count.
 */

import {
  fittedSeatSize,
  seatPlacements,
  type SeatPlacementInput,
  type TableShapeName,
} from "./floor-plan-geometry.js";

/** Smallest rendered font size, in screen pixels, when it fits among the chairs. */
export const LABEL_MIN_SCREEN_PX = 10;
/** Largest font size, in canvas units, when there is room. */
const LABEL_MAX_FONT_SIZE = 14;
/** Plate padding in canvas units. */
export const LABEL_PADDING = 2;
/** Line height as a multiple of the font size. */
export const LABEL_LINE_HEIGHT = 1.15;
/** Average glyph advance of the bold label face, as a multiple of the font size. */
const GLYPH_WIDTH_EM = 0.6;
/** Clearance kept between the plate and a chair's outline, in canvas units. */
const CHAIR_CLEARANCE = 0.5;
/** Each shrink step multiplies the font by this; bounded so the loop always ends. */
const SHRINK_FACTOR = 0.92;
const MAX_SHRINK_STEPS = 60;

export interface TableLabelInput {
  number: string;
  covers: string;
  shape: TableShapeName;
  capacity: number;
  /** The table footprint in canvas units (its own, unrotated frame). */
  width: number;
  height: number;
  /** The table group's rotation, in degrees clockwise. */
  rotation: number;
  /** The stage's scale (rendered px per canvas unit). */
  stageScale: number;
}

export interface TableLabelLayout {
  text: string;
  fontSize: number;
  /** Plate size in canvas units, including padding. */
  width: number;
  height: number;
  /** Always false: the number is never ellipsized; the font shrinks instead. */
  ellipsis: false;
}

/** The rotation that cancels a parent group's `rotation`, keeping the label upright. */
export function counterRotation(rotation: number): number {
  return rotation === 0 ? 0 : -rotation;
}

/** An axis-aligned region in screen axes, centred on the table's origin. */
interface Box {
  readonly cx: number;
  readonly cy: number;
  readonly halfW: number;
  readonly halfH: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Screen-axis bounding boxes of every chair once the table group is rotated. */
function chairBoxes(input: TableLabelInput): readonly Box[] {
  const placementInput: SeatPlacementInput = {
    shape: input.shape,
    capacity: input.capacity,
    width: input.width,
    height: input.height,
  };
  const chair = fittedSeatSize(placementInput);
  const tableRad = toRadians(input.rotation);
  return seatPlacements(placementInput).map((seat) => {
    const total = toRadians(seat.rotation + input.rotation);
    return {
      cx: seat.x * Math.cos(tableRad) - seat.y * Math.sin(tableRad),
      cy: seat.x * Math.sin(tableRad) + seat.y * Math.cos(tableRad),
      halfW:
        (chair.width * Math.abs(Math.cos(total)) + chair.height * Math.abs(Math.sin(total))) / 2,
      halfH:
        (chair.width * Math.abs(Math.sin(total)) + chair.height * Math.abs(Math.cos(total))) / 2,
    };
  });
}

/** The table's own bounding box on screen; bounds the plate when there are no chairs to. */
function footprintBox(input: TableLabelInput): Box {
  const rad = toRadians(input.rotation);
  return {
    cx: 0,
    cy: 0,
    halfW: (input.width * Math.abs(Math.cos(rad)) + input.height * Math.abs(Math.sin(rad))) / 2,
    halfH: (input.width * Math.abs(Math.sin(rad)) + input.height * Math.abs(Math.cos(rad))) / 2,
  };
}

function overlapsChair(chair: Box, plateHalfW: number, plateHalfH: number): boolean {
  const gapX = Math.max(0, Math.abs(chair.cx) - chair.halfW - CHAIR_CLEARANCE);
  const gapY = Math.max(0, Math.abs(chair.cy) - chair.halfH - CHAIR_CLEARANCE);
  return gapX < plateHalfW && gapY < plateHalfH;
}

interface Plate {
  text: string;
  fontSize: number;
  width: number;
  height: number;
}

function plateFor(lines: readonly string[], fontSize: number): Plate {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return {
    text: lines.join("\n"),
    fontSize,
    width: longest * GLYPH_WIDTH_EM * fontSize + 2 * LABEL_PADDING,
    height: lines.length * fontSize * LABEL_LINE_HEIGHT + 2 * LABEL_PADDING,
  };
}

export function tableLabelLayout(input: TableLabelInput): TableLabelLayout {
  const chairs = chairBoxes(input);
  const footprint = chairs.length === 0 ? footprintBox(input) : null;
  const clear = (plate: Plate) =>
    chairs.every((chair) => !overlapsChair(chair, plate.width / 2, plate.height / 2)) &&
    (footprint === null ||
      (plate.width / 2 <= footprint.halfW && plate.height / 2 <= footprint.halfH));

  const startFont = Math.max(LABEL_MIN_SCREEN_PX / input.stageScale, LABEL_MAX_FONT_SIZE);
  const full = plateFor([input.number, input.covers], startFont);
  if (clear(full)) return { ...full, ellipsis: false };

  let plate = plateFor([input.number], startFont);
  for (let step = 0; step < MAX_SHRINK_STEPS && !clear(plate); step += 1) {
    plate = plateFor([input.number], plate.fontSize * SHRINK_FACTOR);
  }
  return { ...plate, ellipsis: false };
}
