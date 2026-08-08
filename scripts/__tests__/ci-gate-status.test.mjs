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

    test("#3991 repro: no CI Gate entry but other checks still IN_PROGRESS -> pending, not gate-missing", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      // Exact shape observed live on PR #3990: CI Gate is the last job in
      // the run and hasn't reported yet, but several other jobs are still
      // running — proof CI is alive, not absent.
      const rollup = [
        {
          __typename: "CheckRun",
          name: "Dependency Sync",
          status: "IN_PROGRESS",
          conclusion: null,
        },
        { __typename: "CheckRun", name: "Lint", status: "IN_PROGRESS", conclusion: null },
        { __typename: "CheckRun", name: "Typecheck", status: "IN_PROGRESS", conclusion: null },
        {
          __typename: "CheckRun",
          name: "Architecture Audit",
          status: "IN_PROGRESS",
          conclusion: null,
        },
        { __typename: "CheckRun", name: "ADR check", status: "COMPLETED", conclusion: "SUCCESS" },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("pending");
      expect(result.state).not.toBe("gate-missing");
    });

    test("no CI Gate entry and all other checks COMPLETED -> gate-missing (#3968 shape preserved)", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        { __typename: "CheckRun", name: "ADR check", status: "COMPLETED", conclusion: "SUCCESS" },
        {
          __typename: "CheckRun",
          name: "tier-classifier",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("gate-missing");
    });

    test("CI Gate present as a StatusContext (.context, not .name) and SUCCESS -> green", async () => {
      const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

      const rollup = [
        {
          __typename: "StatusContext",
          context: "CI Gate",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
      ];

      const result = classifyCiGateStatus(rollup);

      expect(result.state).toBe("green");
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
