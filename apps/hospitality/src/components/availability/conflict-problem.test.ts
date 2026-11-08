import { describe, expect, it } from "vitest";
import { ApiClientError } from "@mbe/api-client";
import { availabilityProblemOf, conflictOf, isDecisionRequired } from "./conflict-problem.js";

const apiError = (status: number, extra: Record<string, unknown>) =>
  new ApiClientError(
    {
      type: "about:blank",
      title: "Problem",
      status,
      detail: "The server refused the change.",
      ...extra,
    } as never,
    "POST",
    "closures"
  );

const WINNING_CHANGE = {
  id: "c1",
  actorId: "u1",
  at: "2026-12-24T18:00:00.000Z",
  kind: "closure",
  summary: "Closed for a private event",
};

const decisionRequired = () => apiError(422, { code: "decision-required" });
const versionConflict = (winningChange?: unknown) =>
  apiError(409, {
    code: "version-conflict",
    ...(winningChange === undefined ? {} : { winningChange }),
  });
const closureExists = () => apiError(409, { code: "closure-exists" });
const notAvailabilityProblem = () => apiError(500, { code: 42 });

describe("isDecisionRequired", () => {
  it("is true for the decision-required problem", () => {
    expect(isDecisionRequired(decisionRequired())).toBe(true);
  });

  it("is false for any other problem, a non-schema body, null or a plain Error", () => {
    expect(isDecisionRequired(versionConflict())).toBe(false);
    expect(isDecisionRequired(closureExists())).toBe(false);
    expect(isDecisionRequired(notAvailabilityProblem())).toBe(false);
    expect(isDecisionRequired(null)).toBe(false);
    expect(isDecisionRequired(new Error("network"))).toBe(false);
  });
});

describe("conflictOf", () => {
  it("reads a version conflict without a winning change as null", () => {
    expect(conflictOf(versionConflict())).toEqual({
      code: "version-conflict",
      winningChange: null,
    });
  });

  it("carries the winning change when the server recorded one", () => {
    expect(conflictOf(versionConflict(WINNING_CHANGE))).toEqual({
      code: "version-conflict",
      winningChange: WINNING_CHANGE,
    });
  });

  it("reads closure-exists", () => {
    expect(conflictOf(closureExists())).toEqual({ code: "closure-exists" });
  });

  it("is null for any other problem, a non-schema body, null or a plain Error", () => {
    expect(conflictOf(decisionRequired())).toBeNull();
    expect(conflictOf(notAvailabilityProblem())).toBeNull();
    expect(conflictOf(null)).toBeNull();
    expect(conflictOf(new Error("network"))).toBeNull();
  });
});

describe("availabilityProblemOf", () => {
  it("returns the parsed problem an API error carries", () => {
    expect(availabilityProblemOf(decisionRequired())).toMatchObject({
      code: "decision-required",
    });
    expect(availabilityProblemOf(closureExists())).toMatchObject({ code: "closure-exists" });
  });

  it("is null for a non-schema body, null or a plain Error", () => {
    expect(availabilityProblemOf(notAvailabilityProblem())).toBeNull();
    expect(availabilityProblemOf(null)).toBeNull();
    expect(availabilityProblemOf(new Error("network"))).toBeNull();
  });
});
