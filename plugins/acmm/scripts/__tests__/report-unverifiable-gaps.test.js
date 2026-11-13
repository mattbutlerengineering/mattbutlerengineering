/**
 * report.md must not present unverifiable criteria as confirmed gaps or as a
 * confirmed regression (#8849, follow-up to #8847 which fixed the console).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReport } from "../outputs/report.js";
import { partitionMissingForNext, formatSinceLastRunCount } from "../next-level.js";

const crit = (id, name) => ({
  id,
  name,
  description: `${name} desc`,
  source: "acmm",
  category: "ci",
  detection: { type: "file", pattern: [`.github/workflows/${id}.yml`] },
});
const CONFIRMED = crit("acmm:copilot-review-apply", "Automated review application");
const UNKNOWN_A = crit("acmm:nightly-compliance", "Nightly compliance scan");
const UNKNOWN_B = crit("acmm:instruction-rot-detection", "Instruction rot detection");

function render({ unverifiable, diff }) {
  const root = mkdtempSync(join(tmpdir(), "acmm-report-gaps-"));
  try {
    const path = writeReport(root, {
      state: {
        detectedIds: [],
        history: [],
        behavioral: null,
        lastRun: new Date().toISOString(),
        currentLevel: 3,
        levelName: "L3",
        role: "r",
      },
      criteria: [],
      sources: [],
      computation: {
        level: 3,
        levelName: "L3",
        role: "r",
        characteristic: "",
        antiPattern: "",
        nextTransitionTrigger: "go",
        detectedByLevel: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        requiredByLevel: { 2: 3, 3: 5, 4: 14, 5: 16, 6: 8 },
        missingForNextLevel: [CONFIRMED, UNKNOWN_A, UNKNOWN_B],
        prerequisites: { met: 0, total: 0 },
        crossCutting: { learning: { met: 0, total: 0 }, traceability: { met: 0, total: 0 } },
        behavioralGates: [],
      },
      diff,
      hollowCriteria: [],
      unverifiableCriteria: unverifiable.map((c) => ({
        id: c.id,
        reason: "gh: command not found",
      })),
    });
    return readFileSync(path, "utf-8");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const diff = {
  levelDelta: -2,
  priorLevel: 5,
  priorCount: 73,
  countDelta: -8,
  added: [],
  removed: [],
};

describe("next-level helpers module", () => {
  test("exports the partition and count helpers", () => {
    const { confirmed } = partitionMissingForNext([CONFIRMED, UNKNOWN_A], new Set([UNKNOWN_A.id]));
    assert.deepEqual(
      confirmed.map((c) => c.id),
      [CONFIRMED.id]
    );
    assert.equal(formatSinceLastRunCount(0, 0), "±0");
  });
});

describe("writeReport: unverifiable criteria are not confirmed gaps", () => {
  test("Since last run headline attributes the drop", () => {
    const md = render({ unverifiable: [UNKNOWN_A, UNKNOWN_B], diff });
    assert.match(
      md,
      /\(-8, 2 unverifiable this run — status unknown, not a confirmed regression\)/
    );
  });

  test("headline unchanged when nothing is unverifiable", () => {
    const md = render({ unverifiable: [], diff });
    assert.match(md, /detected \(-8\)\./);
  });

  test("Next steps heading and list count confirmed gaps only", () => {
    const md = render({ unverifiable: [UNKNOWN_A, UNKNOWN_B], diff: null });
    const section = md.split("## Next steps")[1].split("\n## ")[0];
    assert.match(md, /## Next steps — close \d+ of 1 L4 gap\n/);
    assert.ok(section.includes(CONFIRMED.id));
    assert.ok(!section.includes(UNKNOWN_A.id));
    assert.ok(!section.includes(UNKNOWN_B.id));
  });

  test("Next-level gaps heading and list count confirmed gaps only", () => {
    const md = render({ unverifiable: [UNKNOWN_A, UNKNOWN_B], diff: null });
    assert.match(md, /## Next-level gaps \(1\)\n/);
    const section = md.split("## Next-level gaps")[1].split("\n## ")[0];
    assert.ok(section.includes(CONFIRMED.id));
    assert.ok(!section.includes(UNKNOWN_A.id));
  });

  test("status-unknown criteria get their own heading marked not filed by --apply", () => {
    const md = render({ unverifiable: [UNKNOWN_A, UNKNOWN_B], diff: null });
    assert.match(md, /Status unknown for next level \(2\) — not filed by --apply/);
    const section = md.split("Status unknown for next level")[1];
    assert.ok(section.includes(UNKNOWN_A.id));
    assert.ok(section.includes(UNKNOWN_B.id));
  });

  test("no status-unknown heading when nothing is unverifiable", () => {
    const md = render({ unverifiable: [], diff: null });
    assert.ok(!md.includes("Status unknown for next level"));
    assert.match(md, /## Next-level gaps \(3\)\n/);
  });
});
