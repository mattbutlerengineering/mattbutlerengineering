import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  backfillHumanTouchReasons,
  runBackfill,
  defaultFetchPrDetails,
  normalizeAuthorLogin,
  isMechanicalCommit,
  parseMaxCalls,
} from "../backfill-human-touch-reasons.mjs";
import { append, read } from "../metrics-store.mjs";
import { HUMAN_TOUCH_REASONS } from "../collect-queue-telemetry.mjs";

// ── Helpers ──────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    issue_number: 1,
    labels: ["feature", "ready"],
    model_tier: "sonnet",
    duration_ms: 45000,
    pr_number: 101,
    merged: true,
    ci_first_pass: false,
    rework_cycles: 1,
    reviewer_verdict: "pass",
    claimed_at: "2026-07-20T10:00:00.000Z",
    merged_at: "2026-07-21T09:00:00.000Z",
    ...overrides,
  };
}

function agentPrDetails(humanCommit = { message: "tidy up", ciConclusion: "success" }) {
  return {
    pr: { headRefName: "worktree-agent-abc", labels: [] },
    humanCommit,
  };
}

// ── Pure core: backfillHumanTouchReasons ────────────────

describe("backfillHumanTouchReasons — classification", () => {
  it("classifies a reworked merged agent-PR row and writes the reason", () => {
    const fetchPrDetails = vi
      .fn()
      .mockReturnValue(agentPrDetails({ message: "fix merge conflicts after rebase" }));
    const { rows, classified, skipped, calls } = backfillHumanTouchReasons([makeRow()], {
      fetchPrDetails,
    });

    expect(rows[0].human_touch_reason).toBe("merge-conflict");
    expect(classified).toBe(1);
    expect(skipped).toBe(0);
    expect(calls).toBe(1);
  });

  it("every classified reason comes from the shared taxonomy", () => {
    const fetchPrDetails = vi.fn().mockReturnValue(agentPrDetails());
    const { rows } = backfillHumanTouchReasons([makeRow()], { fetchPrDetails });
    expect(HUMAN_TOUCH_REASONS).toContain(rows[0].human_touch_reason);
  });
});

// ── Idempotency ──────────────────────────────────────────

describe("backfillHumanTouchReasons — idempotency", () => {
  it("does not re-fetch or overwrite a row that already carries a reason", () => {
    const fetchPrDetails = vi.fn();
    const row = makeRow({ human_touch_reason: "review-fix" });
    const { rows, classified, calls } = backfillHumanTouchReasons([row], { fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(rows[0].human_touch_reason).toBe("review-fix");
    expect(classified).toBe(0);
    expect(calls).toBe(0);
  });

  it("second run over its own output is a no-op", () => {
    const fetchPrDetails = vi
      .fn()
      .mockReturnValue(
        agentPrDetails({ message: "address review comments", reviewCommentsBefore: 2 })
      );
    const first = backfillHumanTouchReasons([makeRow()], { fetchPrDetails });

    fetchPrDetails.mockClear();
    const second = backfillHumanTouchReasons(first.rows, { fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(second.classified).toBe(0);
    expect(second.rows).toEqual(first.rows);
  });
});

// ── Rows left untouched (no null-stomping, no invented reasons) ─

describe("backfillHumanTouchReasons — rows it cannot match or classify", () => {
  it("leaves a still-pending (unmerged) row untouched", () => {
    const fetchPrDetails = vi.fn();
    const row = makeRow({ merged: null });
    const { rows, skipped } = backfillHumanTouchReasons([row], { fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(skipped).toBe(1);
  });

  it("leaves a row with no PR untouched", () => {
    const fetchPrDetails = vi.fn();
    const row = makeRow({ pr_number: null });
    const { rows, skipped } = backfillHumanTouchReasons([row], { fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(skipped).toBe(1);
  });

  it("leaves a row untouched when the PR lookup fails (unmatchable)", () => {
    const fetchPrDetails = vi.fn().mockImplementation(() => {
      throw new Error("gh: PR not found");
    });
    const { rows, skipped, classified } = backfillHumanTouchReasons([makeRow()], {
      fetchPrDetails,
    });

    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(skipped).toBe(1);
    expect(classified).toBe(0);
  });

  it("leaves a row untouched when the PR is not an agent PR", () => {
    const fetchPrDetails = vi.fn().mockReturnValue({
      pr: { headRefName: "feat/manual-thing", labels: [] },
      humanCommit: { message: "fix merge conflicts" },
    });
    const { rows, skipped } = backfillHumanTouchReasons([makeRow()], { fetchPrDetails });

    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(skipped).toBe(1);
  });

  it("leaves a row untouched when no rework commit is found (no human touch occurred)", () => {
    const fetchPrDetails = vi.fn().mockReturnValue({
      pr: { headRefName: "worktree-agent-abc", labels: [] },
      humanCommit: null,
    });
    const { rows, skipped, classified } = backfillHumanTouchReasons([makeRow()], {
      fetchPrDetails,
    });

    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(skipped).toBe(1);
    expect(classified).toBe(0);
  });

  it("continues past a failed lookup and still classifies the next row", () => {
    const fetchPrDetails = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("transient");
      })
      .mockReturnValueOnce(agentPrDetails({ message: "fix merge conflicts" }));
    const input = [makeRow({ pr_number: 101 }), makeRow({ issue_number: 2, pr_number: 102 })];
    const { rows, classified, skipped } = backfillHumanTouchReasons(input, { fetchPrDetails });

    expect(rows[0].human_touch_reason).toBeUndefined();
    expect(rows[1].human_touch_reason).toBe("merge-conflict");
    expect(classified).toBe(1);
    expect(skipped).toBe(1);
  });
});

// ── maxCalls cap ─────────────────────────────────────────

describe("backfillHumanTouchReasons — maxCalls cap", () => {
  it("caps GitHub lookups at maxCalls per run, leaving the rest for next time", () => {
    const fetchPrDetails = vi.fn().mockReturnValue(agentPrDetails());
    const input = Array.from({ length: 5 }, (_, i) =>
      makeRow({ issue_number: i + 1, pr_number: 200 + i })
    );
    const { classified, calls } = backfillHumanTouchReasons(input, {
      fetchPrDetails,
      maxCalls: 3,
    });

    expect(calls).toBe(3);
    expect(classified).toBe(3);
    expect(fetchPrDetails).toHaveBeenCalledTimes(3);
  });
});

// ── Purity ───────────────────────────────────────────────

describe("backfillHumanTouchReasons — purity", () => {
  it("returns new row objects and never mutates the input", () => {
    const input = [makeRow()];
    const snapshot = JSON.parse(JSON.stringify(input));
    const fetchPrDetails = vi.fn().mockReturnValue(agentPrDetails());

    const { rows } = backfillHumanTouchReasons(input, { fetchPrDetails });

    expect(input).toEqual(snapshot);
    expect(rows[0]).not.toBe(input[0]);
  });
});

// ── File-level idempotency via a temp fixture (never the real sink) ─

describe("runBackfill — temp fixture file I/O", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-human-touch-"));
    fs.mkdirSync(path.join(tmpDir, "metrics"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("classifies against a temp fixture, writes it back, and a second run is a no-op", () => {
    append("queue-telemetry", makeRow({ pr_number: 301 }), { root: tmpDir });
    const fetchPrDetails = vi
      .fn()
      .mockReturnValue(agentPrDetails({ message: "resolve merge conflict" }));

    const first = runBackfill({ root: tmpDir, fetchPrDetails });
    expect(first.classified).toBe(1);

    const onDisk = read("queue-telemetry", { root: tmpDir });
    expect(onDisk[0].human_touch_reason).toBe("merge-conflict");

    fetchPrDetails.mockClear();
    const second = runBackfill({ root: tmpDir, fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(second.classified).toBe(0);
    expect(read("queue-telemetry", { root: tmpDir })).toEqual(onDisk);
  });

  it("--dry-run does not write the fixture file", () => {
    append("queue-telemetry", makeRow({ pr_number: 302 }), { root: tmpDir });
    const fetchPrDetails = vi.fn().mockReturnValue(agentPrDetails());
    const before = read("queue-telemetry", { root: tmpDir });

    runBackfill({ root: tmpDir, fetchPrDetails, dryRun: true });

    expect(read("queue-telemetry", { root: tmpDir })).toEqual(before);
  });

  it("returns a no-op result when the fixture file has no rows", () => {
    const fetchPrDetails = vi.fn();
    const result = runBackfill({ root: tmpDir, fetchPrDetails });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(result).toMatchObject({ classified: 0, skipped: 0, calls: 0 });
  });
});

// ── Identity normalization ──────────────────────────────

describe("normalizeAuthorLogin", () => {
  it("strips the gh-CLI 'app/' bot-login prefix", () => {
    expect(normalizeAuthorLogin("app/claude")).toBe("claude");
  });

  it("leaves a non-bot login unchanged", () => {
    expect(normalizeAuthorLogin("mattbutlerengineering")).toBe("mattbutlerengineering");
  });

  it("returns empty string for a missing/malformed login rather than throwing", () => {
    expect(normalizeAuthorLogin(undefined)).toBe("");
    expect(normalizeAuthorLogin(null)).toBe("");
    expect(normalizeAuthorLogin(42)).toBe("");
  });
});

// ── Mechanical-commit detection ──────────────────────────

describe("isMechanicalCommit", () => {
  it("flags a branch-freshening 'Merge branch' commit", () => {
    expect(isMechanicalCommit("Merge branch 'main' into worktree-agent-a2a0388881cbddc71")).toBe(
      true
    );
  });

  it("flags a 'Merge remote-tracking branch' commit", () => {
    expect(
      isMechanicalCommit("Merge remote-tracking branch 'origin/main' into worktree-agent-abc")
    ).toBe(true);
  });

  it("flags the regen-after-update-branch.sh hook's exact fixup message", () => {
    expect(isMechanicalCommit("chore: regenerate stale artifacts")).toBe(true);
  });

  it("does not flag an ordinary fix commit", () => {
    expect(isMechanicalCommit("fix: resolve merge conflicts after rebase")).toBe(false);
  });

  it("does not flag a chore commit that merely starts with 'chore:'", () => {
    expect(isMechanicalCommit("chore: update AI antipattern baseline")).toBe(false);
  });

  it("returns false for malformed input rather than throwing", () => {
    expect(isMechanicalCommit(undefined)).toBe(false);
    expect(isMechanicalCommit(null)).toBe(false);
    expect(isMechanicalCommit(42)).toBe(false);
  });
});

// ── defaultFetchPrDetails — real gh-JSON-shaped scenarios ─
//
// Fixtures mirror actual `gh pr view --json author,headRefName,labels,
// commits,reviews` output sampled from #3908, #3900, #3899, #3686, #3799.

describe("defaultFetchPrDetails — identity + mechanical-commit detection", () => {
  function fakeGhClient(prView) {
    return { pr: { view: vi.fn().mockReturnValue(prView) } };
  }

  it("skips a PR#3908-shaped all-bot multi-commit PR (bot resolved its own merge conflict)", () => {
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-a714b3b2a3004a63c",
      labels: [],
      reviews: [],
      commits: [
        {
          authors: [{ login: "claude" }],
          messageHeadline: "fix(hospitality): resolve floor-plan table colors",
        },
        {
          authors: [{ login: "claude" }],
          messageHeadline: "fix(hospitality): escape all regex metachars",
        },
        {
          authors: [{ login: "claude" }],
          messageHeadline: "Merge branch 'main' into worktree-agent-a714b3b2a3004a63c",
        },
        {
          authors: [{ login: "claude" }],
          messageHeadline: "test(hospitality): extend TableShape drift guard",
        },
      ],
    });

    const result = defaultFetchPrDetails(3908, { ghClient });

    expect(result.humanCommit).toBeNull();
  });

  it("skips a PR#3900-shaped PR whose only differing-author commit is a mechanical merge", () => {
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-a2a0388881cbddc71",
      labels: [],
      reviews: [],
      commits: [
        {
          authors: [{ login: "claude" }],
          messageHeadline: "fix(hospitality): gate dashboard chrome on venue readiness",
        },
        {
          // Different login than the PR author, but mechanical — must not classify as human.
          authors: [{ login: "mattbutlerengineering" }],
          messageHeadline: "Merge branch 'main' into worktree-agent-a2a0388881cbddc71",
        },
      ],
    });

    const result = defaultFetchPrDetails(3900, { ghClient });

    expect(result.humanCommit).toBeNull();
  });

  it("skips a PR#3686/#3799-shaped PR where every commit shares the PR author's identity", () => {
    const ghClient = fakeGhClient({
      author: { id: "U_kgDODhKTJw", is_bot: false, login: "mattbutlerengineering" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [],
      commits: [
        { authors: [{ login: "mattbutlerengineering" }], messageHeadline: "fix: first commit" },
        { authors: [{ login: "mattbutlerengineering" }], messageHeadline: "fix: second commit" },
      ],
    });

    const result = defaultFetchPrDetails(3686, { ghClient });

    expect(result.humanCommit).toBeNull();
  });

  it("skips when the PR author identity is missing/malformed — nothing to discriminate against", () => {
    const ghClient = fakeGhClient({
      author: null,
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [],
      commits: [{ authors: [{ login: "someone" }], messageHeadline: "fix: a thing" }],
    });

    const result = defaultFetchPrDetails(1234, { ghClient });

    expect(result.humanCommit).toBeNull();
  });

  it("does not throw on a malformed (null) entry in a commit's authors array", () => {
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [],
      commits: [{ authors: [null, { login: "claude" }], messageHeadline: "fix: only commit" }],
    });

    expect(() => defaultFetchPrDetails(4321, { ghClient })).not.toThrow();
    expect(defaultFetchPrDetails(4321, { ghClient }).humanCommit).toBeNull();
  });

  it("does not throw when a commit is missing its authors array entirely", () => {
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [],
      commits: [{ messageHeadline: "fix: commit with no authors field at all" }],
    });

    const result = defaultFetchPrDetails(4325, { ghClient });

    // No known author on the commit → can't confirm it differs from the PR
    // author, but it also isn't excluded — findIndex still finds it, since
    // an empty authors array never "shares" the PR author's login.
    expect(result.humanCommit).toMatchObject({
      message: "fix: commit with no authors field at all",
    });
  });

  it("does not throw and treats reviews as 'not before' when the human commit has no authoredDate", () => {
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [{ submittedAt: "2026-08-06T10:00:00Z" }],
      commits: [
        { authors: [{ login: "claude" }], messageHeadline: "fix: initial agent commit" },
        {
          // No authoredDate — malformed/incomplete gh response.
          authors: [{ login: "mattbutlerengineering" }],
          messageHeadline: "fix: manual fixup with no timestamp",
        },
      ],
    });

    const result = defaultFetchPrDetails(4322, { ghClient, fetchCiConclusion: vi.fn() });

    expect(result.humanCommit).toMatchObject({
      message: "fix: manual fixup with no timestamp",
      reviewCommentsBefore: 0,
    });
  });

  it("classifies a genuine human fixup pushed to a bot-authored PR", () => {
    const fetchCiConclusion = vi.fn().mockReturnValue(null);
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [{ submittedAt: "2026-08-06T10:00:00Z" }],
      commits: [
        {
          authors: [{ login: "claude" }],
          oid: "abc123",
          messageHeadline: "fix: initial agent commit",
        },
        {
          authors: [{ login: "mattbutlerengineering" }],
          messageHeadline: "fix: resolve merge conflicts after manual rebase",
          messageBody: "",
          authoredDate: "2026-08-06T12:00:00Z",
        },
      ],
    });

    const result = defaultFetchPrDetails(3901, { ghClient, fetchCiConclusion });

    expect(result.humanCommit).toMatchObject({
      message: "fix: resolve merge conflicts after manual rebase",
      reviewCommentsBefore: 1,
    });
    expect(fetchCiConclusion).toHaveBeenCalledWith("abc123");
  });

  it("normalizes the PR author's 'app/' prefix before comparing against commit authors", () => {
    // Every commit shares the bot's unprefixed login — must be recognized as
    // "same author" (no false-positive human touch) once normalized.
    const ghClient = fakeGhClient({
      author: { is_bot: true, login: "app/claude" },
      headRefName: "worktree-agent-abc",
      labels: [],
      reviews: [],
      commits: [{ authors: [{ login: "claude" }], messageHeadline: "fix: only commit" }],
    });

    const result = defaultFetchPrDetails(9999, { ghClient });

    expect(result.humanCommit).toBeNull();
  });
});

// ── --max-calls (#4240) ──────────────────────────────────

describe("parseMaxCalls", () => {
  it("reads a positive integer", () => {
    expect(parseMaxCalls(["node", "script", "--max-calls", "300"])).toBe(300);
  });

  it("returns undefined when the flag is absent, so the default cap applies", () => {
    expect(parseMaxCalls(["node", "script", "--dry-run"])).toBeUndefined();
  });

  it.each([["0"], ["-5"], ["2.5"], ["abc"], [undefined]])(
    "returns undefined for the invalid value %s rather than a NaN cap",
    (value) => {
      const argv = ["node", "script", "--max-calls"];
      if (value !== undefined) argv.push(value);
      // A NaN cap is the dangerous outcome: `calls >= NaN` is false forever,
      // so the run would never stop making GitHub calls.
      expect(parseMaxCalls(argv)).toBeUndefined();
    }
  );
});
