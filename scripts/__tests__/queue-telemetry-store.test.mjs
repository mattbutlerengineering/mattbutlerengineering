/**
 * The queue-telemetry store owns row identity: the key, the merge and the
 * path. These tests drive every writer path (in-session append, GitHub
 * backstop, reconcile/backfill rewrite) through the store and assert the
 * file never holds two rows for one (issue, PR) -- replacing the after-the-fact
 * dupe-gate cases that used to cover only the key function.
 *
 * Why identity is (issue, PR) and not PR alone: the real sink holds a PR that
 * legitimately closed two issues (#5639 -> #5604 and #5608), one row each.
 * Keying on PR alone would collapse them and drop an issue.
 * Why the GitHub backstop is additionally gated on "PR already has any row":
 * it can only recover the *first* closing issue from the PR body, which may
 * differ from the issue the in-session writer claimed; under (issue, PR) alone
 * the two would both land for the same PR (#6381).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  telemetryRowKey,
  dedupeTelemetryRows,
  appendTelemetryRow,
  updateTelemetry,
  readTelemetryRows,
  telemetryPath,
  coveredPrNumbers,
  TELEMETRY_UNKNOWN_REASONS,
} from "../queue-telemetry-store.mjs";
import { deriveTelemetryRows } from "../collect-queue-telemetry-from-github.mjs";
import { evaluateTelemetryDuplicates } from "../check-queue-telemetry-dupes.mjs";

const row = (issue, pr, extra = {}) => ({ issue_number: issue, pr_number: pr, ...extra });

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "qts-"));
  mkdirSync(join(root, "metrics"), { recursive: true });
  return root;
}

const onDisk = (root) =>
  readFileSync(telemetryPath({ root }), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe("telemetryRowKey", () => {
  it("identifies a row by issue and PR", () => {
    expect(telemetryRowKey(row(1, 2))).toBe("1::2");
  });

  it("gives a PR-less row no identity, so such rows are never merged", () => {
    expect(telemetryRowKey(row(1, null))).toBeNull();
    expect(telemetryRowKey({ issue_number: 1 })).toBeNull();
  });
});

describe("dedupeTelemetryRows", () => {
  it("leaves a clean file untouched", () => {
    const result = dedupeTelemetryRows([row(1, 10), row(2, 11), row(3, null), row(4, null)]);
    expect(result.removed).toBe(0);
    expect(result.rows).toHaveLength(4);
  });

  it("keeps the first copy and folds in fields only the later copy carries", () => {
    const a = row(1, 10, { merged: true });
    const b = row(1, 10, { merged: true, human_touch_reason: "review-fix" });
    const result = dedupeTelemetryRows([a, b]);
    expect(result.removed).toBe(1);
    expect(result.rows).toEqual([row(1, 10, { merged: true, human_touch_reason: "review-fix" })]);
  });

  it("fills a null field from the later copy and never mutates its input", () => {
    const a = row(1, 10, { merged_at: null });
    const b = row(1, 10, { merged_at: "2026-01-01T00:00:00Z" });
    const result = dedupeTelemetryRows([a, b]);
    expect(result.rows[0].merged_at).toBe("2026-01-01T00:00:00Z");
    expect(a.merged_at).toBeNull();
  });

  it("never overwrites a value the first row already holds", () => {
    const result = dedupeTelemetryRows([
      row(1, 10, { human_touch_reason: "ci-failure" }),
      row(1, 10, { human_touch_reason: "other" }),
    ]);
    expect(result.rows[0].human_touch_reason).toBe("ci-failure");
  });

  it("keeps every PR-less row, however many", () => {
    const result = dedupeTelemetryRows([row(1, null), row(1, null), row(2, null)]);
    expect(result.removed).toBe(0);
    expect(result.rows).toHaveLength(3);
  });

  it("is idempotent", () => {
    const once = dedupeTelemetryRows([row(1, 10), row(1, 10), row(2, 11)]);
    const twice = dedupeTelemetryRows(once.rows);
    expect(twice.removed).toBe(0);
    expect(twice.rows).toEqual(once.rows);
  });

  it("keeps two issues that share one PR as two rows", () => {
    expect(dedupeTelemetryRows([row(5604, 5639), row(5608, 5639)]).removed).toBe(0);
  });
});

describe("writer paths cannot produce a duplicate", () => {
  it("in-session append, then GitHub backstop for the same PR under a different first issue", () => {
    const root = tempRoot();
    // Worker claimed #200 and opened PR 77.
    appendTelemetryRow(row(200, 77, { subagent_tokens: 1000 }), { root });
    // The PR body's first closing ref is #100, so the backstop would derive (100, 77).
    const { rows } = deriveTelemetryRows(
      [
        {
          number: 77,
          headRefName: "worktree-agent-x",
          body: "Closes #100\nCloses #200",
          createdAt: "2026-10-01T00:00:00Z",
        },
      ],
      readTelemetryRows({ root })
    );
    expect(rows).toEqual([]); // covered by PR, not only by (issue, PR)
    for (const r of rows) appendTelemetryRow(r, { root, ifPrAbsent: true });
    expect(onDisk(root)).toHaveLength(1);
  });

  it("backstop append is refused when any row already covers the PR", () => {
    const root = tempRoot();
    appendTelemetryRow(row(200, 77), { root });
    const result = appendTelemetryRow(row(100, 77), { root, ifPrAbsent: true });
    expect(result).toEqual({ written: false, reason: "duplicate" });
    expect(onDisk(root)).toHaveLength(1);
  });

  it("a rewrite built from a stale read cannot reintroduce rows an append already added", () => {
    const root = tempRoot();
    appendTelemetryRow(row(1, 10), { root });
    // The transform hands back a repeat of rows the sink already holds --
    // the #4223/#4572/#4719 shape.
    const outcome = updateTelemetry((rows) => ({ rows: [...rows, ...rows, row(2, 11)] }), {
      root,
    });
    expect(outcome.removed).toBe(1);
    expect(onDisk(root).map(telemetryRowKey)).toEqual(["1::10", "2::11"]);
  });

  it("a retry after a rewrite is idempotent", () => {
    const root = tempRoot();
    appendTelemetryRow(row(1, 10), { root });
    appendTelemetryRow(row(2, 11), { root });
    updateTelemetry((rows) => ({ rows: rows.map((r) => ({ ...r, merged: true })) }), { root });
    appendTelemetryRow(row(2, 11), { root });
    const rows = onDisk(root);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.merged === true)).toBe(true);
  });

  it("the post-hoc gate finds nothing after any interleaving of the writer paths", () => {
    const root = tempRoot();
    for (let i = 0; i < 5; i += 1) {
      appendTelemetryRow(row(i, 100 + i), { root });
      updateTelemetry((rows) => ({ rows: [...rows, ...rows] }), { root });
      appendTelemetryRow(row(i, 100 + i), { root });
      appendTelemetryRow(row(i + 50, 100 + i), { root, ifPrAbsent: true });
    }
    expect(evaluateTelemetryDuplicates(onDisk(root)).findings).toEqual([]);
  });

  it("does not rewrite the file when nothing changed", () => {
    const root = tempRoot();
    appendTelemetryRow(row(1, 10), { root });
    const before = readFileSync(telemetryPath({ root }), "utf-8");
    const outcome = updateTelemetry((rows) => ({ rows }), { root });
    expect(outcome.written).toBe(false);
    expect(readFileSync(telemetryPath({ root }), "utf-8")).toBe(before);
  });
});

describe("path ownership", () => {
  it("resolves the sink through metrics-store, honouring root", () => {
    const root = tempRoot();
    expect(telemetryPath({ root })).toBe(join(root, "metrics", "queue-telemetry.jsonl"));
  });

  it("reads an absent sink as an empty list", () => {
    expect(readTelemetryRows({ root: tempRoot() })).toEqual([]);
  });

  it("coveredPrNumbers lists every PR that has any row", () => {
    expect([...coveredPrNumbers([row(1, 10), row(2, null), row(3, 11)])].sort()).toEqual([10, 11]);
  });
});

describe("one I/O path (#6770)", () => {
  const memStore = (initial = "") => {
    let content = initial;
    return {
      readFile: () => (content === "" ? null : content),
      writeFile: (_p, c) => {
        content = c;
      },
      content: () => content,
    };
  };

  it("a row written by appendTelemetryRow reads back through readTelemetryRows on the same injected I/O", () => {
    const io = memStore();
    appendTelemetryRow(row(7, 70), { root: "/nowhere", ...io });
    expect(readTelemetryRows({ root: "/nowhere", readFile: io.readFile })).toEqual([row(7, 70)]);
  });

  it("appendTelemetryRow writes the canonical metrics-store form, not a spliced copy of the raw file", () => {
    const io = memStore("not-valid-json\n");
    appendTelemetryRow(row(7, 70), { root: "/nowhere", ...io });
    const lines = io.content().split("\n").filter(Boolean);
    expect(lines.map((l) => JSON.parse(l))).toEqual([row(7, 70)]);
  });
});

describe("append contract", () => {
  it("rejects unknown fields before touching disk", () => {
    const root = tempRoot();
    expect(() => appendTelemetryRow({ ...row(1, 2), api_key: "x" }, { root })).toThrow(
      /unknown field/
    );
  });
});

describe("unknown_reasons validation", () => {
  const append = (extra) => {
    const root = tempRoot();
    return () => appendTelemetryRow(row(1, 2, extra), { root });
  };

  it("exports a frozen reason list", () => {
    expect(Object.isFrozen(TELEMETRY_UNKNOWN_REASONS)).toBe(true);
    expect(TELEMETRY_UNKNOWN_REASONS).toContain("no-ledger-row");
  });

  it("accepts a known field with a known reason", () => {
    expect(append({ cost_usd: null, unknown_reasons: { cost_usd: "no-ledger-row" } })()).toEqual({
      written: true,
    });
  });

  it("rejects an unknown reason", () => {
    expect(append({ unknown_reasons: { cost_usd: "nope" } })).toThrow(/unknown_reasons/);
  });

  it("rejects a non-reconcilable field key", () => {
    expect(append({ unknown_reasons: { foo: "no-pr" } })).toThrow(/unknown_reasons/);
  });

  it("rejects a non-object unknown_reasons", () => {
    expect(append({ unknown_reasons: "no-pr" })).toThrow(/unknown_reasons/);
  });
});
