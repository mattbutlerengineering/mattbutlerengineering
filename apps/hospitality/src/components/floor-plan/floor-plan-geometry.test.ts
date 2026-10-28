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
  seatSize,
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

    describe("stored footprint (#7847)", () => {
      it("spreads a long table's seats across its real 140 width", () => {
        const placements = seatPlacements({
          shape: "rectangle",
          capacity: 8,
          width: 140,
          height: 60,
        });
        const top = placements.filter((seat) => seat.rotation === 180);
        expect(top.map((seat) => seat.x)).toEqual([-23.333, 23.333]);
        expect(top.every((seat) => seat.y === -(30 + SEAT_GAP))).toBe(true);
        const right = placements.filter((seat) => seat.rotation === 270);
        expect(right.every((seat) => seat.x === 70 + SEAT_GAP)).toBe(true);
      });

      it("keeps default-size output unchanged when no footprint is given", () => {
        const { width, height } = SHAPE_DEFAULTS.rectangle;
        expect(seatPlacements({ shape: "rectangle", capacity: 6 })).toEqual(
          seatPlacements({ shape: "rectangle", capacity: 6, width, height })
        );
      });

      it("sizes a round table's seat ring from the stored diameter", () => {
        const [seat] = seatPlacements({ shape: "circle", capacity: 1, width: 100, height: 100 });
        expect(seat?.y).toBe(-(50 + SEAT_GAP));
      });

      it("never overlaps seats on a sized table", () => {
        const cases = [
          { shape: "rectangle", capacity: 8, width: 140, height: 60 },
          { shape: "rectangle", capacity: 12, width: 200, height: 80 },
          { shape: "square", capacity: 8, width: 100, height: 100 },
          { shape: "circle", capacity: 12, width: 110, height: 110 },
        ] as const;
        for (const input of cases) {
          const size = seatSize(input.capacity);
          const seats = seatPlacements(input);
          seats.forEach((a, i) => {
            seats.slice(i + 1).forEach((b) => {
              // Seat art is size.width x size.height unrotated; side seats are turned 90deg.
              const half = (r: number) =>
                r === 90 || r === 270
                  ? { w: size.height / 2, h: size.width / 2 }
                  : { w: size.width / 2, h: size.height / 2 };
              // Circle seats are rotated by arbitrary angles; use the bounding circle.
              const ha =
                input.shape === "circle"
                  ? { w: size.width / 2, h: size.width / 2 }
                  : half(a.rotation);
              const hb =
                input.shape === "circle"
                  ? { w: size.width / 2, h: size.width / 2 }
                  : half(b.rotation);
              const separated =
                Math.abs(a.x - b.x) >= ha.w + hb.w || Math.abs(a.y - b.y) >= ha.h + hb.h;
              expect(separated).toBe(true);
            });
          });
        }
      });
    });

    describe("seatSize", () => {
      it("uses the full chair up to a six-top", () => {
        expect(seatSize(2)).toEqual({ width: 16, height: 13 });
        expect(seatSize(6)).toEqual({ width: 16, height: 13 });
      });

      it("eases to the small chair at twelve and above", () => {
        expect(seatSize(12)).toEqual({ width: 13, height: 11 });
        expect(seatSize(20)).toEqual({ width: 13, height: 11 });
      });

      it("shrinks monotonically between 6 and 12", () => {
        const w = [6, 7, 8, 9, 10, 11, 12].map((c) => seatSize(c).width);
        expect(w).toEqual([...w].sort((a, b) => b - a));
        expect(seatSize(9).width).toBeLessThan(16);
        expect(seatSize(9).width).toBeGreaterThan(13);
      });

      it("makes a 2-top and a 12-top chair differ", () => {
        expect(seatSize(2)).not.toEqual(seatSize(12));
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
