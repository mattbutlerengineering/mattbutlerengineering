import { describe, expect, it } from "vitest";
import type { DateRule, Table } from "@mbe/types";
import {
  buildCloseRule,
  buildCloseRules,
  closureForm,
  isEditableClosure,
  seriesForm,
  validateClose,
  type CloseForm,
} from "./close-draft.js";
import { sectionMembership } from "./section-membership.js";

const TODAY = "2026-12-01";

const form = (patch: Partial<CloseForm> = {}): CloseForm => ({
  what: { kind: "section", sectionId: "sec-bar" },
  when: { kind: "date", date: "2026-12-24" },
  fromMinute: null,
  staffNote: "",
  guestMessage: "",
  ...patch,
});

const table = (id: string, sectionId: string | null) => ({ id, sectionId }) as Table;

const MEMBERSHIP = sectionMembership([
  table("t1", "sec-bar"),
  table("t2", "sec-bar"),
  table("t3", "sec-main"),
  table("t4", null),
]);

describe("sectionMembership", () => {
  it("groups table ids by section and leaves out tables with no section", () => {
    expect(MEMBERSHIP.get("sec-bar")).toEqual(["t1", "t2"]);
    expect(MEMBERSHIP.get("sec-main")).toEqual(["t3"]);
    expect(MEMBERSHIP.size).toBe(2);
  });
});

describe("closing one section (ADR-032)", () => {
  it("builds a tables closure that names the section and carries its tables now", () => {
    expect(buildCloseRule(form(), "r", TODAY, MEMBERSHIP)).toMatchObject({
      id: "r",
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      tableIds: ["t1", "t2"],
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    });
  });

  it("carries no tables for a section the membership does not know", () => {
    expect(buildCloseRule(form(), "r", TODAY, new Map())).toMatchObject({
      sectionId: "sec-bar",
      tableIds: [],
    });
  });

  it("builds one section closure per picked date", () => {
    const rules = buildCloseRules(
      form({ when: { kind: "dates", dates: ["2026-12-24", "2026-12-25"] } }),
      (date) => `r-${date}`,
      TODAY,
      MEMBERSHIP
    );
    expect(rules.map((r) => [r.startsOn, r.sectionId, r.tableIds])).toEqual([
      ["2026-12-24", "sec-bar", ["t1", "t2"]],
      ["2026-12-25", "sec-bar", ["t1", "t2"]],
    ]);
  });

  it("needs a section before Next", () => {
    expect(validateClose(form({ what: { kind: "section", sectionId: "" } }), TODAY)).toBe("what");
    expect(validateClose(form(), TODAY)).toBeNull();
  });

  it("offers Edit on a saved section closure, and rebuilds the form from it", () => {
    const rule = {
      id: "c1",
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      tableIds: ["t1"],
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    } as DateRule;
    expect(isEditableClosure(rule)).toBe(true);
    expect(closureForm(rule).what).toEqual({ kind: "section", sectionId: "sec-bar" });
    expect(isEditableClosure({ ...rule, sectionId: null })).toBe(false);
  });

  it("keeps the section when one date of a series is edited", () => {
    const series = {
      id: "s1",
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      startsOn: "2026-12-01",
      endsOn: "2027-01-01",
      repeat: { version: 1, weekdays: [4] },
    } as DateRule;
    expect(seriesForm(series, "2026-12-24").what).toEqual({
      kind: "section",
      sectionId: "sec-bar",
    });
  });
});
