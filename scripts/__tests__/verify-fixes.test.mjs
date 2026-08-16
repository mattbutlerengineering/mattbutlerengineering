import { describe, it, expect } from "vitest";
import { GhAuthError } from "@mbe/gh-client";
import {
  verifyIssue,
  shouldActOnResult,
  verifyCiFix,
  verifyAcmm,
  verifyAudit,
  verifySentry,
  verifyBug,
  verifySecurity,
  queryClosedIssuesWithSensorLabels,
} from "../verify-fixes.mjs";

const issueWith = (...labels) => ({
  number: 1,
  title: "Test issue",
  body: "",
  labels: labels.map((name) => ({ name })),
});

// Fake VerifyDeps builders — no real `gh` calls or filesystem reads.
const depsWithRuns = (runs) => ({
  listWorkflowRuns: () => runs,
  readJson: () => {
    throw new Error("readJson should not be called by this verifier");
  },
});

const depsThatThrowOnRuns = () => ({
  listWorkflowRuns: () => {
    throw new Error("gh unavailable");
  },
  readJson: () => {
    throw new Error("readJson should not be called by this verifier");
  },
});

const depsWithJson = (json) => ({
  listWorkflowRuns: () => {
    throw new Error("listWorkflowRuns should not be called by this verifier");
  },
  readJson: () => json,
});

const depsThatThrowOnRead = () => ({
  listWorkflowRuns: () => {
    throw new Error("listWorkflowRuns should not be called by this verifier");
  },
  readJson: () => {
    throw new Error("file not found");
  },
});

// ---------------------------------------------------------------------------
// Unhandled labels must abstain, not act.
//
// verifyIssue's fall-through used to omit `confidence`, and the caller gated
// its side effects on `result.confidence !== "skip"` — so `undefined !==
// "skip"` read as "act". An issue carrying a label no verifier handles (today:
// `meta-improvement`, which the registry stamps but verifyIssue has no branch
// for) was commented on and reopened purely because nothing could check it.
// ---------------------------------------------------------------------------

describe("verifyIssue — unhandled labels", () => {
  it("abstains with confidence: skip when no verifier matches", () => {
    const result = verifyIssue(issueWith("meta-improvement"));

    expect(result.confidence).toBe("skip");
    expect(result.verified).toBe(false);
  });

  it("abstains for an issue with no labels at all", () => {
    expect(verifyIssue({ number: 2, title: "t", body: "" }).confidence).toBe("skip");
  });

  it("keeps the caller from commenting or reopening on an abstention", () => {
    expect(shouldActOnResult(verifyIssue(issueWith("meta-improvement")))).toBe(false);
  });
});

describe("shouldActOnResult", () => {
  it("acts on a definite verdict, whatever its confidence", () => {
    expect(shouldActOnResult({ verified: true })).toBe(true);
    expect(shouldActOnResult({ verified: false, confidence: "low" })).toBe(true);
    expect(shouldActOnResult({ verified: true, confidence: "medium" })).toBe(true);
  });

  it("never acts on an abstention", () => {
    expect(shouldActOnResult({ verified: false, confidence: "skip" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyCiFix — injected `listWorkflowRuns`, zero real `gh` calls.
// ---------------------------------------------------------------------------

describe("verifyCiFix", () => {
  it("verifies when CI pass rate is above the 90% threshold", () => {
    const runs = [
      ...Array(9).fill({ status: "completed", conclusion: "success" }),
      { status: "completed", conclusion: "failure" },
    ];
    const result = verifyCiFix(depsWithRuns(runs));

    expect(result.verified).toBe(true);
    expect(result.reason).toContain("90%");
  });

  // ---------------------------------------------------------------------
  // #4246: verifyCiFix used to read the last 10 workflow runs on `main`
  // with NO workflow-name filter, so a dip in unrelated automation
  // workflows (`claude`, `Revert RCA Detection`, `Auto-Merge Policy`,
  // `Synthetic Monitoring`, …) reopened already-fixed, already-verified
  // `ci-fix` issues (#4211, #4208). It must query only the `CI` workflow
  // (whose `CI Gate` job is the actual thing a `ci-fix` fix targets).
  // ---------------------------------------------------------------------

  it("scopes the workflow-run query to the CI workflow, not all workflows on main", () => {
    let capturedArgs = null;
    const deps = {
      listWorkflowRuns: (args) => {
        capturedArgs = args;
        return Array(10).fill({ status: "completed", conclusion: "success" });
      },
      readJson: () => {
        throw new Error("readJson should not be called by this verifier");
      },
    };

    verifyCiFix(deps);

    expect(capturedArgs).toContain("--workflow");
    expect(capturedArgs[capturedArgs.indexOf("--workflow") + 1]).toBe("CI");
  });

  it("reproduces the false-positive shape: a merged, CI-green fix must not be reopened by a dip in unrelated-workflow noise", () => {
    // Simulates real `gh run list --workflow CI` filtering: the CI-scoped
    // view is clean (the fix's own workflow is healthy), while an unscoped
    // query mixing in unrelated automation workflows would read as a dip
    // below the 90% threshold — exactly the shape observed on #4211 (80%)
    // and #4208 (67%).
    const ciOnlyRuns = Array(10).fill({ status: "completed", conclusion: "success" });
    const unscopedNoisyRuns = [
      ...Array(6).fill({ status: "completed", conclusion: "success" }),
      ...Array(4).fill({ status: "completed", conclusion: "failure" }), // unrelated workflow noise
    ];
    const deps = {
      listWorkflowRuns: (args) => (args.includes("--workflow") ? ciOnlyRuns : unscopedNoisyRuns),
      readJson: () => {
        throw new Error("readJson should not be called by this verifier");
      },
    };

    const result = verifyCiFix(deps);

    expect(result.verified).toBe(true);
    expect(result.reason).toContain("CI pass rate on main");
  });

  it("does not verify when CI pass rate is below 90%", () => {
    const runs = [
      ...Array(8).fill({ status: "completed", conclusion: "success" }),
      ...Array(2).fill({ status: "completed", conclusion: "failure" }),
    ];
    const result = verifyCiFix(depsWithRuns(runs));

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("still low");
  });

  it("verifies at exactly the 90% boundary", () => {
    // 9/10 = 90.0% exactly — the `>= 90` boundary must include this.
    const runs = [
      ...Array(9).fill({ status: "completed", conclusion: "success" }),
      { status: "completed", conclusion: "failure" },
    ];
    const result = verifyCiFix(depsWithRuns(runs));

    expect(result.reason).toContain("90% (9/10");
    expect(result.verified).toBe(true);
  });

  it("abstains (does not comment or reopen) when CI runs cannot be queried", () => {
    // A query failure is data being unavailable, not evidence of a
    // regression — same class of bug as #4207 below. Must abstain, not
    // read as a definite "not verified" that triggers a reopen.
    const result = verifyCiFix(depsThatThrowOnRuns());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("Could not query CI runs");
    expect(result.confidence).toBe("skip");
    expect(shouldActOnResult(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyAcmm — injected `readJson`, zero real filesystem reads.
// ---------------------------------------------------------------------------

describe("verifyAcmm", () => {
  it("verifies when the named ACMM criterion now passes", () => {
    const state = {
      currentLevel: 3,
      checks: { "acmm:foo-bar": { passed: true, evidence: "found 3 files" } },
    };
    const result = verifyAcmm("fix acmm:foo-bar gap", depsWithJson(state));

    expect(result.verified).toBe(true);
    expect(result.reason).toContain("acmm:foo-bar");
  });

  it("does not verify when the named ACMM criterion still fails", () => {
    const state = { currentLevel: 3, checks: { "acmm:foo-bar": { passed: false } } };
    const result = verifyAcmm("fix acmm:foo-bar gap", depsWithJson(state));

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("still failing");
  });

  it("returns a low-confidence overall summary when no criterion is named", () => {
    const state = {
      currentLevel: 2,
      checks: { a: { passed: true }, b: { passed: false } },
    };
    const result = verifyAcmm("generic improvement", depsWithJson(state));

    expect(result.verified).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("1/2");
  });

  it("abstains (does not comment or reopen) when ACMM state is unavailable", () => {
    const result = verifyAcmm("fix acmm:foo-bar gap", depsThatThrowOnRead());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("ACMM state not available");
    expect(result.confidence).toBe("skip");
    expect(shouldActOnResult(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyAudit — injected `readJson`, zero real filesystem reads.
// ---------------------------------------------------------------------------

describe("verifyAudit", () => {
  const inventory = {
    surfaces: [{ url: "https://example.com/", scores: { performance: 0.95, seo: 0.92 } }],
  };

  it("verifies when all Lighthouse scores are >= 0.9", () => {
    const result = verifyAudit(
      "Fix perf",
      "See https://example.com/ for details",
      depsWithJson(inventory)
    );

    expect(result.verified).toBe(true);
    expect(result.reason).toContain("All Lighthouse scores");
  });

  it("does not verify when some Lighthouse scores are below 0.9", () => {
    const lowScoring = {
      surfaces: [{ url: "https://example.com/", scores: { performance: 0.7 } }],
    };
    const result = verifyAudit(
      "Fix perf",
      "See https://example.com/ for details",
      depsWithJson(lowScoring)
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("below 0.9");
  });

  // #4246 / #4207: an `audit`-labeled issue ("Dialog/Drawer/CommandPalette/
  // ConfirmDialog closed-state assertions") was reopened with the reason
  // "Lighthouse inventory not available — run a site audit first" — a data
  // availability failure, not evidence the fix regressed. It must abstain.
  it("abstains (does not comment or reopen) when the inventory is unavailable", () => {
    const result = verifyAudit("Fix perf", "no url here", depsThatThrowOnRead());

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("run a site audit first");
    expect(result.confidence).toBe("skip");
    expect(shouldActOnResult(result)).toBe(false);
  });

  it("abstains with low confidence when the issue body has no matching surface", () => {
    const result = verifyAudit("Fix perf", "no url here", depsWithJson(inventory));

    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// verifySentry / verifySecurity — no I/O, fixed results.
// ---------------------------------------------------------------------------

describe("verifySentry", () => {
  it("always abstains — Sentry verification is not yet available", () => {
    const result = verifySentry();

    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("skip");
  });
});

describe("verifySecurity", () => {
  it("always returns a low-confidence not-verified result", () => {
    const result = verifySecurity();

    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// verifyBug — injected `listWorkflowRuns`, zero real `gh` calls.
// ---------------------------------------------------------------------------

describe("verifyBug", () => {
  it("verifies when the latest completed CI run on main passed", () => {
    const runs = [{ status: "completed", conclusion: "success" }];
    const result = verifyBug(depsWithRuns(runs));

    expect(result.verified).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("does not verify when the latest completed CI run on main failed", () => {
    const runs = [{ status: "completed", conclusion: "failure" }];
    const result = verifyBug(depsWithRuns(runs));

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("failure");
  });

  it("abstains (does not comment or reopen) when CI runs cannot be queried", () => {
    const result = verifyBug(depsThatThrowOnRuns());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("Could not verify — CI unavailable");
    expect(result.confidence).toBe("skip");
    expect(shouldActOnResult(result)).toBe(false);
  });

  it("scopes the workflow-run query to the CI workflow, not all workflows on main", () => {
    let capturedArgs = null;
    const deps = {
      listWorkflowRuns: (args) => {
        capturedArgs = args;
        return [{ status: "completed", conclusion: "success" }];
      },
      readJson: () => {
        throw new Error("readJson should not be called by this verifier");
      },
    };

    verifyBug(deps);

    expect(capturedArgs).toContain("--workflow");
    expect(capturedArgs[capturedArgs.indexOf("--workflow") + 1]).toBe("CI");
  });

  it("reproduces the false-positive shape: a bug-labeled issue with clean CI-workflow history must not be reopened by a dip in unrelated-workflow noise", () => {
    // Mirrors the verifyCiFix regression test above — same false-positive
    // class (#4211/#4208), same fix, sibling verifier.
    const ciOnlyRuns = [{ status: "completed", conclusion: "success" }];
    const unscopedNoisyRuns = [{ status: "completed", conclusion: "failure" }]; // unrelated workflow noise
    const deps = {
      listWorkflowRuns: (args) => (args.includes("--workflow") ? ciOnlyRuns : unscopedNoisyRuns),
      readJson: () => {
        throw new Error("readJson should not be called by this verifier");
      },
    };

    const result = verifyBug(deps);

    expect(result.verified).toBe(true);
    expect(result.reason).toContain("passed after fix merged");
  });
});

// ---------------------------------------------------------------------------
// verifyIssue routing threads deps through to the matching verifier.
// ---------------------------------------------------------------------------

describe("verifyIssue — routes injected deps to the matching verifier", () => {
  it("routes ci-fix through verifyCiFix using injected deps", () => {
    const runs = Array(10).fill({ status: "completed", conclusion: "success" });
    const result = verifyIssue(issueWith("ci-fix"), depsWithRuns(runs));

    expect(result.verified).toBe(true);
  });

  it("routes acmm through verifyAcmm using injected deps", () => {
    const state = { currentLevel: 1, checks: {} };
    const result = verifyIssue(issueWith("acmm"), depsWithJson(state));

    expect(result.confidence).toBe("low");
  });

  // #4216: an implement-queue review-gate issue that merely carried a stray
  // `audit` label (it was never an actual site-audit finding) got routed
  // through verifyAudit anyway, hit the same "Lighthouse inventory not
  // available" branch as #4207, and was reopened. Fixed by the same
  // confidence: "skip" change verified above — routing an `audit`-labeled
  // issue to verifyAudit is safe now regardless of whether it's a genuine
  // Lighthouse finding, because "no inventory" always abstains rather than
  // acting.
  it("routes audit through verifyAudit and abstains when Lighthouse data is unavailable, even for a stray audit label (#4216)", () => {
    const result = verifyIssue(issueWith("audit"), depsThatThrowOnRead());

    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("skip");
    expect(shouldActOnResult(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// queryClosedIssuesWithSensorLabels — injected `listIssues`, zero real `gh`
// calls.
//
// #3937: an auth failure (Claude Code Remote's REST fallback token isn't
// valid for direct api.github.com calls) must be distinguishable from a
// legitimately empty result set, instead of both collapsing to the same
// `safe(..., [])`-swallowed "nothing to verify" shape.
// ---------------------------------------------------------------------------

describe("queryClosedIssuesWithSensorLabels", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const withinWindow = "2026-08-07T00:00:00Z"; // 12h before `now`
  const outsideWindow = "2026-08-01T00:00:00Z"; // 6 days before `now`

  it("filters to closed, in-window issues carrying a sensor label", () => {
    const issues = [
      { number: 1, closedAt: withinWindow, labels: [{ name: "ci-fix" }] },
      { number: 2, closedAt: outsideWindow, labels: [{ name: "ci-fix" }] }, // too old
      { number: 3, closedAt: withinWindow, labels: [{ name: "unrelated" }] }, // no sensor label
      { number: 4, closedAt: null, labels: [{ name: "ci-fix" }] }, // still open
    ];

    const result = queryClosedIssuesWithSensorLabels(() => issues, {
      lookbackHours: 48,
      sensorLabels: ["ci-fix"],
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((i) => i.number)).toEqual([1]);
  });

  it("returns ok:true with an empty array when the query legitimately finds nothing", () => {
    const result = queryClosedIssuesWithSensorLabels(() => [], {
      lookbackHours: 48,
      sensorLabels: ["ci-fix"],
      now,
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("returns ok:false with a distinguishable reason when the query throws (e.g. auth failure)", () => {
    const result = queryClosedIssuesWithSensorLabels(
      () => {
        throw new GhAuthError("GET", "/repos/o/r/issues", 401, "Bad credentials");
      },
      { lookbackHours: 48, sensorLabels: ["ci-fix"], now }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/auth/i);
  });
});
