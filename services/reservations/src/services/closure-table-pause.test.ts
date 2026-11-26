import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("./database.js", () => ({ prisma: { dateRule: { findFirst } } }));

const { isTablePause } = await import("./closure-table-pause.js");

const stored = {
  kind: "closure",
  targetKind: "tables",
  sectionId: null,
  venueServiceId: null,
  bookingTypes: [],
  repeat: null,
  window: null,
  seriesId: null,
  useScheduleId: null,
  _count: { tables: 2 },
};

describe("isTablePause (#9778)", () => {
  beforeEach(() => findFirst.mockReset());

  it("reads the live rule of this venue only", async () => {
    findFirst.mockResolvedValue(stored);
    await expect(isTablePause("venue-1", "dr-1")).resolves.toBe(true);
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      id: "dr-1",
      venueId: "venue-1",
      deletedAt: null,
    });
  });

  it("answers false for an unknown rule", async () => {
    findFirst.mockResolvedValue(null);
    await expect(isTablePause("venue-1", "nope")).resolves.toBe(false);
  });

  it.each([
    ["a whole-venue closure", { targetKind: "venue", _count: { tables: 0 } }],
    ["a section closure", { sectionId: "sec-1" }],
    ["a service closure", { venueServiceId: "svc-1" }],
    ["one channel only", { bookingTypes: ["online"] }],
    ["a repeating rule", { repeat: { version: 1, weekdays: [5] } }],
    ["a time window", { window: { version: 1, from: 1020, to: 1320 } }],
    ["a series member", { seriesId: "dr-root" }],
    ["special hours", { kind: "special_hours" }],
    ["no tables", { _count: { tables: 0 } }],
  ])("answers false for %s", async (_label, over) => {
    findFirst.mockResolvedValue({ ...stored, ...over });
    await expect(isTablePause("venue-1", "dr-1")).resolves.toBe(false);
  });
});
