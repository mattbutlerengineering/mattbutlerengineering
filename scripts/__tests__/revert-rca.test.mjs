import { describe, it, expect } from "vitest";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import { buildRcaCreateArgs } from "../revert-rca.mjs";

describe("buildRcaCreateArgs", () => {
  it("uses the shared ready label constant instead of a re-typed literal (#2933)", () => {
    const argsArr = buildRcaCreateArgs("title", "body");

    const readyIdx = argsArr.indexOf(COORDINATION_LABELS.READY);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(argsArr[readyIdx - 1]).toBe("--label");
  });

  it("includes title and body verbatim alongside the non-state labels", () => {
    const argsArr = buildRcaCreateArgs("My RCA Title", "My RCA Body");

    expect(argsArr).toEqual([
      "--title",
      "My RCA Title",
      "--body",
      "My RCA Body",
      "--label",
      "meta-improvement",
      "--label",
      "ready",
      "--label",
      "critical",
    ]);
  });
});
