/**
 * Tests for audit.js's pure exported functions — the CLI body itself runs
 * only under `isEntryPoint(process.argv[1], import.meta.url)`, so importing
 * this module never shells out to `gh`/`git`, reads repo state, or writes
 * files (#5852).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  checkGhAvailable,
  shouldWriteState,
  buildFlakeSnapshot,
  formatBehavioralGateLine,
  isEntryPoint,
} from "../audit.js";
import { computeFlakeRate } from "../flake-rate.js";
import { computeLevel } from "../computeLevel.js";

describe("checkGhAvailable", () => {
  test("true when the probe succeeds", () => {
    assert.equal(checkGhAvailable({ execFn: () => "logged in" }), true);
  });

  test("false when the binary is missing (ENOENT)", () => {
    const execFn = () => {
      const err = new Error("spawn gh ENOENT");
      err.code = "ENOENT";
      throw err;
    };
    assert.equal(checkGhAvailable({ execFn }), false);
  });

  test("false when gh auth status fails", () => {
    const execFn = () => {
      throw new Error("You are not logged into any GitHub hosts");
    };
    assert.equal(checkGhAvailable({ execFn }), false);
  });

  test("probes with `gh auth status --hostname github.com` (review item 7)", () => {
    let seenArgs;
    checkGhAvailable({
      execFn: (bin, args) => {
        seenArgs = [bin, ...args];
        return "";
      },
    });
    assert.deepEqual(seenArgs, ["gh", "auth", "status", "--hostname", "github.com"]);
  });
});

describe("shouldWriteState — AC9 state write policy", () => {
  const BASE_PRIOR = {
    currentLevel: 6,
    detectedIds: ["a", "b", "c"],
    checks: { a: { passed: true } },
    issuesCreated: { x: 1 },
    lastRun: "2026-09-27T00:00:00Z", // 1 day before NOW
  };
  const NOW = new Date("2026-09-28T00:00:00Z");

  test("no write when nothing changed and prior run is recent", () => {
    const next = { ...BASE_PRIOR };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), false);
  });

  test("write when currentLevel changed", () => {
    const next = { ...BASE_PRIOR, currentLevel: 5 };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when the detectedIds set changed (added)", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["a", "b", "c", "d"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when the detectedIds set changed (removed)", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["a", "b"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("no write when detectedIds set is the same but reordered", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["c", "a", "b"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), false);
  });

  test("write when the per-criterion verdict map changed", () => {
    const next = { ...BASE_PRIOR, checks: { a: { passed: false } } };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when issuesCreated changed", () => {
    const next = { ...BASE_PRIOR, issuesCreated: { x: 1, y: 2 } };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write on the weekly heartbeat even with zero changes (prior.lastRun > 6 days old)", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-21T00:00:00Z" }; // 7 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), true);
  });

  test("no write at exactly the 6-day heartbeat boundary", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-22T00:00:00Z" }; // 6 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), false);
  });

  test("write when prior.lastRun is missing entirely (first run)", () => {
    const prior = { ...BASE_PRIOR, lastRun: "" };
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), true);
  });

  test("a custom heartbeatMaxAgeDays is honored", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-26T00:00:00Z" }; // 2 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW, heartbeatMaxAgeDays: 1 }), true);
  });
});

// ── review item 1: the behavioral.flake reshape must carry insufficient_data
// and oldest_record_at through, not drop them ───────────────────────────────
describe("buildFlakeSnapshot (review item 1)", () => {
  const RAW = {
    flake_rate_30d: 0,
    flake_sample_size: 3,
    flaky_shas: [],
    insufficient_data: true,
    oldest_record_at: "2026-09-01T00:00:00.000Z",
  };

  test("carries insufficient_data and oldest_record_at through unchanged", () => {
    const snapshot = buildFlakeSnapshot(RAW, { now: new Date("2026-09-28T00:00:00Z") });
    assert.equal(snapshot.rate_30d, 0);
    assert.equal(snapshot.sample_size, 3);
    assert.deepEqual(snapshot.flaky_shas, []);
    assert.equal(snapshot.insufficient_data, true);
    assert.equal(snapshot.oldest_record_at, "2026-09-01T00:00:00.000Z");
    assert.equal(snapshot.measured_at, "2026-09-28T00:00:00.000Z");
  });

  test("a sufficient sample carries insufficient_data: false through", () => {
    const snapshot = buildFlakeSnapshot({
      ...RAW,
      flake_sample_size: 30,
      insufficient_data: false,
    });
    assert.equal(snapshot.insufficient_data, false);
  });

  test("end-to-end: computeFlakeRate output → buildFlakeSnapshot → computeLevel makes the L3 gate unverifiable on an insufficient sample", () => {
    // A 3-SHA, 0-flake sample — exactly the shape the review flagged as
    // wrongly passing the L3 gate when insufficient_data was dropped.
    const runs = [
      { headSha: "a", conclusion: "success", createdAt: "2026-09-20T00:00:00Z" },
      { headSha: "b", conclusion: "success", createdAt: "2026-09-21T00:00:00Z" },
      { headSha: "c", conclusion: "success", createdAt: "2026-09-22T00:00:00Z" },
    ];
    const rawFlake = computeFlakeRate(runs, { now: new Date("2026-09-28T00:00:00Z") });
    assert.equal(rawFlake.insufficient_data, true, "3 < MIN_SAMPLE (5)");
    assert.equal(rawFlake.flake_rate_30d, 0, "no flakes observed in the sample");

    const snapshot = buildFlakeSnapshot(rawFlake, { now: new Date("2026-09-28T00:00:00Z") });
    // L3 requires 5 of the 6 scannable L3 criteria (ceil(0.7 * 6) = 5).
    const detectedIds = new Set([
      "acmm:claude-md",
      "acmm:pr-acceptance-metric",
      "acmm:pr-review-rubric",
      "acmm:quality-dashboard",
      "acmm:ci-matrix",
      "acmm:instruction-sync-gate",
    ]);
    const result = computeLevel(detectedIds, { flake: snapshot }, { strict: true });

    const flakeGate = result.behavioralGates.find((g) => g.name === "ci-flake-rate");
    assert.equal(
      flakeGate.unverifiable,
      true,
      "insufficient_data must make the gate unverifiable, not a passing 0% rate"
    );
    assert.equal(result.level, 2, "strict mode blocks L3 on an unverifiable flake gate");
  });
});

// ── review item 6 (+ re-review fix): unverifiable-due-to-insufficient-data
// must say so explicitly, AND in strict mode must still carry a literal '✗'
// because nightly-compliance.yml's drift detector greps the audit output for
// it — an unverifiable gate caps the level in strict mode exactly like a
// genuine threshold failure, so it must render with the same icon.
describe("formatBehavioralGateLine (review item 6 + re-review fix)", () => {
  const BASE_GATE = {
    level: 3,
    name: "ci-flake-rate",
    description: "CI flake rate must be below 20%",
    value: 0.05,
    threshold: 0.2,
    direction: "below",
  };

  test("strict + insufficient sample -> '✗', not '?', with sample size and 'level capped' (nightly-compliance regression)", () => {
    const gate = {
      ...BASE_GATE,
      passed: false,
      dataAvailable: true,
      unverifiable: true,
      sampleSize: 3,
    };
    const line = formatBehavioralGateLine(gate, true);
    assert.match(
      line,
      /✗/,
      "a strict-mode capping gate must carry the literal ✗ drift detectors grep for"
    );
    assert.match(line, /insufficient sample \(n=3\)/);
    assert.match(line, /level capped/);
  });

  test("strict + no data at all -> '✗' with 'no data' and 'level capped'", () => {
    const gate = {
      ...BASE_GATE,
      passed: false,
      dataAvailable: false,
      unverifiable: true,
      sampleSize: null,
    };
    const line = formatBehavioralGateLine(gate, true);
    assert.match(line, /✗/);
    assert.match(line, /no data/);
    assert.match(line, /level capped/);
    assert.doesNotMatch(line, /insufficient sample/);
  });

  test("soft (--no-strict) + insufficient sample -> keeps '?', no 'level capped' (nothing is capped in soft mode)", () => {
    const gate = {
      ...BASE_GATE,
      passed: true,
      dataAvailable: true,
      unverifiable: true,
      sampleSize: 3,
    };
    const line = formatBehavioralGateLine(gate, false);
    assert.match(line, /^\s*\? L3 ci-flake-rate:.*insufficient sample \(n=3\)/);
    assert.doesNotMatch(line, /level capped/);
    assert.doesNotMatch(line, /✗/);
  });

  test("soft (--no-strict) + no data -> keeps '?', 'no data', no 'level capped'", () => {
    const gate = {
      ...BASE_GATE,
      passed: true,
      dataAvailable: false,
      unverifiable: true,
      sampleSize: null,
    };
    const line = formatBehavioralGateLine(gate, false);
    assert.match(line, /\? L3 ci-flake-rate:.*no data/);
    assert.doesNotMatch(line, /level capped/);
    assert.doesNotMatch(line, /✗/);
  });

  test("a genuinely passing gate renders ✓ pass AND restores the measured value (e.g. L5 auto-qa 19 > 1)", () => {
    const gate = {
      level: 5,
      name: "auto-qa-tuning-history",
      description: "Auto-QA tuning history must have more than 1 entry",
      value: 19,
      threshold: 1,
      direction: "above",
      passed: true,
      dataAvailable: true,
      unverifiable: false,
      sampleSize: null,
    };
    const line = formatBehavioralGateLine(gate, true);
    assert.match(line, /✓.*\[pass\]/);
    assert.match(line, /19 > 1/, "the measured value/threshold must appear on the line");
  });

  test("a below-direction passing gate restores its percentage value (e.g. flake 0.2% < 20%)", () => {
    const gate = {
      ...BASE_GATE,
      value: 0.002,
      passed: true,
      dataAvailable: true,
      unverifiable: false,
    };
    const line = formatBehavioralGateLine(gate, true);
    assert.match(line, /0\.2% < 20%/);
  });

  test("a genuine strict failure (data available, not unverifiable) renders ✗ FAIL with its value", () => {
    const gate = {
      ...BASE_GATE,
      passed: false,
      dataAvailable: true,
      unverifiable: false,
      sampleSize: 30,
    };
    const line = formatBehavioralGateLine(gate, true);
    assert.match(line, /✗.*FAIL/);
    assert.match(line, /5\.0% < 20%/);
  });

  test("a genuine soft-mode failure renders ! WARN with its value", () => {
    const gate = {
      ...BASE_GATE,
      passed: false,
      dataAvailable: true,
      unverifiable: false,
      sampleSize: 30,
    };
    const line = formatBehavioralGateLine(gate, false);
    assert.match(line, /!.*WARN/);
    assert.match(line, /5\.0% < 20%/);
  });
});

// ── review item 7: the entry-point guard must resolve through realpath, not
// break silently on a symlinked or /tmp-relative invocation ────────────────
describe("isEntryPoint (review item 7)", () => {
  test("true when argv1 is the module's own real path", () => {
    const moduleUrl = new URL("../audit.js", import.meta.url).href;
    const realPath = new URL("../audit.js", import.meta.url).pathname;
    assert.equal(isEntryPoint(realPath, moduleUrl), true);
  });

  test("false when argv1 points at an unrelated file", () => {
    const moduleUrl = new URL("../audit.js", import.meta.url).href;
    assert.equal(isEntryPoint("/some/other/file.js", moduleUrl), false);
  });

  test("false when argv1 is undefined (imported as a module, no process.argv[1] entry point)", () => {
    const moduleUrl = new URL("../audit.js", import.meta.url).href;
    assert.equal(isEntryPoint(undefined, moduleUrl), false);
  });

  test("resolves through a symlink to the real module path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "acmm-entrypoint-"));
    const modulePath = new URL("../audit.js", import.meta.url).pathname;
    const moduleUrl = new URL("../audit.js", import.meta.url).href;
    const linkPath = path.join(dir, "audit-link.js");
    try {
      symlinkSync(modulePath, linkPath);
      assert.equal(isEntryPoint(linkPath, moduleUrl), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails closed to false when argv1 does not exist on disk", () => {
    const moduleUrl = new URL("../audit.js", import.meta.url).href;
    const dir = mkdtempSync(path.join(tmpdir(), "acmm-entrypoint-"));
    const missing = path.join(dir, "nonexistent.js");
    try {
      assert.equal(isEntryPoint(missing, moduleUrl), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── review item 5 / AC9: a real end-to-end run of main() with `gh`
// unavailable must be read-only — state.json and README.md left exactly as
// seeded, and stdout must say so ───────────────────────────────────────────
describe("main() end-to-end: read-only path when gh is unavailable (review item 5)", () => {
  test("gh unavailable → state.json and README.md are byte-identical after the run, stdout says read-only", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "acmm-readonly-"));
    try {
      const stateDir = path.join(dir, ".claude", "acmm");
      mkdirSync(stateDir, { recursive: true });
      const statePath = path.join(stateDir, "state.json");
      const seedState =
        JSON.stringify(
          {
            lastRun: "2026-09-01T00:00:00.000Z",
            currentLevel: 2,
            checks: {},
            history: [],
            issuesCreated: {},
          },
          null,
          2
        ) + "\n";
      writeFileSync(statePath, seedState, "utf-8");

      const readmePath = path.join(dir, "README.md");
      const seedReadme = "# Test project\n\n<!-- acmm:begin -->old-badge<!-- acmm:end -->\n";
      writeFileSync(readmePath, seedReadme, "utf-8");

      // Strip every PATH entry that actually resolves a `gh` binary, rather
      // than hardcoding one location — robust across machines/CI.
      const filteredPath = process.env.PATH.split(path.delimiter)
        .filter((dirEntry) => {
          try {
            return !existsSync(path.join(dirEntry, "gh"));
          } catch {
            return true;
          }
        })
        .join(path.delimiter);

      const auditPath = new URL("../audit.js", import.meta.url).pathname;
      const result = spawnSync(process.execPath, [auditPath, "--badge"], {
        cwd: dir,
        env: { ...process.env, PATH: filteredPath },
        encoding: "utf-8",
        timeout: 60000,
      });

      assert.equal(result.status, 0, `audit.js exited non-zero: ${result.stderr}`);
      assert.match(result.stdout, /read-only/);

      assert.equal(
        readFileSync(statePath, "utf-8"),
        seedState,
        "state.json must be left byte-identical when gh is unavailable"
      );
      assert.equal(
        readFileSync(readmePath, "utf-8"),
        seedReadme,
        "README.md must be left byte-identical when gh is unavailable"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
