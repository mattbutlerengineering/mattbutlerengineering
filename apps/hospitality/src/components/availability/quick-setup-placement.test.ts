import { describe, it, expect } from "vitest";
import { draftService } from "./quick-setup-demo.fixture.js";
import {
  autoLastSeating,
  emptyService,
  replaceService,
  type QuickSetupDraft,
  type ServicePresetId,
} from "./quick-setup-draft.js";
import {
  firstClearStart,
  moveServiceStart,
  placePreset,
  setDaysAndReplace,
} from "./quick-setup-placement.js";
import { validateDraft } from "./quick-setup-validate.js";

const WEEKDAYS = [1, 2, 3, 4, 5];
const place = (draft: QuickSetupDraft, id: string, preset: ServicePresetId) =>
  placePreset(draft, id, preset, "Preset");
const withEmpty = (...services: ReturnType<typeof draftService>[]): QuickSetupDraft => ({
  days: WEEKDAYS,
  services: [...services, emptyService("new")],
});

describe("placePreset", () => {
  it("keeps the preset's own times when they overlap nothing", () => {
    const lunch = draftService("s1", "Lunch", ["11:30", "13:15", "14:30"]);
    expect(place(withEmpty(lunch), "new", "dinner")).toMatchObject({
      opens: "17:00",
      closes: "22:00",
    });
    const dinner = draftService("s1", "Dinner", ["17:00", "21:15", "22:00"]);
    expect(place(withEmpty(dinner), "new", "lunch")).toMatchObject({
      opens: "11:30",
      closes: "14:30",
    });
    const longLunch = draftService("s1", "Lunch", ["11:30", "14:15", "15:00"]);
    expect(place(withEmpty(longLunch), "new", "dinner")).toMatchObject({ opens: "17:00" });
  });

  it("keeps a service's own times when its chip is clicked again", () => {
    const dinner = draftService("s1", "Dinner", ["17:00", "21:15", "22:00"]);
    const draft: QuickSetupDraft = { days: WEEKDAYS, services: [dinner] };
    expect(place(draft, "s1", "dinner")).toMatchObject({ opens: "17:00", closes: "22:00" });
  });

  it("places after the services it would overlap, keeping its three hours", () => {
    const dinner = draftService("s1", "Dinner", ["17:00", "22:15", "23:00"]);
    const draft = withEmpty(dinner);
    const late = place(draft, "new", "late");
    expect(late).toMatchObject({ opens: "23:00", closes: "02:00", lastSeatingLinked: true });
    expect(late.lastSeating).toBe(autoLastSeating("02:00", "23:00"));
    expect(validateDraft(replaceService(draft, late))).toEqual([]);
  });

  it("keeps Brunch's preset times beside every-day Lunch and Dinner", () => {
    const lunch = draftService("s1", "Lunch", ["11:30", "14:15", "15:00"]);
    const dinner = draftService("s2", "Dinner", ["17:00", "22:15", "23:00"]);
    const draft: QuickSetupDraft = {
      days: [0, 1, 2, 3, 4, 5, 6],
      services: [lunch, dinner, emptyService("new")],
    };
    const brunch = place(draft, "new", "brunch");
    expect(brunch).toMatchObject({ opens: "10:00", closes: "14:00" });
    expect(validateDraft(replaceService(draft, brunch)).map((i) => i.code)).toContain("overlap");
    const weekend = setDaysAndReplace(draft, brunch, [6, 0]);
    expect(weekend).toMatchObject({ days: [6, 0], opens: "10:00", closes: "14:00" });
    const lunchWeekdays = { ...lunch, days: WEEKDAYS };
    const other = { ...draft, services: [lunchWeekdays, dinner, emptyService("new")] };
    expect(place(other, "new", "brunch")).toMatchObject({ opens: "10:00", closes: "14:00" });
  });

  it("re-places Late for new days while its times are the chip's", () => {
    const dinner = draftService("s1", "Dinner", ["17:00", "22:15", "23:00"]);
    const draft: QuickSetupDraft = {
      days: [0, 1, 2, 3, 4, 5, 6],
      services: [dinner, emptyService("new")],
    };
    const late = place(draft, "new", "late");
    expect(late).toMatchObject({ opens: "23:00", closes: "02:00" });
    const withLate = replaceService(draft, late);
    expect(setDaysAndReplace(withLate, late, [])).toMatchObject({
      opens: "22:00",
      closes: "01:00",
    });
    const edited = { ...late, opens: "23:30" };
    expect(setDaysAndReplace(replaceService(draft, edited), edited, [6])).toMatchObject({
      opens: "23:30",
    });
  });

  it("keeps the preset's own times when no placement is clear", () => {
    const lunch = draftService("s1", "Lunch", ["07:00", "11:15", "12:00"]);
    const dinner = draftService("s3", "Dinner", ["17:00", "23:00", "23:30"]);
    expect(place(withEmpty(lunch, dinner), "new", "late")).toMatchObject({
      opens: "22:00",
      closes: "01:00",
    });
    const past = draftService("s3", "Dinner", ["17:00", "01:00", "01:30"]);
    expect(place(withEmpty(past), "new", "late")).toMatchObject({ opens: "22:00" });
  });

  it("ignores services on other days", () => {
    const dinner = draftService("s1", "Dinner", ["17:00", "22:15", "23:00"], { days: [6] });
    expect(
      place({ days: [1, 2], services: [dinner, emptyService("new")] }, "new", "late")
    ).toMatchObject({
      opens: "22:00",
    });
  });
});

describe("firstClearStart and moveServiceStart", () => {
  const lunch = draftService("s1", "Lunch", ["11:30", "17:15", "18:00"]);
  const dinner = draftService("s2", "Dinner", ["17:00", "21:15", "22:00"]);

  it("finds the first clear start in 15-minute steps, or null", () => {
    expect(firstClearStart({ days: [1, 2, 3], services: [lunch, dinner] }, "s2")).toBe(18 * 60);
    const wide = draftService("s1", "Lunch", ["00:00", "22:45", "23:59"]);
    expect(firstClearStart({ days: [1, 2, 3], services: [wide, dinner] }, "s2")).toBeNull();
  });

  it("moves a service's start keeping its length", () => {
    expect(moveServiceStart(dinner, 18 * 60)).toMatchObject({
      opens: "18:00",
      closes: "23:00",
      lastSeating: "22:15",
    });
  });
});
