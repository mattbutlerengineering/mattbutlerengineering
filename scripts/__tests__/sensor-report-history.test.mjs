/**
 * Covers #3645: the regression detector's "compare against the previous run"
 * arrow carried nothing, because it read metrics/sensor-report.json — a 5 KB
 * whole-file snapshot that is deliberately untracked (union-merging a JSON
 * object is a conflict magnet). Scheduled routines run in ephemeral checkouts,
 * so every cloud run read an absent file and detected zero regressions.
 *
 * The trend now lives in metrics/sensor-report.jsonl: one durable, union-
 * mergeable `{ date, sensors }` line per run, read back from the tail.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { read } from "../metrics-store.mjs";
import { appendReportHistory, readPreviousSensors } from "../sensor-report.mjs";

const makeReport = (end, sensors) => ({
  generated_at: `${end}T00:00:00.000Z`,
  period: { start: "2026-07-26", end },
  sensors,
});

describe("sensor-report history", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sensor-report-history-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null on the very first run (no history yet)", () => {
    expect(readPreviousSensors({ root })).toBeNull();
  });

  it("appends one { date, sensors } line per run", () => {
    appendReportHistory(makeReport("2026-08-01", { ci: { pass_rate: 90 } }), { root });
    appendReportHistory(makeReport("2026-08-02", { ci: { pass_rate: 80 } }), { root });

    expect(read("sensor-report-history", { root })).toEqual([
      { date: "2026-08-01", sensors: { ci: { pass_rate: 90 } } },
      { date: "2026-08-02", sensors: { ci: { pass_rate: 80 } } },
    ]);
  });

  it("reads the previous run from the tail, not the whole-file snapshot", () => {
    appendReportHistory(makeReport("2026-08-01", { ci: { pass_rate: 90 } }), { root });
    appendReportHistory(makeReport("2026-08-02", { ci: { pass_rate: 80 } }), { root });

    expect(readPreviousSensors({ root })).toEqual({ ci: { pass_rate: 80 } });
  });
});
