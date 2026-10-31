import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { seedServices, type DraftService } from "./draft-changes.js";
import { reapplyDraft, scheduleChangesSince } from "./conflict-review.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const SCOPE = { kind: "schedule", scheduleId: "regular" } as const;
const rowsOf = (config: AvailabilityConfig) => seedServices(config, { services: [] }, SCOPE);

/** The venue after a colleague added Brunch and moved Dinner's close to 10:30 PM. */
function colleagueEdited(): AvailabilityConfig {
  const base = fixtureConfig();
  return {
    ...base,
    schedules: base.schedules.map((s) => ({ ...s, name: "Summer" })),
    venueServices: [...base.venueServices, { id: "vs-brunch", name: "Brunch", position: 2 }],
    scheduleServices: [
      ...base.scheduleServices.map((s) => (s.id === "ss-dinner" ? { ...s, closesAt: 1350 } : s)),
      {
        ...base.scheduleServices[0]!,
        id: "ss-brunch",
        venueServiceId: "vs-brunch",
        opensAt: 400,
        lastSeatingAt: 500,
        closesAt: 600,
      },
    ],
  };
}

describe("scheduleChangesSince", () => {
  it("names what a colleague added, changed and renamed", () => {
    const changes = scheduleChangesSince(fixtureConfig(), colleagueEdited(), "regular");
    expect(changes).toEqual({
      gone: false,
      renamedTo: "Summer",
      added: ["Brunch"],
      removed: [],
      changed: ["Dinner"],
    });
  });

  it("reports nothing for a venue that did not change this schedule", () => {
    expect(scheduleChangesSince(fixtureConfig(), fixtureConfig(), "regular")).toEqual({
      gone: false,
      renamedTo: null,
      added: [],
      removed: [],
      changed: [],
    });
  });

  it("says a deleted schedule is gone", () => {
    const after = { ...fixtureConfig(), schedules: [] };
    expect(scheduleChangesSince(fixtureConfig(), after, "regular").gone).toBe(true);
  });
});

describe("reapplyDraft", () => {
  const base = rowsOf(fixtureConfig());
  const latest = rowsOf(colleagueEdited());

  it("keeps the colleague's service and the Manager's own edit and removal", () => {
    const draft: DraftService[] = base
      .filter((s) => s.name !== "Lunch")
      .map((s) => (s.name === "Dinner" ? { ...s, lastSeatingAt: 1200 } : s));
    const merged = reapplyDraft({ base, draft, latest });
    expect(merged.map((s) => s.name)).toEqual(["Brunch", "Dinner"]);
    // The Manager's edited field wins on the row they touched.
    expect(merged.find((s) => s.name === "Dinner")?.lastSeatingAt).toBe(1200);
    // ...while a field they left alone follows the colleague's edit.
    expect(merged.find((s) => s.name === "Dinner")?.closesAt).toBe(1350);
  });

  it("takes the colleague's value on a row the Manager left alone", () => {
    const merged = reapplyDraft({ base, draft: base, latest });
    expect(merged.find((s) => s.name === "Dinner")?.closesAt).toBe(1350);
    expect(merged.map((s) => s.name)).toEqual(["Brunch", "Lunch", "Dinner"]);
  });

  it("carries a service the Manager added, with no stored row yet", () => {
    const added: DraftService = {
      ...base[0]!,
      key: "mine",
      venueServiceId: null,
      scheduleServiceId: null,
      name: "Late night",
    };
    const merged = reapplyDraft({ base, draft: [...base, added], latest });
    expect(merged.map((s) => s.name)).toEqual(["Brunch", "Lunch", "Dinner", "Late night"]);
  });
});
