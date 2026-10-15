import { describe, test, expect } from "vitest";
import { classifyMainStrictness } from "../main-strictness.mjs";

describe("classifyMainStrictness — fail closed (ADR-027)", () => {
  test("parsed literal strict:false → strictMain false", () => {
    const out = JSON.stringify({ strict: false, contexts: ["CI Gate"] });
    expect(classifyMainStrictness(out, null)).toEqual({ strictMain: false });
  });

  test("parsed literal strict:true → strictMain true", () => {
    const out = JSON.stringify({ strict: true, contexts: ["CI Gate"] });
    expect(classifyMainStrictness(out, null)).toEqual({ strictMain: true });
  });

  test("any error → strictMain true, even with a strict:false body", () => {
    const out = JSON.stringify({ strict: false });
    expect(classifyMainStrictness(out, new Error("HTTP 403"))).toEqual({ strictMain: true });
  });

  test("non-JSON output → strictMain true", () => {
    expect(classifyMainStrictness("<html>rate limited</html>", null)).toEqual({
      strictMain: true,
    });
  });

  test("missing strict field → strictMain true", () => {
    expect(classifyMainStrictness(JSON.stringify({ contexts: [] }), null)).toEqual({
      strictMain: true,
    });
  });

  test.each([["false"], [0], [null], [undefined]])(
    "non-boolean strict value %j → strictMain true",
    (value) => {
      expect(classifyMainStrictness(JSON.stringify({ strict: value }), null)).toEqual({
        strictMain: true,
      });
    }
  );

  test("empty, null, and non-string output → strictMain true", () => {
    for (const out of ["", null, undefined, 42, "null", "[]"]) {
      expect(classifyMainStrictness(out, null)).toEqual({ strictMain: true });
    }
  });
});
