import { describe, it, expect } from "vitest";
import {
  verifyIssue,
  shouldActOnResult,
  verifyCiFix,
  verifyAcmm,
  verifyAudit,
  verifySentry,
  verifyBug,
  verifySecurity,
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

  it("does not verify when CI runs cannot be queried", () => {
    const result = verifyCiFix(depsThatThrowOnRuns());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("Could not query CI runs");
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

  it("does not verify when ACMM state is unavailable", () => {
    const result = verifyAcmm("fix acmm:foo-bar gap", depsThatThrowOnRead());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("ACMM state not available");
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

  it("does not verify when the inventory is unavailable", () => {
    const result = verifyAudit("Fix perf", "no url here", depsThatThrowOnRead());

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("run a site audit first");
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

  it("does not verify when CI runs cannot be queried", () => {
    const result = verifyBug(depsThatThrowOnRuns());

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("Could not verify — CI unavailable");
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
});
