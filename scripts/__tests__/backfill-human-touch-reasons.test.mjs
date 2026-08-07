import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { backfillHumanTouchReasons, runBackfill } from "../backfill-human-touch-reasons.mjs";
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
