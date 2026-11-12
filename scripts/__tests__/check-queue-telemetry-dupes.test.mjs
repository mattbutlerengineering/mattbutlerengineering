/**
 * One row per (issue, PR) is `metrics/queue-telemetry.jsonl`'s invariant —
 * `appendTelemetryRow` has enforced it on the append path since it was
 * written. Both readers count rows and treat each as one merged PR, so a
 * doubled row inflates numerator and denominator alike.
 *
 * 32 duplicates got in anyway, via #4223, #4572 and #4719 — all
 * `chore(metrics): optimize-implement-queue` commits, because
 * `reconcile-queue-telemetry.mjs` rewrites the sink rather than appending,
 * and a rewrite landing on a main that has since gained rows reconciles as
 * "keep both". The append-path guard structurally cannot see that.
 */

import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateTelemetryDuplicates,
  collapseTelemetryDuplicates,
  fixTelemetryFile,
} from "../check-queue-telemetry-dupes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const row = (issue, pr, extra = {}) => ({ issue_number: issue, pr_number: pr, ...extra });

describe("evaluateTelemetryDuplicates", () => {
  it("passes a file with one row per identity", () => {
    expect(evaluateTelemetryDuplicates([row(1, 10), row(2, 11)]).findings).toEqual([]);
  });

  it("reports a duplicate identity with its 1-indexed line numbers", () => {
    expect(evaluateTelemetryDuplicates([row(1, 10), row(2, 11), row(1, 10)]).findings).toEqual([
      "issue #1 / PR #10 — 2 rows (lines 1, 3)",
    ]);
  });

  it("does not report rows without a PR", () => {
    expect(evaluateTelemetryDuplicates([row(1, null), row(1, null)]).findings).toEqual([]);
  });

  it("passes an empty file", () => {
    expect(evaluateTelemetryDuplicates([]).findings).toEqual([]);
  });
});

describe("the committed sink", () => {
  it("has exactly one row per (issue, PR)", () => {
    const rows = readFileSync(resolve(ROOT, "metrics/queue-telemetry.jsonl"), "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(evaluateTelemetryDuplicates(rows).findings).toEqual([]);
  });
});

const line = (r) => JSON.stringify(r);
const text = (...rows) => rows.map(line).join("\n") + "\n";

// Shape that failed #8707: a reconciled row next to a stale unreconciled copy.
const reconciled = (issue, pr) =>
  row(issue, pr, {
    merged: true,
    merged_at: "2026-11-01T00:00:00Z",
    ci_first_pass: true,
    rework_cycles: 0,
  });
const stale = (issue, pr) =>
  row(issue, pr, { merged: null, merged_at: null, ci_first_pass: null, rework_cycles: null });

describe("collapseTelemetryDuplicates", () => {
  it("keeps the reconciled row over a stale copy (8563/8644, 8620/8645), at first-occurrence position", () => {
    const other = row(1, 2, { merged: true });
    const input = text(
      stale(8563, 8644),
      other,
      stale(8620, 8645),
      reconciled(8563, 8644),
      reconciled(8620, 8645)
    );
    const out = collapseTelemetryDuplicates(input);
    expect(out.changed).toBe(true);
    expect(out.text).toBe(text(reconciled(8563, 8644), other, reconciled(8620, 8645)));
    expect(out.removed).toEqual([
      "issue #8563 / PR #8644 — kept line 4 (at line 1), dropped line 1",
      "issue #8620 / PR #8645 — kept line 5 (at line 3), dropped line 3",
    ]);
  });

  it("breaks ties by keeping the earliest line", () => {
    const a = row(1, 2, { merged: true, note: "first" });
    const b = row(1, 2, { merged: true, note: "second" });
    expect(collapseTelemetryDuplicates(text(a, b)).text).toBe(text(a));
  });

  it("leaves rows with null PR keys alone, even when identical", () => {
    const input = text(row(1, null), row(1, null), row(2, 3), row(2, 3));
    expect(collapseTelemetryDuplicates(input).text).toBe(
      text(row(1, null), row(1, null), row(2, 3))
    );
  });

  it("preserves untouched lines byte for byte", () => {
    const odd = '{"issue_number":5,  "pr_number":6,"x":1.0}';
    const input = `${odd}\n${line(stale(1, 2))}\n${line(reconciled(1, 2))}\n`;
    expect(collapseTelemetryDuplicates(input).text).toBe(`${odd}\n${line(reconciled(1, 2))}\n`);
  });

  it("is idempotent", () => {
    const once = collapseTelemetryDuplicates(text(stale(1, 2), reconciled(1, 2), row(3, 4)));
    const twice = collapseTelemetryDuplicates(once.text);
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
    expect(twice.removed).toEqual([]);
  });
});

describe("fixTelemetryFile", () => {
  const withDir = (fn) => {
    const dir = mkdtempSync(resolve(tmpdir(), "qt-dupes-"));
    try {
      fn(resolve(dir, "queue-telemetry.jsonl"), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("does not rewrite a file without duplicates", () => {
    withDir((file) => {
      writeFileSync(file, text(row(1, 2), row(3, 4)));
      const before = statSync(file, { bigint: true }).mtimeNs;
      const result = fixTelemetryFile(file);
      expect(result.changed).toBe(false);
      expect(statSync(file, { bigint: true }).mtimeNs).toBe(before);
    });
  });

  it("rewrites in place, leaves no temp files, and a second run is a no-op", () => {
    withDir((file) => {
      writeFileSync(file, text(stale(1, 2), reconciled(1, 2)));
      expect(fixTelemetryFile(file).changed).toBe(true);
      expect(readFileSync(file, "utf-8")).toBe(text(reconciled(1, 2)));
      expect(fixTelemetryFile(file).changed).toBe(false);
      expect(existsSync(`${file}.tmp`)).toBe(false);
    });
  });

  it("CLI: fails with the --fix hint, then --fix repairs and the check passes", () => {
    withDir((_file, dir) => {
      mkdirSync(resolve(dir, "metrics"));
      const file = resolve(dir, "metrics/queue-telemetry.jsonl");
      writeFileSync(file, text(reconciled(1, 2), stale(1, 2)));
      const script = resolve(ROOT, "scripts/check-queue-telemetry-dupes.mjs");
      const run = (...args) =>
        spawnSync("node", [script, "--root", dir, ...args], { encoding: "utf-8" });
      const failed = run();
      expect(failed.status).not.toBe(0);
      expect(failed.stdout + failed.stderr).toMatch(
        /Fix: node scripts\/check-queue-telemetry-dupes\.mjs --fix/
      );
      expect(run("--fix").status).toBe(0);
      expect(run().status).toBe(0);
      expect(readFileSync(file, "utf-8")).toBe(text(reconciled(1, 2)));
    });
  });
});
