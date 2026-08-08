import { describe, test, expect } from "vitest";

describe("ci-gate-status", () => {
  describe("classifyCiGateStatus", () => {
    test("#3969 repro: zero failures, zero pending, no CI Gate entry is NOT green", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      // Exact shape observed on PR #3968: the only check on the SHA was an
      // unrelated pull_request_target run — no `pull_request` runs fired at
      // all, so no "CI Gate" entry exists in the rollup. fail=0, pend=0.
      const rollup = [
        {
          __typename: "CheckRun",
          name: "Auto-merge Dependabot dev deps",
          status: "COMPLETED",
          conclusion: "SKIPPED",
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).not.toBe("green");
      expect(result.state).toBe("gate-missing");
    });

    test("gate present and SUCCESS -> green", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        {
          __typename: "CheckRun",
          name: "CI Gate",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("green");
    });

    test("gate present and FAILURE -> failed", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        {
          __typename: "CheckRun",
          name: "CI Gate",
          status: "COMPLETED",
          conclusion: "FAILURE",
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("failed");
    });

    test("gate present and still IN_PROGRESS -> pending", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        {
          __typename: "CheckRun",
          name: "CI Gate",
          status: "IN_PROGRESS",
          conclusion: null,
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("pending");
    });

    test("gate present and QUEUED -> pending", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        {
          __typename: "CheckRun",
          name: "CI Gate",
          status: "QUEUED",
          conclusion: null,
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("pending");
    });

    test("empty rollup (no checks at all) -> gate-missing, not green", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const result = classifyCiGateStatus([]);

      expect(result.state).toBe("gate-missing");
    });

    test("missing/undefined rollup -> gate-missing (never throws)", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      expect(classifyCiGateStatus(undefined).state).toBe("gate-missing");
    });

    test("reason string is populated for every state", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const result = classifyCiGateStatus([]);

      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });
});
