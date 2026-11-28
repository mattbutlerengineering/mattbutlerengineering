import { describe, expect, it } from "vitest";
import { hasReadableLiteral, matcherFor } from "./locale-sweep-readable.js";

describe("matcherFor", () => {
  const template = "Date {{n}}: {{name}}";

  it("still flags a genuine en-US leak in the template", () => {
    expect(matcherFor(template).test("Date 1: Lunch")).toBe(true);
  });

  it("does not match fr-CA prose that merely starts with the cognate 'Date'", () => {
    const prose =
      "Date spéciale : ce vendredi est-il une date spéciale? Ses heures spéciales remplacent tout.";
    expect(matcherFor(template).test(prose)).toBe(false);
  });

  it("matches a numeric placeholder only against digits", () => {
    expect(matcherFor("Date {{n}}").test("Date 12")).toBe(true);
    expect(matcherFor("Date {{n}}").test("Date spéciale")).toBe(false);
  });

  it("keeps any other placeholder as a lazy wildcard", () => {
    expect(matcherFor("Table {{name}}").test("Table Window 4")).toBe(true);
  });

  it("collapses whitespace in the template and escapes regex characters", () => {
    expect(matcherFor("Save  {{count}} (all)").test("Save 3 (all)")).toBe(true);
    expect(matcherFor("Save {{count}} (all)").test("Save 3 xall)")).toBe(false);
  });
});

describe("hasReadableLiteral", () => {
  it("rejects placeholder-only and connector-only values", () => {
    expect(hasReadableLiteral("{{count}}")).toBe(false);
    expect(hasReadableLiteral("{{from}} - {{to}}")).toBe(false);
    expect(hasReadableLiteral("{{from}} to {{to}}")).toBe(false);
    expect(hasReadableLiteral("{{current}} of {{total}}")).toBe(false);
  });

  it("keeps values with real literal English", () => {
    expect(hasReadableLiteral("Table {{name}}")).toBe(true);
    expect(hasReadableLiteral("{{minutes}} min")).toBe(true);
    expect(hasReadableLiteral("Reserve a table")).toBe(true);
  });
});
