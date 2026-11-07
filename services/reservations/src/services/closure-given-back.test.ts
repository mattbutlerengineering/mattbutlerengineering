import { describe, expect, it, vi } from "vitest";
import type { DateRule } from "@mbe/types";
import { givenBackGuests, givenBackPieces } from "./closure-given-back.js";

const range = (id: string, startsOn: string, endsOn?: string): DateRule =>
  ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn,
    ...(endsOn ? { endsOn } : {}),
  }) as DateRule;

const spans = (replaced: DateRule, next: DateRule) =>
  givenBackPieces(replaced, next).map((p) => [p.startsOn, p.endsOn ?? null]);

describe("givenBackPieces", () => {
  const old = range("old", "2026-12-24", "2026-12-28");

  it("gives back the dates before and after a narrower edit", () => {
    expect(spans(old, range("new", "2026-12-25", "2026-12-26"))).toEqual([
      ["2026-12-24", "2026-12-24"],
      ["2026-12-27", "2026-12-28"],
    ]);
  });

  it("gives back nothing when the edit keeps or widens the dates", () => {
    expect(spans(old, range("new", "2026-12-24", "2026-12-28"))).toEqual([]);
    expect(spans(old, range("new", "2026-12-20", "2026-12-30"))).toEqual([]);
    expect(spans(old, range("new", "2026-12-24"))).toEqual([]);
  });

  it("gives back the whole closure when the edit moves to other dates", () => {
    const whole = [["2026-12-24", "2026-12-28"]];
    expect(spans(old, range("new", "2027-01-05", "2027-01-06"))).toEqual(whole);
    expect(spans(old, range("new", "2026-12-01", "2026-12-02"))).toEqual(whole);
  });

  it("gives back the tail an open-ended closure no longer covers", () => {
    expect(spans(range("old", "2026-12-24"), range("new", "2026-12-24", "2026-12-26"))).toEqual([
      ["2026-12-27", null],
    ]);
  });
});

describe("givenBackGuests", () => {
  const input = (replaced: DateRule, next: DateRule, stored: DateRule[] = [replaced]) => ({
    venueId: "v1",
    stored,
    replaced,
    next,
    today: "2026-12-01",
    now: new Date("2026-12-01T12:00:00Z"),
  });
  const old = range("old", "2026-12-24", "2026-12-26");

  it("finds the cancelled guests on the given-back date and the earliest date among them", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "o2", reservation: { date: new Date("2026-12-26T00:00:00Z") } },
      { id: "o1", reservation: { date: new Date("2026-12-25T00:00:00Z") } },
    ]);
    const found = await givenBackGuests(
      { closureOutcome: { findMany } } as never,
      input(old, range("new", "2026-12-24", "2026-12-24"))
    );
    expect(found).toEqual({ ruleId: "old", outcomeIds: ["o2", "o1"], from: "2026-12-25" });
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      venueId: "v1",
      dateRuleId: "old",
      action: "cancel",
      reservation: {
        startTime: { gt: new Date("2026-12-01T12:00:00Z") },
        date: { gte: new Date("2026-12-25T00:00:00Z"), lte: new Date("2026-12-26T00:00:00Z") },
      },
    });
  });

  it("asks nothing when the edit gives back no date", async () => {
    const findMany = vi.fn();
    const found = await givenBackGuests(
      { closureOutcome: { findMany } } as never,
      input(old, range("new", "2026-12-23", "2026-12-27"))
    );
    expect(found).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is null when no told guest is on a given-back date", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const found = await givenBackGuests(
      { closureOutcome: { findMany } } as never,
      input(old, range("new", "2026-12-24", "2026-12-25"))
    );
    expect(found).toBeNull();
  });

  it("leaves out dates another closure still closes in full", async () => {
    const findMany = vi.fn();
    const other = range("other", "2026-12-20", "2026-12-31");
    const found = await givenBackGuests(
      { closureOutcome: { findMany } } as never,
      input(old, range("new", "2026-12-24", "2026-12-25"), [old, other])
    );
    expect(found).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
