import { describe, expect, it } from "vitest";
import type { ClosureImpactGroup, DateRule } from "@mbe/types";
import {
  actionsFor,
  activeOnlinePause,
  buildCloseRule,
  decisionsReady,
  isUrgent,
  outcomeCounts,
  toDecisions,
  validateClose,
  type CloseForm,
} from "./close-draft.js";

const TODAY = "2026-12-01";

const form = (patch: Partial<CloseForm> = {}): CloseForm => ({
  what: { kind: "venue" },
  when: { kind: "date", date: "2026-12-24" },
  fromMinute: null,
  staffNote: "",
  guestMessage: "",
  ...patch,
});

const group = (patch: Partial<ClosureImpactGroup> = {}): ClosureImpactGroup => ({
  groupKey: "2026-12-24:closed",
  date: "2026-12-24",
  kind: "closed",
  covers: 52,
  depositsHeld: 3,
  reservations: Array.from({ length: 14 }, (_, i) => ({
    id: `r${i}`,
    startTime: "2026-12-24T17:30:00Z",
    endTime: "2026-12-24T19:00:00Z",
    partySize: 4,
    guestName: "Rivera",
    deposit: null,
    runsIntoClosure: false,
  })),
  ...patch,
});

describe("buildCloseRule", () => {
  it("closes the whole venue on one date with no window", () => {
    expect(buildCloseRule(form(), "rule-1", TODAY)).toMatchObject({
      id: "rule-1",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      window: null,
    });
  });

  it("closes tonight as today", () => {
    expect(buildCloseRule(form({ when: { kind: "tonight" } }), "r", TODAY)).toMatchObject({
      startsOn: TODAY,
      endsOn: TODAY,
    });
  });

  it("leaves an until-I-reopen closure open-ended", () => {
    const rule = buildCloseRule(form({ when: { kind: "until-reopen", from: TODAY } }), "r", TODAY);
    expect(rule).toMatchObject({ startsOn: TODAY, endsOn: null });
  });

  it("turns a start time into a window running to the end of the service day", () => {
    const rule = buildCloseRule(form({ fromMinute: 22 * 60 }), "r", TODAY);
    expect(rule).toMatchObject({ window: { version: 1, from: 1320, to: 2880 } });
  });

  it("targets one service, or the chosen booking channels", () => {
    expect(
      buildCloseRule(form({ what: { kind: "service", serviceId: "svc" } }), "r", TODAY)
    ).toMatchObject({ targetKind: "service", venueServiceId: "svc" });
    const booking = buildCloseRule(
      form({ what: { kind: "booking", types: ["online"] } }),
      "r",
      TODAY
    );
    expect(booking).toMatchObject({ targetKind: "booking", bookingTypes: ["online"] });
  });

  it("repeats on weekdays across a range", () => {
    const rule = buildCloseRule(
      form({ when: { kind: "repeats", weekdays: [1], from: "2027-01-01", to: "2027-03-31" } }),
      "r",
      TODAY
    );
    expect(rule).toMatchObject({
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
      repeat: { version: 1, weekdays: [1] },
    });
  });

  it("carries trimmed messages and omits empty ones", () => {
    const rule = buildCloseRule(form({ staffNote: " Gomez ", guestMessage: "" }), "r", TODAY);
    expect(rule).toMatchObject({ staffNote: "Gomez" });
    expect(rule?.guestMessage).toBeUndefined();
  });

  it("is null until the form is complete", () => {
    expect(buildCloseRule(form({ when: { kind: "date", date: "" } }), "r", TODAY)).toBeNull();
    expect(buildCloseRule(form({ what: { kind: "booking", types: [] } }), "r", TODAY)).toBeNull();
    expect(
      buildCloseRule(form({ what: { kind: "service", serviceId: "" } }), "r", TODAY)
    ).toBeNull();
    expect(
      buildCloseRule(
        form({ when: { kind: "range", from: "2026-12-24", to: "2026-12-20" } }),
        "r",
        TODAY
      )
    ).toBeNull();
  });
});

describe("validateClose", () => {
  it("names the first problem field", () => {
    expect(validateClose(form({ what: { kind: "booking", types: [] } }), TODAY)).toBe("what");
    expect(validateClose(form({ when: { kind: "date", date: "" } }), TODAY)).toBe("when");
    expect(validateClose(form({ guestMessage: "x".repeat(201) }), TODAY)).toBe("guestMessage");
    expect(validateClose(form(), TODAY)).toBeNull();
  });
});

describe("decisions", () => {
  const key = "2026-12-24:closed";

  it("offers move only for a shortened group", () => {
    expect(actionsFor("closed")).toEqual(["cancel", "keep_notify", "keep_silent"]);
    expect(actionsFor("shortened")).toEqual(["cancel", "move", "keep_notify", "keep_silent"]);
  });

  it("needs a choice per group, and the box for keeping silent", () => {
    const groups = [group()];
    expect(decisionsReady(groups, {})).toBe(false);
    expect(decisionsReady(groups, { [key]: { action: "cancel", acknowledged: false } })).toBe(true);
    expect(decisionsReady(groups, { [key]: { action: "keep_silent", acknowledged: false } })).toBe(
      false
    );
    expect(decisionsReady(groups, { [key]: { action: "keep_silent", acknowledged: true } })).toBe(
      true
    );
  });

  it("sends the acknowledgement only with keep_silent", () => {
    const groups = [group(), group({ groupKey: "2026-12-25:closed", date: "2026-12-25" })];
    expect(
      toDecisions(groups, {
        [key]: { action: "cancel", acknowledged: true },
        "2026-12-25:closed": { action: "keep_silent", acknowledged: true },
      })
    ).toEqual([
      { groupKey: key, action: "cancel" },
      { groupKey: "2026-12-25:closed", action: "keep_silent", acknowledged: true },
    ]);
  });

  it("counts bookings per chosen outcome", () => {
    const second = group({
      groupKey: "2026-12-25:closed",
      date: "2026-12-25",
      reservations: group().reservations.slice(0, 9),
    });
    expect(
      outcomeCounts([group(), second], {
        [key]: { action: "cancel", acknowledged: false },
        "2026-12-25:closed": { action: "keep_notify", acknowledged: false },
      })
    ).toEqual({ cancel: 14, move: 0, keep_notify: 9, keep_silent: 0 });
  });
});

describe("isUrgent", () => {
  it("is urgent when the closure starts within 6 hours", () => {
    expect(isUrgent({ startsOn: TODAY, fromMinute: null }, TODAY, 20 * 60)).toBe(true);
    expect(isUrgent({ startsOn: TODAY, fromMinute: 23 * 60 }, TODAY, 18 * 60)).toBe(true);
    expect(isUrgent({ startsOn: TODAY, fromMinute: 23 * 60 }, TODAY, 12 * 60)).toBe(false);
    expect(isUrgent({ startsOn: "2026-12-24", fromMinute: null }, TODAY, 12 * 60)).toBe(false);
  });
});

describe("activeOnlinePause", () => {
  const rule = (patch: Record<string, unknown>) =>
    ({
      id: "p1",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: "2026-11-30",
      endsOn: null,
      ...patch,
    }) as DateRule;

  it("finds an open-ended online pause that has started", () => {
    expect(activeOnlinePause([rule({})], TODAY)?.id).toBe("p1");
  });

  it("ignores pauses that have not started, have ended, or close other channels", () => {
    expect(activeOnlinePause([rule({ startsOn: "2026-12-02" })], TODAY)).toBeNull();
    expect(activeOnlinePause([rule({ endsOn: "2026-11-30" })], TODAY)).toBeNull();
    expect(activeOnlinePause([rule({ bookingTypes: ["phone"] })], TODAY)).toBeNull();
    expect(activeOnlinePause([rule({ targetKind: "venue" })], TODAY)).toBeNull();
  });
});
