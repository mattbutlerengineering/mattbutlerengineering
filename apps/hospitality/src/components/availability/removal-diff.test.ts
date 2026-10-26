import { describe, it, expect } from "vitest";
import type { ResolvedDay } from "@mbe/availability";
import { diffRemoval } from "./removal-diff.js";
import {
  EARLY_DINNER,
  LATE_CLOSURE,
  LUNCH_CLOSURE,
  LUNCH_WINDOW,
  ONLINE_WINDOW,
  SKIP_WEEKLY,
  WEEKLY_CLOSURE,
  ONLINE_CLOSURE,
  PARTY_CLOSURE,
  TONIGHT_CLOSE,
  TONIGHT_PACING,
  TONIGHT_STOP,
  VENUE_CLOSURE,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

function changesFor(day: ResolvedDay, id: string) {
  const layer = day.explanation.find((l) => l.id === id);
  if (!layer) throw new Error(`no layer ${id}`);
  return diffRemoval(day, layer.removalResult);
}

describe("diffRemoval (from real resolveDay output)", () => {
  it("reports a closure window that would reopen", () => {
    const day = resolveFixtureDay(PARTY_CLOSURE);
    expect(changesFor(day, "r-party")).toEqual([
      {
        kind: "closureLifted",
        closure: expect.objectContaining({ from: 1320, to: 1380 }),
      },
    ]);
  });

  it("reports special hours that trim a service's close", () => {
    const day = resolveFixtureDay(EARLY_DINNER);
    expect(changesFor(day, "r-special")).toEqual([
      { kind: "closesAtChanges", name: "Dinner", minute: 1380, later: true },
      { kind: "lastSeatingChanges", name: "Dinner", minute: 1260 },
    ]);
  });

  it("reports a service that would open again", () => {
    const day = resolveFixtureDay(LUNCH_CLOSURE);
    expect(changesFor(day, "r-lunch")).toEqual([
      { kind: "serviceOpens", name: "Lunch", opensAt: 690, closesAt: 900 },
    ]);
  });

  it("reports services returning when the venue closure is removed", () => {
    const day = resolveFixtureDay(VENUE_CLOSURE);
    expect(changesFor(day, "r-venue")).toEqual([
      { kind: "serviceOpens", name: "Lunch", opensAt: 690, closesAt: 900 },
      { kind: "serviceOpens", name: "Dinner", opensAt: 1020, closesAt: 1380 },
    ]);
  });

  it("reports booking channels that would come back on", () => {
    const day = resolveFixtureDay(ONLINE_CLOSURE);
    expect(changesFor(day, "r-online")).toEqual([{ kind: "bookingOn", channel: "online" }]);
  });

  it("reports a Tonight stop lifting", () => {
    const day = resolveFixtureDay(TONIGHT_STOP);
    expect(changesFor(day, "r-stop")).toEqual([
      { kind: "closureLifted", closure: expect.objectContaining({ from: 1260, to: 1290 }) },
    ]);
  });

  it("reports a Tonight early close lifting", () => {
    const day = resolveFixtureDay(TONIGHT_CLOSE);
    expect(changesFor(day, "r-close")).toEqual([
      { kind: "closesAtChanges", name: "Dinner", minute: 1380, later: true },
    ]);
  });

  it("reports Tonight pacing lifting", () => {
    const day = resolveFixtureDay(TONIGHT_PACING);
    expect(changesFor(day, "r-pacing")).toEqual([{ kind: "pacingLifted" }]);
  });

  it("reports the regular week's removal as services and nothing else when it is the only layer", () => {
    const day = resolveFixtureDay();
    expect(changesFor(day, "as-regular").map((c) => c.kind)).toEqual([
      "serviceCloses",
      "serviceCloses",
    ]);
  });

  it("reports nothing when removal changes nothing", () => {
    const day = resolveFixtureDay(PARTY_CLOSURE);
    expect(diffRemoval(day, day)).toEqual([]);
  });
});

describe("diffRemoval windowed closures", () => {
  it("keeps the booking target on a windowed booking closure", () => {
    const day = resolveFixtureDay(ONLINE_WINDOW);
    expect(changesFor(day, "r-online-window")).toEqual([
      { kind: "closureLifted", closure: expect.objectContaining({ targetKind: "booking" }) },
    ]);
  });

  it("re-applies a skipped series closure", () => {
    const day = resolveFixtureDay(WEEKLY_CLOSURE, SKIP_WEEKLY);
    expect(changesFor(day, "r-skip")).toEqual([
      { kind: "closureApplies", closure: expect.objectContaining({ from: 1320, to: 1380 }) },
    ]);
  });

  it("carries the service name of a windowed service closure", () => {
    const day = resolveFixtureDay(LUNCH_WINDOW);
    expect(changesFor(day, "r-lunch-window")).toEqual([
      expect.objectContaining({ kind: "closureLifted", serviceName: "Lunch" }),
    ]);
  });

  it("reports a closure that runs past midnight", () => {
    const day = resolveFixtureDay(LATE_CLOSURE);
    expect(changesFor(day, "r-late")).toEqual([
      { kind: "closureLifted", closure: expect.objectContaining({ from: 1380, to: 1500 }) },
    ]);
  });
});
