import { describe, it, expect } from "vitest";
import {
  deriveFailingApps,
  extractFailingTestTitles,
  buildGrepPattern,
  regenBranchFor,
  isDuplicatePending,
  planRegenDispatches,
  renderDriftComment,
} from "../visual-regen-trigger.mjs";

// ---------------------------------------------------------------------------
// deriveFailingApps — which app(s) a workflow_run's job list says went red.
// ---------------------------------------------------------------------------

describe("deriveFailingApps", () => {
  it("returns the app for a failed job named 'Visual Regression (<app>)'", () => {
    const jobs = [{ name: "Visual Regression (marketing)", conclusion: "failure" }];
    expect(deriveFailingApps(jobs)).toEqual(["marketing"]);
  });

  it("returns every failing app, sorted, when more than one job failed", () => {
    const jobs = [
      { name: "Visual Regression (hospitality)", conclusion: "failure" },
      { name: "Visual Regression (marketing)", conclusion: "failure" },
    ];
    expect(deriveFailingApps(jobs)).toEqual(["hospitality", "marketing"]);
  });

  it("ignores a passing visual job", () => {
    const jobs = [{ name: "Visual Regression (marketing)", conclusion: "success" }];
    expect(deriveFailingApps(jobs)).toEqual([]);
  });

  it("ignores a cancelled visual job — cancelled is not a real regression", () => {
    const jobs = [{ name: "Visual Regression (marketing)", conclusion: "cancelled" }];
    expect(deriveFailingApps(jobs)).toEqual([]);
  });

  it("ignores jobs that are not the visual job (e.g. the publisher)", () => {
    const jobs = [{ name: "Publish Visual Diffs (marketing)", conclusion: "failure" }];
    expect(deriveFailingApps(jobs)).toEqual([]);
  });

  it("recognizes rialto-web-e2e.yml's job name too", () => {
    const jobs = [{ name: "Visual Regression (rialto-web)", conclusion: "failure" }];
    expect(deriveFailingApps(jobs)).toEqual(["rialto-web"]);
  });

  it("handles an empty or missing job list", () => {
    expect(deriveFailingApps([])).toEqual([]);
    expect(deriveFailingApps(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractFailingTestTitles — the EXACT spec titles, never a sanitized
// attachment filename (that's the #8440 failure mode: grep=home matched
// nothing because the real title is "/ @ 1280x720").
// ---------------------------------------------------------------------------

describe("extractFailingTestTitles", () => {
  it("collects the title of every failing spec, walking nested suites", () => {
    const report = {
      suites: [
        {
          specs: [{ title: "/ @ 1280x720", ok: false }],
          suites: [{ specs: [{ title: "/status @ 375x812", ok: false }] }],
        },
      ],
    };
    expect(extractFailingTestTitles(report)).toEqual(["/ @ 1280x720", "/status @ 375x812"]);
  });

  it("excludes passing specs", () => {
    const report = { suites: [{ specs: [{ title: "/ @ 1280x720", ok: true }] }] };
    expect(extractFailingTestTitles(report)).toEqual([]);
  });

  it("returns an empty array for a missing or empty report", () => {
    expect(extractFailingTestTitles({})).toEqual([]);
    expect(extractFailingTestTitles(undefined)).toEqual([]);
  });

  it("sorts the result so callers get a stable grep", () => {
    const report = {
      suites: [
        {
          specs: [
            { title: "b @ 1x1", ok: false },
            { title: "a @ 1x1", ok: false },
          ],
        },
      ],
    };
    expect(extractFailingTestTitles(report)).toEqual(["a @ 1x1", "b @ 1x1"]);
  });
});

// ---------------------------------------------------------------------------
// buildGrepPattern — must be the EXACT title text, regex-escaped, never a
// route fragment (the #8440 failure: `grep=home` matched no test name).
// ---------------------------------------------------------------------------

describe("buildGrepPattern", () => {
  it("returns an exact (escaped) match for a single title", () => {
    expect(buildGrepPattern(["/ @ 1280x720"])).toBe("/ @ 1280x720");
  });

  it("escapes regex metacharacters in a title", () => {
    expect(buildGrepPattern(["/shipped/[slug] @ 1280x720"])).toBe("/shipped/\\[slug\\] @ 1280x720");
  });

  it("joins multiple titles with a regex alternation", () => {
    expect(buildGrepPattern(["/ @ 1280x720", "/status @ 375x812"])).toBe(
      "/ @ 1280x720|/status @ 375x812"
    );
  });

  it("returns an empty string for no titles — the caller omits --grep entirely", () => {
    expect(buildGrepPattern([])).toBe("");
    expect(buildGrepPattern(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// regenBranchFor / isDuplicatePending — dedupe reuses visual-baseline-regen's
// OWN branch naming convention rather than restating it.
// ---------------------------------------------------------------------------

describe("regenBranchFor", () => {
  it("matches visual-baseline-regen.mjs's own branch convention", () => {
    expect(regenBranchFor("marketing")).toBe("automation/visual-baseline-regen/marketing");
  });
});

describe("isDuplicatePending", () => {
  it("is true when an open PR already carries that app's regen branch", () => {
    expect(
      isDuplicatePending(
        ["automation/visual-baseline-regen/marketing", "some-other-branch"],
        "marketing"
      )
    ).toBe(true);
  });

  it("is false when no open PR carries that branch", () => {
    expect(isDuplicatePending(["some-other-branch"], "marketing")).toBe(false);
  });

  it("is false for an empty or missing branch list", () => {
    expect(isDuplicatePending([], "marketing")).toBe(false);
    expect(isDuplicatePending(undefined, "marketing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// planRegenDispatches — the orchestration: failing apps -> dispatch plans,
// skipping any app with a regen PR already open.
// ---------------------------------------------------------------------------

describe("planRegenDispatches", () => {
  const jobs = [
    { name: "Visual Regression (marketing)", conclusion: "failure" },
    { name: "Visual Regression (hospitality)", conclusion: "failure" },
  ];

  it("dispatches each failing app with its exact-title grep", () => {
    const { dispatch, skipped } = planRegenDispatches({
      jobs,
      reportsByApp: {
        marketing: { suites: [{ specs: [{ title: "/ @ 1280x720", ok: false }] }] },
        hospitality: { suites: [{ specs: [{ title: "/dashboard @ 1280x720", ok: false }] }] },
      },
      openPrHeadRefs: [],
    });
    expect(skipped).toEqual([]);
    expect(dispatch).toEqual([
      {
        app: "hospitality",
        grep: "/dashboard @ 1280x720",
        branch: "automation/visual-baseline-regen/hospitality",
        titleCount: 1,
      },
      {
        app: "marketing",
        grep: "/ @ 1280x720",
        branch: "automation/visual-baseline-regen/marketing",
        titleCount: 1,
      },
    ]);
  });

  it("skips an app that already has an open regen PR — dedupe", () => {
    const { dispatch, skipped } = planRegenDispatches({
      jobs,
      reportsByApp: {
        marketing: { suites: [{ specs: [{ title: "/ @ 1280x720", ok: false }] }] },
        hospitality: { suites: [{ specs: [{ title: "/dashboard @ 1280x720", ok: false }] }] },
      },
      openPrHeadRefs: ["automation/visual-baseline-regen/marketing"],
    });
    expect(dispatch.map((d) => d.app)).toEqual(["hospitality"]);
    expect(skipped).toEqual([
      {
        app: "marketing",
        reason: "duplicate-pending",
        branch: "automation/visual-baseline-regen/marketing",
      },
    ]);
  });

  it("dispatches with an empty grep (whole-suite regen) when no report is available", () => {
    const { dispatch } = planRegenDispatches({
      jobs: [{ name: "Visual Regression (marketing)", conclusion: "failure" }],
      reportsByApp: {},
      openPrHeadRefs: [],
    });
    expect(dispatch).toEqual([
      {
        app: "marketing",
        grep: "",
        branch: "automation/visual-baseline-regen/marketing",
        titleCount: 0,
      },
    ]);
  });

  it("dispatches nothing when nothing failed", () => {
    expect(planRegenDispatches({ jobs: [], reportsByApp: {}, openPrHeadRefs: [] })).toEqual({
      dispatch: [],
      skipped: [],
    });
  });
});

// ---------------------------------------------------------------------------
// renderDriftComment — posted on the merged PR that caused the drift.
// ---------------------------------------------------------------------------

describe("renderDriftComment", () => {
  it("names the app, links the failing run, and never claims auto-merge", () => {
    const body = renderDriftComment({
      app: "marketing",
      grep: "/ @ 1280x720",
      runUrl: "https://github.com/o/r/actions/runs/123",
    });
    expect(body).toContain("marketing");
    expect(body).toContain("https://github.com/o/r/actions/runs/123");
    expect(body).toContain("needs-review");
    expect(body).not.toMatch(/auto-?merge/i);
  });

  it("notes a whole-suite regen when no grep was derived", () => {
    const body = renderDriftComment({ app: "hospitality", grep: "", runUrl: "https://x" });
    expect(body).toContain("hospitality");
    expect(body).not.toContain("--grep");
  });
});
