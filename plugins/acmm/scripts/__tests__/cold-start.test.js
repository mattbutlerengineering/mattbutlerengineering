import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadLatestColdStart, latestRecord, scoreColdStart } from "../cold-start.js";

function tmpDir() {
  const root = mkdtempSync(join(tmpdir(), "acmm-coldstart-"));
  return {
    root,
    write(rel, body) {
      const p = join(root, rel);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, body);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("loadLatestColdStart: missing file → null", () => {
  const fx = tmpDir();
  assert.equal(loadLatestColdStart(fx.root), null);
  fx.cleanup();
});

test("loadLatestColdStart: empty array → null", () => {
  const fx = tmpDir();
  fx.write("metrics/acmm-cold-start.json", "[]");
  assert.equal(loadLatestColdStart(fx.root), null);
  fx.cleanup();
});

test("loadLatestColdStart: malformed JSON → null (non-fatal)", () => {
  const fx = tmpDir();
  fx.write("metrics/acmm-cold-start.json", "not json {[");
  assert.equal(loadLatestColdStart(fx.root), null);
  fx.cleanup();
});

test("loadLatestColdStart: returns most recent record (last in array)", () => {
  const fx = tmpDir();
  const records = [
    { ts: "2026-04-01T06:00:00Z", install_seconds: 30, test_seconds: 60, total_seconds: 90, test_passed: true, commit: "old" },
    { ts: "2026-04-08T06:00:00Z", install_seconds: 45, test_seconds: 120, total_seconds: 165, test_passed: true, commit: "new" },
  ];
  fx.write("metrics/acmm-cold-start.json", JSON.stringify(records));
  const r = loadLatestColdStart(fx.root);
  assert.equal(r.ts, "2026-04-08T06:00:00Z");
  assert.equal(r.total_seconds, 165);
  assert.equal(r.commit, "new");
  fx.cleanup();
});

test("latestRecord: pure helper handles empty + non-array input", () => {
  assert.equal(latestRecord([]), null);
  assert.equal(latestRecord(null), null);
  assert.equal(latestRecord(undefined), null);
});

test("scoreColdStart: null → unknown", () => {
  assert.equal(scoreColdStart(null), "unknown");
});

test("scoreColdStart: test failed → broken regardless of timing", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 60, test_passed: false }),
    "broken",
  );
});

test("scoreColdStart: total <5min and tests pass → healthy", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 4 * 60, test_passed: true }),
    "healthy",
  );
});

test("scoreColdStart: total 5–15min → watch", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 10 * 60, test_passed: true }),
    "watch",
  );
});

test("scoreColdStart: total >15min → broken", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 20 * 60, test_passed: true }),
    "broken",
  );
});

test("scoreColdStart: boundary at exactly 5min → healthy", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 5 * 60, test_passed: true }),
    "healthy",
  );
});

test("scoreColdStart: boundary at exactly 15min → watch", () => {
  assert.equal(
    scoreColdStart({ total_seconds: 15 * 60, test_passed: true }),
    "watch",
  );
});
