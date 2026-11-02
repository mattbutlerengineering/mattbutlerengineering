import { describe, expect, it } from "vitest";
import type { DraftService } from "./draft-changes.js";
import { switchScope } from "./scope-switch.js";

const SEATING = { version: 1, interval: 15 } as const;

function row(id: string, name: string, over: Partial<DraftService> = {}): DraftService {
  return {
    key: id,
    venueServiceId: id,
    scheduleServiceId: null,
    name,
    opensAt: 1020,
    lastSeatingAt: 1260,
    closesAt: 1380,
    seating: SEATING,
    bookingTypes: ["online", "phone"],
    ...over,
  };
}

const lunch = row("vs-lunch", "Lunch", { opensAt: 690 });
const dinner = row("vs-dinner", "Dinner");
const brunch = row("vs-brunch", "Brunch", { opensAt: 400 });
const late = row("vs-late", "Late", { opensAt: 1380 });
const phoneOnly = (r: DraftService): DraftService => ({ ...r, bookingTypes: ["phone"] });
const names = (rows: readonly DraftService[]) => rows.map((r) => r.name).sort();

describe("switchScope", () => {
  const date = [dinner, late];
  const regular = [lunch, dinner, brunch];

  it("lays the draft over the new scope's rows and re-bases on them", () => {
    const out = switchScope({
      baseline: date,
      services: [phoneOnly(dinner), late],
      parked: [],
      seed: regular,
    });
    expect(names(out.services)).toEqual(["Brunch", "Dinner", "Lunch"]);
    expect(out.services.find((s) => s.name === "Dinner")?.bookingTypes).toEqual(["phone"]);
    expect(out.baseline).toBe(regular);
    expect(out.unsaved).toEqual([]);
  });

  it("parks an edit to a service the new scope lacks, and names it", () => {
    const out = switchScope({
      baseline: date,
      services: [dinner, phoneOnly(late)],
      parked: [],
      seed: regular,
    });
    expect(names(out.services)).toEqual(["Brunch", "Dinner", "Lunch"]);
    expect(out.parked.map((p) => p.draft?.name)).toEqual(["Late"]);
    expect(out.unsaved).toEqual(["Late"]);
  });

  it("brings a parked edit back when the scope that has the service returns", () => {
    const there = switchScope({
      baseline: date,
      services: [phoneOnly(dinner), phoneOnly(late)],
      parked: [],
      seed: regular,
    });
    const back = switchScope({
      baseline: there.baseline,
      services: there.services,
      parked: there.parked,
      seed: date,
    });
    expect(names(back.services)).toEqual(["Dinner", "Late"]);
    expect(back.services.find((s) => s.name === "Late")?.bookingTypes).toEqual(["phone"]);
    expect(back.services.find((s) => s.name === "Dinner")?.bookingTypes).toEqual(["phone"]);
    expect(back.parked).toEqual([]);
    expect(back.unsaved).toEqual([]);
  });

  it("returns a service the date had untouched, and never carries the schedule's rows back", () => {
    const there = switchScope({
      baseline: date,
      services: [phoneOnly(dinner), late],
      parked: [],
      seed: regular,
    });
    const back = switchScope({
      baseline: there.baseline,
      services: there.services,
      parked: there.parked,
      seed: date,
    });
    expect(names(back.services)).toEqual(["Dinner", "Late"]);
  });

  it("names a service the Manager added whose hours the new scope already sets", () => {
    const added = row("vs-dinner", "Dinner", { opensAt: 1100 });
    const out = switchScope({ baseline: [], services: [added], parked: [], seed: regular });
    expect(names(out.services)).toEqual(["Brunch", "Dinner", "Lunch"]);
    expect(out.services.find((s) => s.name === "Dinner")?.opensAt).toBe(1020);
    expect(out.unsaved).toEqual([]);
    expect(out.overridden).toEqual(["Dinner"]);
  });

  it("holds a removal the new scope cannot show, so it is still a removal on the way back", () => {
    const there = switchScope({
      baseline: regular,
      services: [dinner, brunch],
      parked: [],
      seed: date,
    });
    expect(there.parked.map((p) => [p.base.name, p.draft])).toEqual([["Lunch", null]]);
    const back = switchScope({
      baseline: there.baseline,
      services: there.services,
      parked: there.parked,
      seed: regular,
    });
    expect(names(back.services)).toEqual(["Brunch", "Dinner"]);
    expect(back.parked).toEqual([]);
  });

  it("holds the removal of a service only the date had", () => {
    const there = switchScope({ baseline: date, services: [dinner], parked: [], seed: regular });
    const back = switchScope({
      baseline: there.baseline,
      services: there.services,
      parked: there.parked,
      seed: date,
    });
    expect(names(back.services)).toEqual(["Dinner"]);
  });

  it("names an edit that leaves the row equal to what the new scope already has", () => {
    const out = switchScope({
      baseline: [phoneOnly(dinner)],
      services: [dinner],
      parked: [],
      seed: [dinner],
    });
    expect(out.overridden).toEqual(["Dinner"]);
  });

  it("keeps a real removal: a row the Manager took out stays out", () => {
    const out = switchScope({
      baseline: regular,
      services: [dinner, brunch],
      parked: [],
      seed: regular,
    });
    expect(names(out.services)).toEqual(["Brunch", "Dinner"]);
  });
});
