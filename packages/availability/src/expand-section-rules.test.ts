import type { DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { expandSectionRules } from "./expand-section-rules.js";

const sectionRule: DateRule = {
  id: "dr-bar",
  kind: "closure",
  targetKind: "tables",
  sectionId: "sec-bar",
  tableIds: ["stale-1"],
  startsOn: "2026-12-24",
};

const plainTables: DateRule = {
  id: "dr-patio",
  kind: "closure",
  targetKind: "tables",
  tableIds: ["t-9"],
  startsOn: "2026-12-24",
};

const venueClosure: DateRule = {
  id: "dr-venue",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-25",
};

const membership = new Map<string, readonly string[]>([["sec-bar", ["t-1", "t-2"]]]);

describe("expandSectionRules", () => {
  it("replaces tableIds with the section's current tables", () => {
    const [rule] = expandSectionRules([sectionRule], membership);
    expect(rule).toEqual({ ...sectionRule, tableIds: ["t-1", "t-2"] });
  });

  it("gives an unknown section no tables", () => {
    const [rule] = expandSectionRules([sectionRule], new Map());
    expect(rule?.tableIds).toEqual([]);
  });

  it("leaves rules without a section as they were", () => {
    const out = expandSectionRules([plainTables, venueClosure], membership);
    expect(out).toEqual([plainTables, venueClosure]);
  });

  it("does not mutate its inputs", () => {
    const rules = [sectionRule, plainTables];
    const snapshot = structuredClone(rules);
    const out = expandSectionRules(rules, membership);
    expect(rules).toEqual(snapshot);
    expect(out[0]).not.toBe(sectionRule);
  });

  it("is idempotent", () => {
    const once = expandSectionRules([sectionRule, plainTables], membership);
    expect(expandSectionRules(once, membership)).toEqual(once);
  });
});
