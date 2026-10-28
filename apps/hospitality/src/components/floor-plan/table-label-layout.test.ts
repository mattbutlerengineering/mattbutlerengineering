import { describe, it, expect } from "vitest";
import { SEAT_GAP } from "./floor-plan-geometry.js";
import { LABEL_MIN_SCREEN_PX, counterRotation, tableLabelLayout } from "./table-label-layout.js";

/** The stage scale at a 375px viewport on the default 800px-wide plan. */
const PHONE_SCALE = 375 / 800;

describe("counterRotation", () => {
  it.each([0, 45, 90, 180, 270, 359])("cancels a table rotation of %i degrees", (rotation) => {
    expect(rotation + counterRotation(rotation)).toBe(0);
  });
});

describe("tableLabelLayout", () => {
  const base = { number: "T1", covers: "2-4", tableWidth: 80, stageScale: 1 };

  it("renders the number over the cover range on two lines", () => {
    expect(tableLabelLayout(base).text).toBe("T1\n2-4");
  });

  it("is at least 10 screen px tall at a 375px viewport", () => {
    const layout = tableLabelLayout({ ...base, stageScale: PHONE_SCALE });
    expect(layout.fontSize * PHONE_SCALE).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX);
    expect(layout.height * PHONE_SCALE).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX);
  });

  it("keeps the font at the floor when zoomed in rather than growing without bound", () => {
    expect(tableLabelLayout({ ...base, stageScale: 2 }).fontSize).toBeLessThanOrEqual(14);
  });

  it("keeps a 6-character number clear of the seats on an 80-wide table at 375px", () => {
    const layout = tableLabelLayout({
      ...base,
      number: "TBL-12",
      stageScale: PHONE_SCALE,
    });
    // Seats start SEAT_GAP beyond the table edge; stay inside that gap.
    expect(layout.width).toBeLessThanOrEqual(80 + 2 * (SEAT_GAP - 2));
  });

  it("caps a long name's plate so it can never reach a seat", () => {
    const layout = tableLabelLayout({ ...base, number: "Window banquette north" });
    expect(layout.width).toBeLessThanOrEqual(80 + 2 * (SEAT_GAP - 2));
  });
});
