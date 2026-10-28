import { describe, it, expect } from "vitest";
import {
  SHAPE_DEFAULTS,
  fittedSeatSize,
  seatPlacements,
  type TableShapeName,
} from "./floor-plan-geometry.js";
import {
  LABEL_MIN_SCREEN_PX,
  counterRotation,
  tableLabelLayout,
  type TableLabelInput,
} from "./table-label-layout.js";

/** The stage scale at a 375px viewport on the default 800px-wide plan. */
const PHONE_SCALE = 375 / 800;
/** The stage scale at a 375px viewport on a 2000px-wide plan. */
const LARGE_PLAN_SCALE = 375 / 2000;
const ROTATIONS = [0, 90, 180, 270] as const;
const SCALES = [PHONE_SCALE, LARGE_PLAN_SCALE] as const;

describe("counterRotation", () => {
  it.each([0, 45, 90, 180, 270, 359])("cancels a table rotation of %i degrees", (rotation) => {
    expect(rotation + counterRotation(rotation)).toBe(0);
  });
});

type Point = readonly [number, number];

/** Screen-space corners of every chair, from the real seat placements. */
function chairCorners(input: TableLabelInput): Point[][] {
  const size = {
    shape: input.shape,
    capacity: input.capacity,
    width: input.width,
    height: input.height,
  };
  const chair = fittedSeatSize(size);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const rotate = ([x, y]: Point, deg: number): Point => [
    x * Math.cos(rad(deg)) - y * Math.sin(rad(deg)),
    x * Math.sin(rad(deg)) + y * Math.cos(rad(deg)),
  ];
  return seatPlacements(size).map((seat) => {
    const [cx, cy] = rotate([seat.x, seat.y], input.rotation);
    const total = seat.rotation + input.rotation;
    return (
      [
        [-chair.width / 2, -chair.height / 2],
        [chair.width / 2, -chair.height / 2],
        [chair.width / 2, chair.height / 2],
        [-chair.width / 2, chair.height / 2],
      ] as Point[]
    ).map((corner) => {
      const [dx, dy] = rotate(corner, total);
      return [cx + dx, cy + dy] as Point;
    });
  });
}

/** True when the upright, origin-centred plate overlaps any chair's bounding box. */
function plateHitsChair(input: TableLabelInput, plate: { width: number; height: number }): boolean {
  return chairCorners(input).some((corners) => {
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    return (
      Math.min(...xs) < plate.width / 2 &&
      Math.max(...xs) > -plate.width / 2 &&
      Math.min(...ys) < plate.height / 2 &&
      Math.max(...ys) > -plate.height / 2
    );
  });
}

function inputFor(
  shape: TableShapeName,
  rotation: number,
  stageScale: number,
  overrides: Partial<TableLabelInput> = {}
): TableLabelInput {
  return {
    number: "TBL-12",
    covers: "2-4",
    shape,
    capacity: 4,
    width: SHAPE_DEFAULTS[shape].width,
    height: SHAPE_DEFAULTS[shape].height,
    rotation,
    stageScale,
    ...overrides,
  };
}

describe("tableLabelLayout", () => {
  describe.each(["square", "circle", "rectangle"] as const)("%s table", (shape) => {
    describe.each(SCALES)("at stage scale %f", (scale) => {
      it.each(ROTATIONS)("stays clear of every chair at rotation %i", (rotation) => {
        const input = inputFor(shape, rotation, scale);
        const layout = tableLabelLayout(input);
        expect(layout.width).toBeGreaterThan(0);
        expect(plateHitsChair(input, layout)).toBe(false);
      });

      it.each(ROTATIONS)("keeps the whole number, never truncated, at rotation %i", (rotation) => {
        const layout = tableLabelLayout(inputFor(shape, rotation, scale));
        expect(layout.text.split("\n")[0]).toBe("TBL-12");
        expect(layout.ellipsis).toBe(false);
      });
    });
  });

  it("drops the covers line first when the two-line plate would touch a chair", () => {
    // A 60x60 square on a 2000px plan (scale 0.1875): two lines at the 10px floor hit the chairs.
    const layout = tableLabelLayout(inputFor("square", 0, LARGE_PLAN_SCALE, { number: "T1" }));
    expect(layout.text.split("\n")).toEqual(["T1"]);
  });

  it("keeps both lines at 375px on an 800px plan for a short number on a square", () => {
    const layout = tableLabelLayout(inputFor("square", 0, PHONE_SCALE, { number: "T1" }));
    expect(layout.text.split("\n")).toEqual(["T1", "2-4"]);
    expect(layout.fontSize * PHONE_SCALE).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX);
  });

  it("is at least 10 screen px tall for a short number on the default rectangle at 375px", () => {
    const layout = tableLabelLayout(inputFor("rectangle", 0, PHONE_SCALE, { number: "T1" }));
    expect(layout.fontSize * PHONE_SCALE).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX);
    expect(layout.height * PHONE_SCALE).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX);
  });

  it("shows the covers line when it fits without touching a chair", () => {
    const layout = tableLabelLayout(inputFor("rectangle", 0, 1, { number: "T1" }));
    expect(layout.text).toBe("T1\n2-4");
  });

  it("keeps the font at the base size when zoomed in", () => {
    expect(
      tableLabelLayout(inputFor("rectangle", 0, 2, { number: "T1" })).fontSize
    ).toBeLessThanOrEqual(14);
  });

  describe("with a status glyph in the plate", () => {
    describe.each(["square", "circle", "rectangle"] as const)("%s table", (shape) => {
      describe.each(SCALES)("at stage scale %f", (scale) => {
        it.each(ROTATIONS)("still stays clear of every chair at rotation %i", (rotation) => {
          const input = inputFor(shape, rotation, scale, { glyph: true });
          const layout = tableLabelLayout(input);
          expect(layout.glyphSize).toBeGreaterThan(0);
          expect(plateHitsChair(input, layout)).toBe(false);
        });
      });
    });

    it("reserves a slot for the glyph, left of the text, inside the plate", () => {
      const input = inputFor("rectangle", 0, 1, { number: "T1" });
      const plain = tableLabelLayout(input);
      const withGlyph = tableLabelLayout({ ...input, glyph: true });
      expect(plain.glyphSize).toBe(0);
      expect(plain.glyphSlot).toBe(0);
      expect(withGlyph.glyphSlot).toBeGreaterThan(withGlyph.glyphSize);
      expect(withGlyph.width).toBeCloseTo(plain.width + withGlyph.glyphSlot, 5);
    });

    it("keeps the glyph no taller than the plate's text block", () => {
      const layout = tableLabelLayout(inputFor("rectangle", 0, 1, { glyph: true }));
      expect(layout.glyphSize).toBeLessThanOrEqual(layout.height);
    });

    it("shrinks the glyph with the font when the plate shrinks among the chairs", () => {
      const roomy = tableLabelLayout(inputFor("rectangle", 0, 1, { glyph: true }));
      const tight = tableLabelLayout(inputFor("square", 0, LARGE_PLAN_SCALE, { glyph: true }));
      expect(tight.glyphSize).toBeLessThan(roomy.glyphSize);
    });
  });

  it("bounds a table with no chairs by its own footprint", () => {
    const input = inputFor("rectangle", 90, PHONE_SCALE, {
      capacity: 0,
      number: "Window banquette",
    });
    const layout = tableLabelLayout(input);
    // Rotated 80x60 is 60 wide on screen.
    expect(layout.width).toBeLessThanOrEqual(60);
  });
});
