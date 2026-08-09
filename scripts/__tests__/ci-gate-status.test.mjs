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

    // #4023: `statusCheckRollup` omits check runs produced by `workflow_dispatch`
    // (e.g. the `gate-missing` recovery in SKILL.md step 1). Confirmed on PRs
    // #4011/#4008 that a rollup-invisible-but-successful CI Gate does NOT
    // satisfy branch protection (gh pr merge --auto sat BLOCKED for 6+ minutes)
    // — so this must NOT classify as "green". It's a distinct, non-actionable
    // state: not mergeable, and re-dispatching cannot fix it either (the new
    // run is just as invisible to the rollup).
    describe("workflow_dispatch-produced CI Gate (head-SHA check-runs, #4023)", () => {
      test("rollup-has-gate: green is unaffected by an unused second argument", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [
          { __typename: "CheckRun", name: "CI Gate", status: "COMPLETED", conclusion: "SUCCESS" },
        ];
        // Even if head-SHA check-runs disagree, the rollup already has the
        // gate — GitHub's merge evaluation reads the rollup, so it wins.
        const checkRuns = [{ name: "CI Gate", status: "completed", conclusion: "failure" }];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).toBe("green");
      });

      test("rollup-missing-but-check-runs-has-gate: successful dispatch run -> gate-unattributed, not green", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [
          { __typename: "CheckRun", name: "ADR check", status: "COMPLETED", conclusion: "SUCCESS" },
        ];
        const checkRuns = [
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-08T10:00:00Z",
            completed_at: "2026-08-08T10:05:00Z",
          },
        ];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).not.toBe("green");
        expect(result.state).not.toBe("gate-missing");
        expect(result.state).toBe("gate-unattributed");
        expect(result.reason).toMatch(/dispatch|not.*mergeable|absent from.*rollup/i);
      });

      test("both-missing: no gate in rollup and none in head-SHA check-runs -> gate-missing (#3969 case preserved)", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [
          { __typename: "CheckRun", name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
        ];
        const checkRuns = [{ name: "Trivy", status: "completed", conclusion: "success" }];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).toBe("gate-missing");
      });

      test("second argument defaults to [] when omitted -> gate-missing unaffected (backward compatible)", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [
          { __typename: "CheckRun", name: "ADR check", status: "COMPLETED", conclusion: "SUCCESS" },
        ];

        const result = classifyCiGateStatus(rollup);

        expect(result.state).toBe("gate-missing");
      });

      test("duplicate check-runs: most recent by completed_at wins (newer failure not masked by older success)", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [];
        const checkRuns = [
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-08T09:00:00Z",
            completed_at: "2026-08-08T09:05:00Z",
          },
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "failure",
            started_at: "2026-08-08T10:00:00Z",
            completed_at: "2026-08-08T10:05:00Z",
          },
        ];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).toBe("gate-unattributed");
        expect(result.reason).toMatch(/failure/);
      });

      test("duplicate check-runs: most recent by completed_at wins (newer success not shadowed by older failure)", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [];
        const checkRuns = [
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "failure",
            started_at: "2026-08-08T09:00:00Z",
            completed_at: "2026-08-08T09:05:00Z",
          },
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-08T10:00:00Z",
            completed_at: "2026-08-08T10:05:00Z",
          },
        ];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).toBe("gate-unattributed");
        expect(result.reason).toMatch(/succeeded/);
      });

      test("duplicate check-runs resolve deterministically regardless of array order", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [];
        const newestFirst = [
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-08T10:00:00Z",
            completed_at: "2026-08-08T10:05:00Z",
          },
          {
            name: "CI Gate",
            status: "completed",
            conclusion: "failure",
            started_at: "2026-08-08T09:00:00Z",
            completed_at: "2026-08-08T09:05:00Z",
          },
        ];

        const result = classifyCiGateStatus(rollup, newestFirst);

        expect(result.state).toBe("gate-unattributed");
        expect(result.reason).toMatch(/succeeded/);
      });

      test("gate-unattributed must never be treated as green or as a re-dispatch trigger — reason says so", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [];
        const checkRuns = [{ name: "CI Gate", status: "completed", conclusion: "success" }];

        const result = classifyCiGateStatus(rollup, checkRuns);

        expect(result.state).toBe("gate-unattributed");
        // The reason must be specific enough that a human reading CLI output
        // understands re-dispatching will not help.
        expect(result.reason.toLowerCase()).toContain("dispatch");
      });

      test("non-array second argument degrades to [] rather than throwing", async () => {
        const { classifyCiGateStatus } = await import("../ci-gate-status.mjs");

        const rollup = [
          { __typename: "CheckRun", name: "ADR check", status: "COMPLETED", conclusion: "SUCCESS" },
        ];

        expect(() => classifyCiGateStatus(rollup, "not-an-array")).not.toThrow();
        expect(classifyCiGateStatus(rollup, "not-an-array").state).toBe("gate-missing");
      });
    });
  });
});
