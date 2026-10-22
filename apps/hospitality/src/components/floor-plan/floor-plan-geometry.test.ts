import { describe, it, expect } from "vitest";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  CANVAS_CENTER,
  SHAPE_DEFAULTS,
  SEAT_GAP,
  MAX_RENDERED_SEATS,
  snapToGrid,
  seatPlacements,
  placeNewTable,
  moveWallEndpoint,
} from "./floor-plan-geometry.js";

describe("floor-plan-geometry", () => {
  describe("constants", () => {
    it("exports CANVAS_WIDTH of 800", () => {
      expect(CANVAS_WIDTH).toBe(800);
    });

    it("exports CANVAS_HEIGHT of 600", () => {
      expect(CANVAS_HEIGHT).toBe(600);
    });

    it("exports GRID_SIZE of 20", () => {
      expect(GRID_SIZE).toBe(20);
    });

    it("derives CANVAS_CENTER from canvas dimensions", () => {
      expect(CANVAS_CENTER).toEqual({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
    });
  });

  describe("SHAPE_DEFAULTS", () => {
    it("rectangle is 80×60", () => {
      expect(SHAPE_DEFAULTS.rectangle).toEqual({ width: 80, height: 60 });
    });

    it("square is 60×60", () => {
      expect(SHAPE_DEFAULTS.square).toEqual({ width: 60, height: 60 });
    });

    it("circle is 70×70 (diameter of radius 35)", () => {
      expect(SHAPE_DEFAULTS.circle).toEqual({ width: 70, height: 70 });
    });
  });

  describe("snapToGrid", () => {
    it("returns zero for zero input", () => {
      expect(snapToGrid(0)).toBe(0);
    });

    it("snaps a value exactly on the grid back to itself", () => {
      expect(snapToGrid(40)).toBe(40);
      expect(snapToGrid(100)).toBe(100);
      expect(snapToGrid(200)).toBe(200);
    });

    it("rounds up when value is past the midpoint", () => {
      // midpoint of [40, 60] is 50 — value of 51 should round to 60
      expect(snapToGrid(51)).toBe(60);
    });

    it("rounds down when value is before the midpoint", () => {
      // midpoint of [40, 60] is 50 — value of 49 should round to 40
      expect(snapToGrid(49)).toBe(40);
    });

    it("rounds to nearest grid line at the midpoint (rounds up)", () => {
      // Math.round(50/20)*20 = Math.round(2.5)*20 = 3*20 = 60
      expect(snapToGrid(50)).toBe(60);
    });

    it("handles negative values", () => {
      // -21 / 20 = -1.05 → Math.round = -1 → -20
      expect(snapToGrid(-21)).toBe(-20);
      // -39 / 20 = -1.95 → Math.round = -2 → -40
      expect(snapToGrid(-39)).toBe(-40);
    });

    it("accepts a custom grid size", () => {
      expect(snapToGrid(37, 10)).toBe(40);
      expect(snapToGrid(34, 10)).toBe(30);
    });
  });

  describe("seatPlacements", () => {
    describe("seat count", () => {
      it.each([1, 2, 3, 4, 6, 8, 11])("places exactly %i seats for that capacity", (capacity) => {
        expect(seatPlacements({ shape: "rectangle", capacity })).toHaveLength(capacity);
        expect(seatPlacements({ shape: "circle", capacity })).toHaveLength(capacity);
      });

      it("places no seats for a capacity of zero", () => {
        expect(seatPlacements({ shape: "rectangle", capacity: 0 })).toEqual([]);
      });

      it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
        "places no seats for the unusable capacity %p",
        (capacity) => {
          expect(seatPlacements({ shape: "circle", capacity })).toEqual([]);
        }
      );

      it("floors a fractional capacity rather than rendering a partial seat", () => {
        expect(seatPlacements({ shape: "circle", capacity: 4.9 })).toHaveLength(4);
      });

      it("caps an implausible capacity at MAX_RENDERED_SEATS", () => {
        expect(seatPlacements({ shape: "circle", capacity: 500 })).toHaveLength(MAX_RENDERED_SEATS);
      });
    });

    describe("circle tables", () => {
      it("spaces every seat evenly on a ring clear of the table edge", () => {
        const placements = seatPlacements({ shape: "circle", capacity: 6 });
        const expectedRadius = SHAPE_DEFAULTS.circle.width / 2 + SEAT_GAP;
        for (const seat of placements) {
          expect(Math.hypot(seat.x, seat.y)).toBeCloseTo(expectedRadius, 1);
        }
      });

      it("starts at the top of the table and runs clockwise", () => {
        const [first, second] = seatPlacements({ shape: "circle", capacity: 4 });
        const radius = SHAPE_DEFAULTS.circle.width / 2 + SEAT_GAP;
        expect(first).toEqual({ x: 0, y: -radius, rotation: 180 });
        expect(second).toEqual({ x: radius, y: 0, rotation: 270 });
      });

      it("honours a custom gap", () => {
        const [seat] = seatPlacements({ shape: "circle", capacity: 1, gap: 20 });
        expect(seat?.y).toBeCloseTo(-(SHAPE_DEFAULTS.circle.width / 2 + 20), 5);
      });
    });

    describe("rectangular tables", () => {
      it("seats a four-top one to a side", () => {
        const placements = seatPlacements({ shape: "rectangle", capacity: 4 });
        const { width, height } = SHAPE_DEFAULTS.rectangle;
        expect(placements).toEqual([
          { x: 0, y: -(height / 2 + SEAT_GAP), rotation: 180 },
          { x: 0, y: height / 2 + SEAT_GAP, rotation: 0 },
          { x: -(width / 2 + SEAT_GAP), y: 0, rotation: 90 },
          { x: width / 2 + SEAT_GAP, y: 0, rotation: 270 },
        ]);
      });

      it("seats a two-top across the long sides, leaving the heads empty", () => {
        const placements = seatPlacements({ shape: "rectangle", capacity: 2 });
        expect(placements.map((seat) => seat.rotation)).toEqual([180, 0]);
        expect(placements.every((seat) => seat.x === 0)).toBe(true);
      });

      it("fills the long sides before returning to the heads for a six-top", () => {
        const placements = seatPlacements({ shape: "square", capacity: 6 });
        const { height } = SHAPE_DEFAULTS.square;
        const top = placements.filter((seat) => seat.y === -(height / 2 + SEAT_GAP));
        const bottom = placements.filter((seat) => seat.y === height / 2 + SEAT_GAP);
        expect(top).toHaveLength(2);
        expect(bottom).toHaveLength(2);
        expect(placements.filter((seat) => seat.rotation === 90)).toHaveLength(1);
        expect(placements.filter((seat) => seat.rotation === 270)).toHaveLength(1);
      });

      it("spaces seats sharing a side symmetrically about the table centre", () => {
        const { width } = SHAPE_DEFAULTS.square;
        // A lone seat on a side sits at the midpoint; a pair sits at the 1/3
        // and 2/3 marks, i.e. ±width/6.
        const lone = seatPlacements({ shape: "square", capacity: 1 });
        expect(lone[0]?.x).toBe(0);
        const pair = seatPlacements({ shape: "square", capacity: 6 }).filter(
          (seat) => seat.rotation === 180
        );
        expect(pair.map((seat) => seat.x)).toEqual([-width / 6, width / 6]);
      });

      it("keeps every seat outside the table footprint", () => {
        const { width, height } = SHAPE_DEFAULTS.rectangle;
        for (const seat of seatPlacements({ shape: "rectangle", capacity: 8 })) {
          const clearsVertically = Math.abs(seat.y) >= height / 2 + SEAT_GAP;
          const clearsHorizontally = Math.abs(seat.x) >= width / 2 + SEAT_GAP;
          expect(clearsVertically || clearsHorizontally).toBe(true);
        }
      });
    });

    describe("purity", () => {
      it("returns a fresh array on every call", () => {
        const first = seatPlacements({ shape: "circle", capacity: 4 });
        const second = seatPlacements({ shape: "circle", capacity: 4 });
        expect(first).not.toBe(second);
        expect(first).toEqual(second);
      });

      it("does not mutate its input", () => {
        const input = { shape: "circle", capacity: 4 } as const;
        const snapshot = { ...input };
        seatPlacements(input);
        expect(input).toEqual(snapshot);
      });
    });
  });
});

describe("placeNewTable", () => {
  const size = { width: 80, height: 60 };

  it.each([
    ["cozy", { width: 800, height: 600 }],
    ["standard", { width: 1200, height: 800 }],
    ["grand", { width: 2000, height: 1200 }],
  ])("centres on an empty %s canvas", (_name, canvas) => {
    expect(placeNewTable(canvas, size, [])).toEqual({ x: canvas.width / 2, y: canvas.height / 2 });
  });

  it("nudges to the nearest free grid cell when the centre is taken", () => {
    const canvas = { width: 1200, height: 800 };
    const taken = [{ x: 600, y: 400, width: 80, height: 60 }];
    const pos = placeNewTable(canvas, size, taken);
    expect(pos).not.toEqual({ x: 600, y: 400 });
    const overlaps = Math.abs(pos.x - 600) < (80 + 80) / 2 && Math.abs(pos.y - 400) < (60 + 60) / 2;
    expect(overlaps).toBe(false);
    expect(pos.x % GRID_SIZE).toBe(0);
    expect(pos.y % GRID_SIZE).toBe(0);
  });
});

describe("moveWallEndpoint on a plan larger than the 800x600 default (#7256)", () => {
  const wall = {
    id: "w1",
    x1: 0,
    y1: 0,
    x2: 2000,
    y2: 0,
    thickness: 8,
    wallType: "wall" as const,
  };

  it("keeps a Grand plan's right perimeter endpoint where it was dragged", () => {
    const moved = moveWallEndpoint(wall, 2, { x: 2000, y: 0 }, GRID_SIZE, {
      width: 2000,
      height: 1200,
    });

    expect(moved.x2).toBe(2000);
  });

  it("still clamps to the plan's own edge, not the default one", () => {
    const moved = moveWallEndpoint(wall, 2, { x: 5000, y: 4000 }, GRID_SIZE, {
      width: 2000,
      height: 1200,
    });

    expect(moved.x2).toBe(2000);
    expect(moved.y2).toBe(1200);
  });

  it("falls back to 800x600 when no canvas is given", () => {
    const moved = moveWallEndpoint(wall, 2, { x: 2000, y: 0 });

    expect(moved.x2).toBe(CANVAS_WIDTH);
  });
});
