/**
 * The console summary must not present `unverifiable` criteria as confirmed
 * gaps or as a confirmed regression.
 *
 * An `active`-type criterion whose workflow file exists but whose `gh run list`
 * call could not run (no gh binary, no credential — every Claude Code Remote
 * session, see gotchas.md § Claude Code Remote) is `unverifiable`: its status is
 * unknown, not confirmed false. `diff.js` already keeps such a criterion out of
 * `removed`, and `--apply` already filters it out of the issues it files
 * (#3719). The console summary did neither, so a cloud run of
 * `node plugins/acmm/scripts/audit.js` printed
 *
 *     Since last run: L5 ↓ L3  ·  73 → 65 detected (-8)
 *       · no criteria changed
 *     …
 *     Missing for next level (3):
 *       • acmm:nightly-compliance — Nightly compliance scan
 *       • acmm:instruction-rot-detection — Instruction rot detection
 *
 * while `.github/workflows/nightly-compliance.yml` was present the whole time
 * and `--apply` would have refused to file either issue. CLAUDE.md tells agents
 * to trust this output for "what to build next", so the display and the
 * behaviour must agree.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  partitionMissingForNext,
  formatSinceLastRunCount,
  formatNextLevelSection,
} from "../audit.js";

const NIGHTLY = { id: "acmm:nightly-compliance", name: "Nightly compliance scan" };
const COPILOT = { id: "acmm:copilot-review-apply", name: "Automated review application" };
const ROT = { id: "acmm:instruction-rot-detection", name: "Instruction rot detection" };

describe("partitionMissingForNext", () => {
  test("splits confirmed gaps from unverifiable ones", () => {
    const { confirmed, unverifiable } = partitionMissingForNext(
      [NIGHTLY, COPILOT, ROT],
      new Set(["acmm:nightly-compliance", "acmm:instruction-rot-detection"])
    );
    assert.deepEqual(
      confirmed.map((c) => c.id),
      ["acmm:copilot-review-apply"]
    );
    assert.deepEqual(
      unverifiable.map((c) => c.id),
      ["acmm:nightly-compliance", "acmm:instruction-rot-detection"]
    );
  });

  test("everything is confirmed when nothing is unverifiable", () => {
    const { confirmed, unverifiable } = partitionMissingForNext([NIGHTLY, COPILOT], new Set());
    assert.equal(confirmed.length, 2);
    assert.deepEqual(unverifiable, []);
  });

  test("everything is unverifiable when gh is unavailable for all of them", () => {
    const { confirmed, unverifiable } = partitionMissingForNext(
      [NIGHTLY, ROT],
      new Set(["acmm:nightly-compliance", "acmm:instruction-rot-detection"])
    );
    assert.deepEqual(confirmed, []);
    assert.equal(unverifiable.length, 2);
  });

  test("tolerates an empty missing list", () => {
    const { confirmed, unverifiable } = partitionMissingForNext([], new Set(["acmm:whatever"]));
    assert.deepEqual(confirmed, []);
    assert.deepEqual(unverifiable, []);
  });

  // The filter `--apply` already applies (#3719) must be the SAME one the
  // console prints, or the two can drift apart again.
  test("confirmed is exactly what --apply would file", () => {
    const missing = [NIGHTLY, COPILOT, ROT];
    const unverifiableIds = new Set(["acmm:nightly-compliance", "acmm:instruction-rot-detection"]);
    assert.deepEqual(
      partitionMissingForNext(missing, unverifiableIds).confirmed,
      missing.filter((c) => !unverifiableIds.has(c.id))
    );
  });
});

describe("formatSinceLastRunCount", () => {
  test("attributes a drop to unverifiable criteria when there are some", () => {
    assert.equal(
      formatSinceLastRunCount(-8, 9),
      "-8, 9 unverifiable this run — status unknown, not a confirmed regression"
    );
  });

  test("leaves a drop unattributed when nothing is unverifiable", () => {
    assert.equal(formatSinceLastRunCount(-8, 0), "-8");
  });

  test("does not attribute a rise or a flat count", () => {
    assert.equal(formatSinceLastRunCount(3, 9), "+3");
    assert.equal(formatSinceLastRunCount(0, 9), "±0");
    assert.equal(formatSinceLastRunCount(0, 0), "±0");
  });
});

describe("formatNextLevelSection", () => {
  const TRIGGER = "I want the system to decide what work to do next.";

  test("lists confirmed gaps and status-unknown criteria under separate headings", () => {
    const out = formatNextLevelSection(TRIGGER, [COPILOT], [NIGHTLY, ROT]);
    assert.match(out, /^Next: I want the system to decide what work to do next\.$/m);
    assert.match(out, /^Missing for next level \(1\):$/m);
    assert.match(
      out,
      /^ {2}\u2022 acmm:copilot-review-apply \u2014 Automated review application$/m
    );
    assert.match(out, /^Status unknown for next level \(2\) \u2014 not filed by --apply:$/m);
    assert.match(out, /^ {2}\? acmm:nightly-compliance \u2014 Nightly compliance scan$/m);
    assert.match(out, /^ {2}\? acmm:instruction-rot-detection \u2014 Instruction rot detection$/m);
  });

  test("omits the status-unknown heading entirely when there are none", () => {
    const out = formatNextLevelSection(TRIGGER, [COPILOT], []);
    assert.match(out, /^Missing for next level \(1\):$/m);
    assert.ok(!out.includes("Status unknown"));
  });

  test("still prints a zero count when every gap is unverifiable", () => {
    const out = formatNextLevelSection(TRIGGER, [], [NIGHTLY]);
    assert.match(out, /^Missing for next level \(0\):$/m);
    assert.match(out, /^Status unknown for next level \(1\)/m);
  });

  test("truncates each list at six and says how many more there are", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `acmm:c${i}`, name: `C${i}` }));
    const out = formatNextLevelSection(TRIGGER, many, many);
    assert.match(out, /^ {2}\u2026 3 more$/m);
    assert.equal(out.split("\n").filter((l) => l.startsWith("  \u2022 ")).length, 6);
    assert.equal(out.split("\n").filter((l) => l.startsWith("  ? ")).length, 6);
    assert.equal(out.split("\n").filter((l) => l === "  \u2026 3 more").length, 2);
  });

  // One console.log per section keeps the repo's AI-antipattern consoleLogs
  // ratchet (scripts/check-ai-antipatterns.mjs) from climbing for what is a
  // formatting change, and makes the section assertable without capturing stdout.
  test("returns one string rather than writing to stdout", () => {
    assert.equal(typeof formatNextLevelSection(TRIGGER, [COPILOT], []), "string");
  });
});
