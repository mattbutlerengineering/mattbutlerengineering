import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { editedWeekday, outsideSchedules, reapplyWeek, weekKey } from "./change-week-draft.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";

const withService = (
  draft: QuickSetupDraft,
  name: string,
  edit: (s: QuickSetupDraft["services"][number]) => QuickSetupDraft["services"][number]
): QuickSetupDraft => ({
  ...draft,
  services: draft.services.map((s) => (s.name === name ? edit(s) : s)),
});

describe("weekKey", () => {
  it("ignores row ids and the order of days, and sees a changed time", () => {
    const base = demoDraft();
    const reordered = withService(base, "Lunch", (s) => ({
      ...s,
      id: "other",
      days: [5, 4, 3, 2, 1],
    }));
    expect(weekKey(reordered)).toBe(weekKey(base));
    const later = withService(base, "Lunch", (s) => ({ ...s, closes: "15:30" }));
    expect(weekKey(later)).not.toBe(weekKey(base));
  });
});

describe("editedWeekday", () => {
  it("is the first weekday, Monday first, whose services or hours changed", () => {
    const before = demoDraft();
    // Dinner's late block moves from Fri–Sat to Sat only: Friday is the day that changed.
    const after = withService(before, "Dinner", (s) => ({
      ...s,
      blocks: s.blocks.map((b) => ({ ...b, days: [6] })),
    }));
    expect(editedWeekday(before, after)).toBe(5);
  });

  it("is null when nothing changed", () => {
    expect(editedWeekday(demoDraft(), demoDraft())).toBeNull();
  });

  it("reads Sunday last", () => {
    const before = demoDraft();
    const after = withService(before, "Brunch", (s) => ({ ...s, closes: "15:00" }));
    // Brunch runs Sat–Sun: Saturday comes before Sunday.
    expect(editedWeekday(before, after)).toBe(6);
  });
});

describe("reapplyWeek", () => {
  const base = demoDraft();

  it("keeps the Manager's edit and removal, and a colleague's other changes", () => {
    const mine = withService(
      { ...base, services: base.services.filter((s) => s.name !== "Brunch") },
      "Dinner",
      (s) => ({ ...s, blocks: [] })
    );
    // A colleague moved Lunch's close and added Late.
    const latest: QuickSetupDraft = {
      ...withService(base, "Lunch", (s) => ({ ...s, closes: "15:30" })),
      services: [
        ...withService(base, "Lunch", (s) => ({ ...s, closes: "15:30" })).services,
        { ...base.services[0]!, id: "late", name: "Late", days: null },
      ],
    };
    const merged = reapplyWeek({ base, draft: mine, latest });
    expect(merged.services.map((s) => s.name)).toEqual(["Lunch", "Dinner", "Late"]);
    expect(merged.services[0]?.closes).toBe("15:30"); // the colleague's
    expect(merged.services[1]?.blocks).toEqual([]); // the Manager's
  });

  it("adds a service the Manager added that the winning week lacks", () => {
    const added = { ...base.services[0]!, id: "mine", name: "Tasting" };
    const merged = reapplyWeek({
      base,
      draft: { ...base, services: [...base.services, added] },
      latest: base,
    });
    expect(merged.services.at(-1)?.name).toBe("Tasting");
  });
});

describe("outsideSchedules", () => {
  const config = (kind: "regular" | "alternate", startsOn: string | null): AvailabilityConfig => ({
    schedules: [
      { id: "r", name: "Regular week", kind: "regular", isRegular: true },
      { id: "w", name: "Weekend", kind, isRegular: false },
    ],
    venueServices: [],
    scheduleServices: [],
    assignments: [
      { id: "a-r", scheduleId: "r", weekdays: [1, 2, 3, 4, 5], precedence: 0 },
      { id: "a-w", scheduleId: "w", weekdays: [6, 0], precedence: 1, startsOn },
    ],
    dateRules: [],
  });

  it("names a schedule of another kind that is used with no dates", () => {
    expect(outsideSchedules(config("alternate", null))).toEqual([
      { name: "Weekend", weekdays: [0, 6] },
    ]);
  });

  it("leaves out dated schedules, and ones that are part of the regular week", () => {
    expect(outsideSchedules(config("alternate", "2026-12-01"))).toEqual([]);
    expect(outsideSchedules(config("regular", null))).toEqual([]);
  });
});
