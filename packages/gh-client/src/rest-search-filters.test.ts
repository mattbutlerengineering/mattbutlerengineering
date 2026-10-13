import { describe, it, expect } from "vitest";
import { parseSearchFilters } from "./rest-search-filters.js";
import { parseArgs } from "./rest-args.js";

const none = parseArgs([]);

describe("parseSearchFilters", () => {
  it("parses label OR groups and date qualifiers", () => {
    expect(parseSearchFilters("label:a,b created:>=2026-10-01 closed:>=2026-10-02", none)).toEqual({
      labelGroups: [["a", "b"]],
      createdSince: "2026-10-01",
      closedSince: "2026-10-02",
    });
  });

  it("adds --label flags as AND groups", () => {
    const parsed = parseArgs(["--label", "x"]);
    expect(parseSearchFilters("merged:>=2026-10-01", parsed)?.labelGroups).toEqual([["x"]]);
  });

  it.each(['"revert: #1" in:title', "CORS audit in:title", "ui-quality"])(
    "returns null for free text: %s",
    (term) => {
      expect(parseSearchFilters(term, none)).toBeNull();
    }
  );
});
