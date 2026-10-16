import { describe, test, expect } from "vitest";
import { classifyMainStrictness } from "../main-strictness.mjs";

describe("classifyMainStrictness", () => {
  test("parsed literal strict:false yields strictMain:false", () => {
    const result = classifyMainStrictness(
      JSON.stringify({ strict: false, contexts: ["CI Gate"] }),
      null
    );

    expect(result.strictMain).toBe(false);
  });

  test("an error (gh api failed) fails closed to strictMain:true", () => {
    const result = classifyMainStrictness(null, new Error("gh: command failed"));

    expect(result.strictMain).toBe(true);
  });

  test("non-JSON output fails closed to strictMain:true", () => {
    const result = classifyMainStrictness("not json at all", null);

    expect(result.strictMain).toBe(true);
  });

  test("JSON missing the strict field fails closed to strictMain:true", () => {
    const result = classifyMainStrictness(JSON.stringify({ contexts: ["CI Gate"] }), null);

    expect(result.strictMain).toBe(true);
  });

  test("parsed literal strict:true yields strictMain:true", () => {
    const result = classifyMainStrictness(JSON.stringify({ strict: true }), null);

    expect(result.strictMain).toBe(true);
  });

  test("a truthy non-boolean strict value fails closed to strictMain:true", () => {
    const result = classifyMainStrictness(JSON.stringify({ strict: "false" }), null);

    expect(result.strictMain).toBe(true);
  });

  test("every result carries a reason string", () => {
    const result = classifyMainStrictness(JSON.stringify({ strict: false }), null);

    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
