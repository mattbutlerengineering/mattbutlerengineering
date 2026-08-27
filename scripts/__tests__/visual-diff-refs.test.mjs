import { describe, it, expect } from "vitest";
import {
  MIN_AGE_HOURS,
  REF_PREFIX,
  REF_ROOT,
  buildRefName,
  fullRef,
  parseRefName,
  planRefSweep,
  selectRefsToDelete,
} from "../visual-diff-refs.mjs";

// ---------------------------------------------------------------------------
// Namespace constants — Milestone 5's probe is a one-constant change (REF_ROOT
// flips from "refs/heads" to "refs" if refs/visual-diffs/… turns out to be
// pushable under GITHUB_TOKEN), so nothing else may spell either segment out.
// ---------------------------------------------------------------------------

describe("ref namespace constants", () => {
  it("exports the branch-name prefix as a single constant", () => {
    expect(REF_PREFIX).toBe("visual-diffs");
  });

  it("exports the ref root separately, so the custom-namespace probe is one edit", () => {
    expect(REF_ROOT).toBe("refs/heads");
  });
});

// ---------------------------------------------------------------------------
// buildRefName / fullRef
// ---------------------------------------------------------------------------

describe("buildRefName", () => {
  it("produces exactly visual-diffs/pr-<N>/run-<id>-attempt-<n>", () => {
    expect(buildRefName({ prNumber: 4567, runId: 32873184619, runAttempt: 1 })).toBe(
      "visual-diffs/pr-4567/run-32873184619-attempt-1"
    );
  });

  it("accepts string inputs unchanged (run ids arrive from the environment as strings)", () => {
    expect(buildRefName({ prNumber: "12", runId: "34", runAttempt: "5" })).toBe(
      "visual-diffs/pr-12/run-34-attempt-5"
    );
  });

  it("is built from REF_PREFIX rather than a second literal", () => {
    expect(
      buildRefName({ prNumber: 1, runId: 2, runAttempt: 1 }).startsWith(`${REF_PREFIX}/`)
    ).toBe(true);
  });

  // The re-run case, reproduced verbatim from the review. GitHub keeps
  // GITHUB_RUN_ID stable across "Re-run failed jobs" and increments
  // GITHUB_RUN_ATTEMPT. Two attempts build two DIFFERENT orphan commits —
  // commit-tree's committer timestamp differs even for a byte-identical tree —
  // so a name that omits the attempt makes attempt 2's push a non-fast-forward:
  //
  //   ! [rejected]  6984e4a... -> visual-diffs/pr-1/run-999 (non-fast-forward)
  //
  // `--force` is banned by design and by test, so execFileSync throws, the
  // publisher exits 1, and the comment keeps attempt 1's images — defeating
  // SC-4, whose demonstration in breakdown.md item 3.5 step 5 IS a re-run.
  it("gives a re-run its own ref, so attempt 2 never pushes at attempt 1's ref", () => {
    const attempt1 = buildRefName({ prNumber: 1, runId: 999, runAttempt: 1 });
    const attempt2 = buildRefName({ prNumber: 1, runId: 999, runAttempt: 2 });
    expect(attempt2).not.toBe(attempt1);
  });
});

describe("fullRef", () => {
  it("prefixes the ref root, giving the push destination", () => {
    expect(fullRef("visual-diffs/pr-1/run-2")).toBe("refs/heads/visual-diffs/pr-1/run-2");
  });
});

// ---------------------------------------------------------------------------
// parseRefName — round-trips, and returns null (never throws) for anything else
// ---------------------------------------------------------------------------

describe("parseRefName", () => {
  it("round-trips a constructed name, attempt included", () => {
    const name = buildRefName({ prNumber: 4567, runId: 32873184619, runAttempt: 3 });
    expect(parseRefName(name)).toEqual({ prNumber: 4567, runId: 32873184619, runAttempt: 3 });
  });

  it("returns null for main", () => {
    expect(parseRefName("main")).toBeNull();
  });

  it("returns null for the bare prefix", () => {
    expect(parseRefName("visual-diffs/")).toBeNull();
  });

  it("returns null for a trailing-slash variant", () => {
    expect(parseRefName("visual-diffs/pr-1/run-2-attempt-1/")).toBeNull();
  });

  it("returns null for a fully-qualified ref (callers strip refs/heads/ first)", () => {
    expect(parseRefName("refs/heads/visual-diffs/pr-1/run-2-attempt-1")).toBeNull();
  });

  it("returns null for a non-numeric PR number", () => {
    expect(parseRefName("visual-diffs/pr-abc/run-2-attempt-1")).toBeNull();
  });

  it("returns null for an empty run id", () => {
    expect(parseRefName("visual-diffs/pr-1/run--attempt-1")).toBeNull();
  });

  it("returns null for a prefix that merely starts the same way", () => {
    expect(parseRefName("visual-diffs-old/pr-1/run-2-attempt-1")).toBeNull();
  });

  it("returns null for a name carrying no attempt segment", () => {
    // Fail-safe direction: a name this function cannot read is never selected
    // for deletion, so an unrecognised shape leaks rather than losing images.
    expect(parseRefName("visual-diffs/pr-1/run-2")).toBeNull();
  });

  // Executed, not reasoned: the pre-fix regex admitted `run-([0-9A-Za-z._-]+)`,
  // so `Number('abc')` was NaN and the keep-clause's `NaN === NaN` was false —
  // a single ref `visual-diffs/pr-42/run-abc` on an OPEN pull request came back
  // as `toDelete: [{reason:'superseded-on-open-pr'}]`, deleting the only ref
  // that PR had. Rejecting a non-numeric ordinal outright resolves toward keep.
  it("returns null for a non-numeric run id", () => {
    expect(parseRefName("visual-diffs/pr-42/run-abc-attempt-1")).toBeNull();
  });

  it("returns null for a non-numeric attempt", () => {
    expect(parseRefName("visual-diffs/pr-42/run-5-attempt-x")).toBeNull();
  });

  it("returns null rather than throwing for non-string input", () => {
    expect(parseRefName(null)).toBeNull();
    expect(parseRefName(undefined)).toBeNull();
    expect(parseRefName(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4.1 — retention. The rule IS the storage design: reachability is what keeps
// a standing comment's images alive.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-25T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** A ref as `git for-each-ref` reports it after fetching the namespace. */
function ref(prNumber, runId, ageHours, runAttempt = 1) {
  return {
    name: buildRefName({ prNumber, runId, runAttempt }),
    committedAt: hoursAgo(ageHours),
  };
}

const names = (list) => list.map((r) => r.name);

describe("MIN_AGE_HOURS", () => {
  it("is an exported constant", () => {
    expect(MIN_AGE_HOURS).toBe(24);
  });
});

describe("selectRefsToDelete", () => {
  it("KEEPS the newest ref of an open PR even when it is far past the age floor", () => {
    // The invariant the data model names: a commit referenced by a standing
    // comment is always reachable. A flat age floor was the alternative and
    // loses on exactly this case — a PR open longer than the floor would have
    // its own images deleted out from under a live comment, breaking SC-3.
    const refs = [ref(10, 900, 500), ref(10, 800, 600)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toEqual([buildRefName({ prNumber: 10, runId: 800, runAttempt: 1 })]);
  });

  it("DELETES superseded runs on an open PR", () => {
    const refs = [ref(10, 900, 100), ref(10, 800, 200), ref(10, 700, 300)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toEqual([
      buildRefName({ prNumber: 10, runId: 800, runAttempt: 1 }),
      buildRefName({ prNumber: 10, runId: 700, runAttempt: 1 }),
    ]);
  });

  it("DELETES every ref of a closed or merged PR, newest included", () => {
    const refs = [ref(11, 900, 100), ref(11, 800, 200)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toHaveLength(2);
  });

  it("KEEPS any ref younger than the age floor — its run may still be in flight", () => {
    // The comment for that run may not be written yet.
    const refs = [ref(11, 900, 1), ref(11, 800, 2)];
    expect(selectRefsToDelete({ refs, openPrNumbers: [], now: NOW })).toEqual([]);
  });

  it("KEEPS a young superseded ref on an open PR", () => {
    const refs = [ref(10, 900, 1), ref(10, 800, 2)];
    expect(selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW })).toEqual([]);
  });

  it("deletes a ref exactly at the age floor", () => {
    const refs = [ref(11, 900, 24)];
    expect(names(selectRefsToDelete({ refs, openPrNumbers: [], now: NOW }))).toHaveLength(1);
  });

  it("NEVER selects a ref name it cannot parse — fail-safe", () => {
    const refs = [
      { name: "main", committedAt: hoursAgo(9000) },
      { name: "visual-diffs/garbage", committedAt: hoursAgo(9000) },
      { name: "visual-diffs/pr-x/run-y", committedAt: hoursAgo(9000) },
    ];
    expect(selectRefsToDelete({ refs, openPrNumbers: [], now: NOW })).toEqual([]);
  });

  it("honors an explicit minAgeHours override", () => {
    const refs = [ref(11, 900, 5)];
    expect(selectRefsToDelete({ refs, openPrNumbers: [], now: NOW, minAgeHours: 1 })).toHaveLength(
      1
    );
    expect(selectRefsToDelete({ refs, openPrNumbers: [], now: NOW, minAgeHours: 48 })).toHaveLength(
      0
    );
  });

  it("compares run ids numerically when choosing the newest", () => {
    // Run ids are numbers of differing lengths; a raw string compare would call
    // run-9000000000 newer than run-32873184619 and delete the live one.
    const refs = [ref(10, 32873184619, 100), ref(10, 9000000000, 200)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toEqual([
      buildRefName({ prNumber: 10, runId: 9000000000, runAttempt: 1 }),
    ]);
  });

  it("KEEPS the newest ATTEMPT of the newest run, not merely the newest run id", () => {
    // A re-run keeps GITHUB_RUN_ID and increments GITHUB_RUN_ATTEMPT, so the
    // two refs of one re-run PR share a run id. Sorting on the run id alone
    // makes them indistinguishable and the tie resolves arbitrarily — which
    // can retire the very ref the standing comment points at.
    const refs = [ref(10, 900, 100, 1), ref(10, 900, 90, 2)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toEqual([buildRefName({ prNumber: 10, runId: 900, runAttempt: 1 })]);
  });

  it("orders on the tuple run id first — a high attempt of an older run still loses", () => {
    const refs = [ref(10, 900, 100, 1), ref(10, 800, 90, 9)];
    const toDelete = selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(names(toDelete)).toEqual([buildRefName({ prNumber: 10, runId: 800, runAttempt: 9 })]);
  });

  it("accepts open PR numbers as strings or numbers", () => {
    const refs = [ref(10, 900, 100), ref(10, 800, 200)];
    expect(selectRefsToDelete({ refs, openPrNumbers: ["10"], now: NOW })).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const refs = [ref(10, 900, 100), ref(10, 800, 200)];
    const before = JSON.stringify(refs);
    selectRefsToDelete({ refs, openPrNumbers: [10], now: NOW });
    expect(JSON.stringify(refs)).toBe(before);
  });

  it("returns [] for an empty or missing ref list", () => {
    expect(selectRefsToDelete({ refs: [], openPrNumbers: [], now: NOW })).toEqual([]);
    expect(selectRefsToDelete({ openPrNumbers: [], now: NOW })).toEqual([]);
  });
});

describe("planRefSweep", () => {
  it("gives every ref a verdict with a reason, so a dry run is readable", () => {
    const refs = [ref(10, 900, 100), ref(10, 800, 200), ref(11, 700, 300), ref(12, 600, 1)];
    const plan = planRefSweep({ refs, openPrNumbers: [10], now: NOW });
    expect(plan.toDelete.length + plan.retained.length).toBe(refs.length);
    for (const entry of [...plan.toDelete, ...plan.retained]) {
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  // Found by exercising main() against a sandbox remote: `commitDate` returns
  // null when the GitHub commit lookup 404s, and `new Date(null)` is the UNIX
  // epoch — a finite, ~57-year-old timestamp — not an invalid date. So a ref
  // nobody could date read as ancient and was DELETED, which is the exact
  // opposite of the fail-safe direction the rule promises.
  it.each([null, undefined, "", "   ", "not-a-date", 0, {}])(
    "keeps a ref it cannot date (committedAt %o) instead of reading it as ancient",
    (committedAt) => {
      const refs = [{ name: buildRefName({ prNumber: 77, runId: 5, runAttempt: 1 }), committedAt }];
      const plan = planRefSweep({ refs, openPrNumbers: [], now: NOW });
      expect(plan.toDelete).toEqual([]);
      expect(plan.retained.map((r) => r.reason)).toEqual(["undated"]);
    }
  );

  it("keeps a ref whose committedAt key is absent entirely", () => {
    const refs = [{ name: buildRefName({ prNumber: 78, runId: 6, runAttempt: 1 }) }];
    const plan = planRefSweep({ refs, openPrNumbers: [], now: NOW });
    expect(plan.toDelete).toEqual([]);
    expect(plan.retained[0].reason).toBe("undated");
  });

  // Executed against the pre-fix code, not reasoned about: a SINGLE ref named
  // `visual-diffs/pr-42/run-abc` on an OPEN pull request came back as
  // `toDelete: [{ reason: 'superseded-on-open-pr' }]` with `retained: []`,
  // because the keep-clause compared `Number('abc') === Number('abc')` — i.e.
  // `NaN === NaN`, which is false. Same shape as the epoch bug: an ordinal the
  // rule cannot read must resolve toward KEEP, never toward delete.
  it("never deletes the only ref of an open PR because its ordinal is unreadable", () => {
    const refs = [{ name: "visual-diffs/pr-42/run-abc", committedAt: hoursAgo(9000) }];
    const plan = planRefSweep({ refs, openPrNumbers: [42], now: NOW });
    expect(plan.toDelete).toEqual([]);
    expect(plan.retained.map((r) => r.reason)).toEqual(["unparsable"]);
  });

  it("labels each retention clause distinctly", () => {
    const refs = [
      ref(10, 900, 100),
      ref(10, 800, 5),
      { name: "main", committedAt: hoursAgo(9000) },
    ];
    const plan = planRefSweep({ refs, openPrNumbers: [10], now: NOW });
    const reasons = new Set(plan.retained.map((r) => r.reason));
    expect(reasons).toEqual(new Set(["newest-on-open-pr", "too-recent", "unparsable"]));
  });
});
