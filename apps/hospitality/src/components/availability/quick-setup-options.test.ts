import { describe, expect, it } from "vitest";
import { weekKey } from "./change-week-draft.js";
import { draftBlock, draftService } from "./quick-setup-demo.fixture.js";
import { DEFAULT_KEPT, type KeptHours, type QuickSetupDraft } from "./quick-setup-draft.js";
import { setServiceKept, shownKept } from "./quick-setup-options.js";

const STORED: KeptHours = { seating: { version: 1, interval: 30 }, bookingTypes: ["phone"] };
const NEXT: KeptHours = { seating: { version: 1, interval: 20 }, bookingTypes: ["phone"] };
const TIMES = ["17:00", "21:00", "22:00"] as const;

describe("shownKept", () => {
  it("answers the values the service carries, the same object", () => {
    expect(shownKept(draftService("d", "Dinner", TIMES, { kept: STORED }))).toBe(STORED);
  });

  it("answers what is stored under the service's name when the service carries none", () => {
    expect(shownKept(draftService("d", "Dinner", TIMES), STORED)).toBe(STORED);
  });

  it("the service's own values win over what is stored under its name", () => {
    expect(shownKept(draftService("d", "Dinner", TIMES, { kept: NEXT }), STORED)).toBe(NEXT);
  });

  it("answers quick setup's defaults when nothing is carried or stored", () => {
    expect(shownKept(draftService("d", "Dinner", TIMES))).toBe(DEFAULT_KEPT);
  });
});

describe("setServiceKept", () => {
  it("writes the service's values", () => {
    const service = draftService("d", "Dinner", TIMES, { kept: STORED });
    expect(setServiceKept(service, NEXT).kept).toEqual(NEXT);
  });

  it("a block that had the service's values takes the new ones", () => {
    const service = draftService("d", "Dinner", TIMES, {
      kept: STORED,
      blocks: [{ ...draftBlock("late", [5, 6], TIMES), kept: STORED }],
    });
    expect(setServiceKept(service, NEXT).blocks.map((b) => b.kept)).toEqual([NEXT]);
  });

  it("a block the form made follows a service that carries no values either", () => {
    const service = draftService("d", "Dinner", TIMES, {
      blocks: [draftBlock("new", [0], TIMES)],
    });
    expect(setServiceKept(service, NEXT, STORED).blocks.map((b) => b.kept)).toEqual([NEXT]);
  });

  it("a block with its own value is not taken over when the service passes through that value", () => {
    const own: KeptHours = { seating: STORED.seating, bookingTypes: ["online"] };
    const service = draftService("d", "Dinner", TIMES, {
      kept: STORED,
      blocks: [{ ...draftBlock("late", [5, 6], TIMES), kept: own }],
    });
    // Phone only → Online only (the block's own value) → Walk-in only.
    const matched = setServiceKept(service, { ...STORED, bookingTypes: ["online"] });
    const moved = setServiceKept(matched, { ...STORED, bookingTypes: [] });
    expect(moved.kept?.bookingTypes).toEqual([]);
    expect(moved.blocks[0]?.kept?.bookingTypes).toEqual(["online"]);
    // Seating was the service's all along, so it still follows.
    const seated = setServiceKept(moved, { seating: NEXT.seating, bookingTypes: [] });
    expect(seated.blocks[0]?.kept?.seating).toEqual(NEXT.seating);
  });

  it("a block whose stored value differed keeps its own, value by value", () => {
    const fixed: KeptHours = { seating: { version: 1, fixed: [1080] }, bookingTypes: ["phone"] };
    const service = draftService("d", "Dinner", TIMES, {
      kept: STORED,
      blocks: [{ ...draftBlock("late", [5, 6], TIMES), kept: fixed }],
    });
    const next: KeptHours = { seating: NEXT.seating, bookingTypes: ["online"] };
    expect(setServiceKept(service, next).blocks[0]?.kept).toEqual({
      seating: fixed.seating,
      bookingTypes: ["online"],
    });
  });

  it("does not change the service it was given", () => {
    const service = draftService("d", "Dinner", TIMES, { kept: STORED });
    setServiceKept(service, NEXT);
    expect(service.kept).toBe(STORED);
  });

  describe("order is not meaning", () => {
    const base: KeptHours = {
      seating: { version: 1, interval: 30 },
      bookingTypes: ["phone", "online"],
    };

    it("a block with the same booking types in another order follows the service", () => {
      const service = draftService("l", "Lunch", TIMES, {
        kept: base,
        blocks: [
          {
            ...draftBlock("sun", [0], TIMES),
            kept: { seating: base.seating, bookingTypes: ["online", "phone"] },
          },
        ],
      });
      const walkIn = setServiceKept(service, { seating: base.seating, bookingTypes: [] });
      expect(walkIn.kept?.bookingTypes).toEqual([]);
      expect(walkIn.blocks[0]?.kept?.bookingTypes).toEqual([]);
    });

    it("a block with the same fixed seating times in another order follows the service", () => {
      const fixed: KeptHours = {
        seating: { version: 1, fixed: [1080, 1200] },
        bookingTypes: ["online"],
      };
      const service = draftService("d", "Dinner", TIMES, {
        kept: fixed,
        blocks: [
          {
            ...draftBlock("sun", [0], TIMES),
            kept: { seating: { version: 1, fixed: [1200, 1080] }, bookingTypes: ["online"] },
          },
        ],
      });
      const next = setServiceKept(service, { ...fixed, seating: { version: 1, interval: 15 } });
      expect(next.blocks[0]?.kept?.seating).toEqual({ version: 1, interval: 15 });
    });

    it("a change and its revert hand back the stored array, untouched", () => {
      const service = draftService("l", "Lunch", TIMES, { kept: base });
      const changed = setServiceKept(service, { ...base, bookingTypes: ["online"] }, base);
      const reverted = setServiceKept(
        changed,
        { ...base, bookingTypes: ["online", "phone"] },
        base
      );
      expect(reverted.kept?.bookingTypes).toBe(base.bookingTypes);
    });

    it("a change and its revert leave the week reading as it did", () => {
      const service = draftService("l", "Lunch", TIMES, {
        kept: base,
        blocks: [
          {
            ...draftBlock("sun", [0], TIMES),
            kept: { seating: base.seating, bookingTypes: ["online", "phone"] },
          },
        ],
      });
      const week = (s: typeof service): QuickSetupDraft => ({ days: [0, 1], services: [s] });
      const changed = setServiceKept(service, { ...base, bookingTypes: [] }, base);
      const reverted = setServiceKept(
        changed,
        { ...base, bookingTypes: ["online", "phone"] },
        base
      );
      expect(weekKey(week(changed))).not.toBe(weekKey(week(service)));
      expect(weekKey(week(reverted))).toBe(weekKey(week(service)));
    });
  });

  describe("a service that carries no values of its own", () => {
    const stored: KeptHours = {
      seating: { version: 1, interval: 45 },
      bookingTypes: ["phone", "online"],
    };

    it("a change to one value starts from what is stored under its name", () => {
      const service = draftService("l", "Lunch", TIMES);
      const shown = shownKept(service, stored);
      const next = setServiceKept(service, { ...shown, bookingTypes: ["online"] }, stored);
      expect(next.kept).toEqual({ seating: stored.seating, bookingTypes: ["online"] });
    });
  });
});
