import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { substanceCheckers, runSubstanceChecks } from "../substance.js";
import { evaluate } from "../evaluate.js";
import { ALL_CRITERIA } from "../sources/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "substance-test-"));
}

/** ISO date N days before now — lets recency fixtures stay valid as the clock moves. */
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

describe("reflection substance checker", () => {
  const checker = substanceCheckers["acmm:correction-capture"];

  test("passes when a recent entry has feeds_back_into and body > 50 chars", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "fresh.md");
    const freshDate = isoDaysAgo(3);
    writeFileSync(
      filePath,
      [
        "---",
        `date: ${freshDate}`,
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "This is a substantive reflection body that contains enough content to pass the minimum character threshold for validation.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    assert.match(result.evidence, new RegExp(freshDate));
    rmSync(dir, { recursive: true });
  });

  test("fails for an empty corpus", () => {
    const dir = makeTmpDir();
    const result = checker([], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("failure evidence names the newest entry and its age", () => {
    const dir = makeTmpDir();
    const staleDate = isoDaysAgo(200);
    writeFileSync(
      join(dir, "older.md"),
      [
        "---",
        `date: ${isoDaysAgo(400)}`,
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "An older substantive reflection body long enough to clear the minimum character threshold.",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "newer.md"),
      [
        "---",
        `date: ${staleDate}`,
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "A newer substantive reflection body long enough to clear the minimum character threshold.",
      ].join("\n")
    );
    const result = checker([join(dir, "older.md"), join(dir, "newer.md")], dir);
    assert.equal(result.passed, false);
    assert.match(result.evidence, new RegExp(staleDate));
    assert.match(result.evidence, /200 days old/);
    rmSync(dir, { recursive: true });
  });

  test("ignores dates in the body, so a review note on an old entry is not a fresh capture", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reviewed.md");
    writeFileSync(
      filePath,
      [
        "---",
        `date: ${isoDaysAgo(200)}`,
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "A substantive reflection body long enough to clear the minimum character threshold.",
        "",
        `## Verification ${isoDaysAgo(1)} (monthly reflection review)`,
        "",
        "Lesson re-verified as still true.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when the newest qualifying entry is outside the recency window", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "stale.md");
    writeFileSync(
      filePath,
      [
        "---",
        `date: ${isoDaysAgo(200)}`,
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "This is a substantive reflection body that contains enough content to pass the minimum character threshold for validation.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when frontmatter missing feeds_back_into", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(
      filePath,
      [
        "---",
        "title: some reflection",
        "---",
        "",
        "This is a substantive reflection body that contains enough content to pass the minimum character threshold for validation.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when body is too short", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(filePath, ["---", "feeds_back_into: CLAUDE.md", "---", "", "Short."].join("\n"));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("skill substance checker", () => {
  const checker = substanceCheckers["acmm:simple-skills"];

  test("passes for non-stub skill with trigger and >100 chars instruction", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(
      filePath,
      [
        "---",
        "name: my-skill",
        "description: Does something useful when triggered by user request",
        "---",
        "",
        "# My Skill",
        "",
        "This skill provides a detailed workflow for completing a common task. It includes multiple steps that guide the agent through the process from start to finish with clear checkpoints.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails for stub skill with <100 chars instruction", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(
      filePath,
      ["---", "name: stub-skill", "description: placeholder", "---", "", "# TODO", "", "TBD"].join(
        "\n"
      )
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty skill file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("feedback loop substance checker", () => {
  const checker = substanceCheckers["acmm:feedback-loops"];

  test("passes when log has entries from last 30 days", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    const recentDate = new Date().toISOString().split("T")[0];
    writeFileSync(filePath, `## ${recentDate}\n\nSome feedback loop entry with content.\n`);
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when log entries are stale (>30 days)", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    writeFileSync(filePath, "## 2024-01-01\n\nOld entry.\n");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty log file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    assert.match(result.evidence, /no dated entries/, result.evidence);
    rmSync(dir, { recursive: true });
  });

  test("stale verdict names the newest entry, its age, and the window", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    writeFileSync(
      filePath,
      `## ${isoDaysAgo(120)}\n\nAn old run.\n\n## ${isoDaysAgo(31)}\n\nThe last run.\n`
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    assert.match(
      result.evidence,
      /newest entry \d{4}-\d{2}-\d{2} is 31 days old \(window: 30 days\)/,
      result.evidence
    );
    rmSync(dir, { recursive: true });
  });

  // A missing log and a log that stopped being written are different failures: the first says
  // the loop was never wired up, the second says it died on a knowable date. Reporting them
  // identically is what let the criterion sit red without anyone knowing which one to fix.
  test("a missing log fails with evidence distinguishable from a stale log", () => {
    const dir = makeTmpDir();
    const stalePath = join(dir, "log.md");
    writeFileSync(stalePath, `## ${isoDaysAgo(400)}\n\nThe last run.\n`);
    const stale = checker([stalePath], dir);
    const missing = checker([join(dir, "absent.md")], dir);

    assert.equal(stale.passed, false);
    assert.equal(missing.passed, false);
    assert.notEqual(missing.evidence, stale.evidence);
    assert.match(stale.evidence, /\d{4}-\d{2}-\d{2}/, stale.evidence);
    assert.doesNotMatch(missing.evidence, /\d{4}-\d{2}-\d{2}/, missing.evidence);
    rmSync(dir, { recursive: true });
  });
});

describe("test coverage substance checker", () => {
  const checker = substanceCheckers["fullsend:test-coverage"];

  test("passes when coverage config has recognizable threshold", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "vitest.config.ts");
    writeFileSync(
      filePath,
      "export default { test: { coverage: { thresholds: { lines: 80, branches: 70 } } } }"
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when file has no threshold values", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "vitest.config.ts");
    writeFileSync(filePath, "export default { test: {} }");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("runbook substance checker", () => {
  const checker = substanceCheckers["fullsend:observability-runbook"];

  test("passes when runbook references real service names", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "runbook.md");
    writeFileSync(
      filePath,
      "# Runbook\n\nCheck the /api/v1/users/health endpoint.\nRestart the users-service pod.\nMonitor Grafana dashboard.\n"
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when runbook is a stub without operational references", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "runbook.md");
    writeFileSync(filePath, "# Runbook\n\nTODO: fill in later\n");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

/**
 * A session summary shaped like `.claude/session-summary.template.md`: frontmatter carrying the
 * declared date, a retrospective section, and the two forward-looking sections. Anything left
 * unspecified stays on the template's italic placeholders, which is the state the criteria are
 * supposed to read as "nothing was written".
 */
function summaryFixture({ date, retrospect = [], forward = [], bodyDate = null }) {
  return [
    "---",
    `date: ${date}`,
    "session: _auto-populated_",
    "---",
    "",
    "# Session Summary",
    "",
    "## What changed",
    "",
    "_List files created, modified, or deleted. Group by purpose._",
    ...(retrospect.length
      ? retrospect.map((l) => `- ${l}`)
      : ["- **Created:** _list of new files_", "- **Modified:** _list of changed files_"]),
    ...(bodyDate ? ["", `Re-read and confirmed still accurate on ${bodyDate}.`] : []),
    "",
    "## Next steps",
    "",
    "_What should the next session pick up? Include specific file paths or issue numbers._",
    ...(forward.length ? forward.map((l) => `- [ ] ${l}`) : ["- [ ] _Next step 1_"]),
    "",
    "## Continuity notes",
    "",
    "_Context that would be lost between sessions: environment state, partially completed work._",
    "- _Note 1_",
  ].join("\n");
}

/** A reinforcement entry as `.claude/memory/reinforcements/` writes them. */
function reinforcementFixture({ date, bodyDate = null }) {
  return [
    "---",
    `date: ${date}`,
    "session: some-session",
    "action: Derived render-time state instead of syncing it in a useEffect",
    "context: The component re-rendered without a loop and the snapshot stayed correct.",
    "pattern: Compute during render rather than setting state from an effect.",
    "---",
    ...(bodyDate
      ? ["", `## Verification ${bodyDate} (monthly reflection review)`, "", "Still true."]
      : []),
  ].join("\n");
}

const RETRO_LINES = [
  "Rewrote the substance checker so an existence test can no longer stand in for a recency test.",
  "Added seam tests that execute the real hook in a sandbox instead of asserting on its source.",
];
const FORWARD_LINES = ["Regenerate the ACMM report and confirm the three criteria report hollow."];

describe("reinforcement substance checker", () => {
  const checker = substanceCheckers["acmm:positive-reinforcement"];

  test("passes when a recent entry declares a reinforcement pattern", () => {
    const dir = makeTmpDir();
    const fresh = isoDaysAgo(5);
    const filePath = join(dir, "fresh.md");
    writeFileSync(filePath, reinforcementFixture({ date: fresh }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, true, result.evidence);
    assert.match(result.evidence, new RegExp(fresh));
    rmSync(dir, { recursive: true });
  });

  test("fails when the newest entry is outside the 90-day window", () => {
    const dir = makeTmpDir();
    const stale = isoDaysAgo(130);
    const filePath = join(dir, "stale.md");
    writeFileSync(filePath, reinforcementFixture({ date: stale }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    assert.match(result.evidence, new RegExp(`${stale} is 130 days old \\(window: 90 days\\)`));
    rmSync(dir, { recursive: true });
  });

  // A dead corpus and an absent one are different problems: the first stopped on a knowable date,
  // the second was never wired up. They must not report identically.
  test("a missing corpus fails with evidence distinguishable from a stale one", () => {
    const dir = makeTmpDir();
    const stalePath = join(dir, "stale.md");
    writeFileSync(stalePath, reinforcementFixture({ date: isoDaysAgo(400) }));
    const stale = checker([stalePath], dir);
    const missing = checker([join(dir, "absent.md")], dir);

    assert.equal(stale.passed, false);
    assert.equal(missing.passed, false);
    assert.notEqual(missing.evidence, stale.evidence);
    assert.match(stale.evidence, /\d{4}-\d{2}-\d{2}/, stale.evidence);
    assert.doesNotMatch(missing.evidence, /\d{4}-\d{2}-\d{2}/, missing.evidence);
    rmSync(dir, { recursive: true });
  });

  // Two of this repo's three reinforcements carry a "## Verification <date>" note added months
  // after capture. Re-reading an old lesson is not capturing a new one.
  test("ignores dates in the body, so a verification note is not a fresh capture", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reviewed.md");
    writeFileSync(
      filePath,
      reinforcementFixture({ date: isoDaysAgo(200), bodyDate: isoDaysAgo(1) })
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });

  // The criterion exists to prove the repo captures what works, not only what fails. Detection is
  // `.claude/memory/`, which holds both corpora, so a fresh correction must not satisfy it.
  test("a correction does not satisfy the reinforcement criterion", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "correction.md");
    writeFileSync(
      filePath,
      [
        "---",
        `date: ${isoDaysAgo(1)}`,
        "trigger: Read a file from a stale checkout",
        "correction: Read from origin/main instead",
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "A substantive correction body, long enough to clear any minimum length threshold.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });
});

describe("session summary substance checker", () => {
  const checker = substanceCheckers["acmm:session-summary"];

  test("passes for a recent summary carrying content beyond the placeholders", () => {
    const dir = makeTmpDir();
    const fresh = isoDaysAgo(2);
    const filePath = join(dir, "session-summary.md");
    writeFileSync(filePath, summaryFixture({ date: fresh, retrospect: RETRO_LINES }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, true, result.evidence);
    assert.match(result.evidence, new RegExp(fresh));
    rmSync(dir, { recursive: true });
  });

  test("fails when the newest filled summary is outside the 90-day window", () => {
    const dir = makeTmpDir();
    const stale = isoDaysAgo(132);
    const filePath = join(dir, "session-summary.md");
    writeFileSync(filePath, summaryFixture({ date: stale, retrospect: RETRO_LINES }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    assert.match(result.evidence, new RegExp(`${stale} is 132 days old \\(window: 90 days\\)`));
    rmSync(dir, { recursive: true });
  });

  // The defect this criterion had: the scratchpad is a copy of the template until a session fills
  // it, and existence alone read green for the whole of that time (#5598).
  test("an untouched template fails — every row is still a placeholder", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "session-summary.md");
    writeFileSync(filePath, summaryFixture({ date: "_YYYY-MM-DD_" }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });

  test("a missing file fails with evidence distinguishable from a stale summary", () => {
    const dir = makeTmpDir();
    const stalePath = join(dir, "session-summary.md");
    writeFileSync(stalePath, summaryFixture({ date: isoDaysAgo(400), retrospect: RETRO_LINES }));
    const stale = checker([stalePath], dir);
    const missing = checker([join(dir, "absent.md")], dir);

    assert.equal(stale.passed, false);
    assert.equal(missing.passed, false);
    assert.notEqual(missing.evidence, stale.evidence);
    assert.match(stale.evidence, /\d{4}-\d{2}-\d{2}/, stale.evidence);
    assert.doesNotMatch(missing.evidence, /\d{4}-\d{2}-\d{2}/, missing.evidence);
    rmSync(dir, { recursive: true });
  });

  // A summary's body is full of ISO dates — commits, issues, "what changed". Any of them would
  // re-date a stale summary forever, which is the fossil the grep detection already was.
  test("ignores dates in the body, so mentioning today does not make a summary fresh", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "session-summary.md");
    writeFileSync(
      filePath,
      summaryFixture({
        date: isoDaysAgo(200),
        retrospect: RETRO_LINES,
        bodyDate: isoDaysAgo(0),
      })
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });
});

describe("session continuity substance checker", () => {
  const checker = substanceCheckers["acmm:session-continuity"];

  test("passes when a recent record carries forward context", () => {
    const dir = makeTmpDir();
    const fresh = isoDaysAgo(2);
    const filePath = join(dir, "session-summary.md");
    writeFileSync(
      filePath,
      summaryFixture({
        date: fresh,
        retrospect: RETRO_LINES,
        forward: FORWARD_LINES,
      })
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true, result.evidence);
    assert.match(result.evidence, new RegExp(fresh));
    rmSync(dir, { recursive: true });
  });

  // The gate that separates this criterion from acmm:session-summary. Its rationale is bridging
  // "what can't be derived — what was planned", so a purely retrospective summary leaves the next
  // session nothing to recover, however recent it is. This repo's committed scratchpad is exactly
  // that shape: two real lines of retrospect, every forward-looking row on its placeholder.
  test("fails when the forward-looking sections are still on their placeholders", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "session-summary.md");
    writeFileSync(filePath, summaryFixture({ date: isoDaysAgo(1), retrospect: RETRO_LINES }));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });

  test("fails when the newest record with forward context is outside the 90-day window", () => {
    const dir = makeTmpDir();
    const stale = isoDaysAgo(132);
    const filePath = join(dir, "session-summary.md");
    writeFileSync(
      filePath,
      summaryFixture({
        date: stale,
        retrospect: RETRO_LINES,
        forward: FORWARD_LINES,
      })
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    assert.match(result.evidence, new RegExp(`${stale} is 132 days old \\(window: 90 days\\)`));
    rmSync(dir, { recursive: true });
  });

  test("a missing file fails with evidence distinguishable from a stale record", () => {
    const dir = makeTmpDir();
    const stalePath = join(dir, "session-summary.md");
    writeFileSync(
      stalePath,
      summaryFixture({
        date: isoDaysAgo(400),
        retrospect: RETRO_LINES,
        forward: FORWARD_LINES,
      })
    );
    const stale = checker([stalePath], dir);
    const missing = checker([join(dir, "absent.md")], dir);

    assert.equal(stale.passed, false);
    assert.equal(missing.passed, false);
    assert.notEqual(missing.evidence, stale.evidence);
    assert.match(stale.evidence, /\d{4}-\d{2}-\d{2}/, stale.evidence);
    assert.doesNotMatch(missing.evidence, /\d{4}-\d{2}-\d{2}/, missing.evidence);
    rmSync(dir, { recursive: true });
  });

  test("ignores dates in the body, so mentioning today does not make a record current", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "session-summary.md");
    writeFileSync(
      filePath,
      summaryFixture({
        date: isoDaysAgo(200),
        retrospect: RETRO_LINES,
        forward: FORWARD_LINES,
        bodyDate: isoDaysAgo(0),
      })
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false, result.evidence);
    rmSync(dir, { recursive: true });
  });
});
describe("correction-capture integration — real repo files", () => {
  const checker = substanceCheckers["acmm:correction-capture"];
  const repoRoot = resolve(__dirname, "../../../..");
  const correctionDir = join(repoRoot, ".claude/memory/corrections");

  // Deliberately does NOT pin pass/fail. The corpus is stale today (#5585) so the checker fails,
  // but capturing a fresh correction is the *correct* fix — a test asserting failure would go red
  // on the very action this criterion exists to encourage.
  test("at least one correction file still satisfies the structural half", () => {
    assert.ok(existsSync(correctionDir), `corrections dir should exist: ${correctionDir}`);
    const files = readdirSync(correctionDir).map((f) => join(correctionDir, f));
    const structural = files.filter((f) => readFileSync(f, "utf-8").includes("feeds_back_into:"));
    assert.ok(structural.length > 0, "expected a correction carrying feeds_back_into");
  });

  test("verdict on the real corpus names the newest entry and its age", () => {
    const files = readdirSync(correctionDir).map((f) => join(correctionDir, f));
    const result = checker(files, repoRoot);
    assert.match(result.evidence, /\d{4}-\d{2}-\d{2} is \d+ days old/, result.evidence);
  });
});

describe("feedback-loops integration — real repo files", () => {
  const repoRoot = resolve(__dirname, "../../../..");
  const criterion = ALL_CRITERIA.find((c) => c.id === "acmm:feedback-loops");
  const loopDir = join(repoRoot, ".claude/improvement-loop");
  const loopLog = join(loopDir, "log.md");

  /** Newest ISO date across the whole loop record — the same set of files the checker reads. */
  function newestLoggedDate() {
    const dates = readdirSync(loopDir)
      .flatMap((f) => [
        ...readFileSync(join(loopDir, f), "utf-8").matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g),
      ])
      .map((m) => m[1]);
    return dates.sort().at(-1);
  }

  test("detection resolves the dated loop record, not an instruction file", () => {
    assert.ok(existsSync(loopLog), `loop log should exist: ${loopLog}`);
    const patterns = Array.isArray(criterion.detection.pattern)
      ? criterion.detection.pattern
      : [criterion.detection.pattern];
    assert.ok(
      patterns.includes(".claude/improvement-loop/log.md"),
      `expected the loop record in detection patterns, got: ${patterns.join(", ")}`
    );
  });

  // Deliberately does NOT pin pass/fail, for the same reason the correction-capture block above
  // doesn't: a test that reds when the *repo* goes quiet fails for a reason unrelated to any PR's
  // diff, and under this repo's green-main policy that blocks every other PR until someone works
  // out the cause was "the loop stopped", not "your change broke something". Real staleness has a
  // non-blocking channel already — nightly-compliance reports ACMM drift as a GitHub issue, which
  // is how #5613 (the defect this criterion's re-pointing fixes) got filed in the first place.
  //
  // What IS pinned here is the mechanism: that detection resolves the loop record, and that the
  // verdict is computed from that record's newest entry rather than from some other file's dates.
  // The hermetic fixture tests above pin the pass/fail behaviour itself.
  test("detection resolves against the real repo (verdict either way, never not-found)", () => {
    const result = evaluate(criterion, repoRoot);
    assert.notEqual(result.verdict, "not-found", result.evidence);
    assert.match(result.evidence, /detected at: \.claude\/improvement-loop\//, result.evidence);
  });

  test("verdict on the real loop record names its newest entry and that entry's age", () => {
    const results = runSubstanceChecks(new Set([criterion.id]), [criterion], repoRoot);
    const { substanceEvidence } = results[criterion.id];
    assert.match(substanceEvidence, /\d{4}-\d{2}-\d{2} is \d+ days old/, substanceEvidence);
    assert.ok(
      substanceEvidence.includes(newestLoggedDate()),
      `expected evidence to name ${newestLoggedDate()}, got: ${substanceEvidence}`
    );
  });
});

describe("session + reinforcement integration — real repo files", () => {
  const repoRoot = resolve(__dirname, "../../../..");

  // Deliberately does NOT pin pass/fail, for the same reason the two blocks above don't: a test
  // that reds when the repo goes quiet fails for a reason unrelated to any PR's diff, and under
  // this repo's green-main policy that blocks every other PR until someone works out the cause was
  // "nobody wrote a summary", not "your change broke something". Real staleness has a non-blocking
  // channel already — nightly-compliance reports ACMM drift as a GitHub issue.
  //
  // What IS pinned is the mechanism: detection resolves against the real tree, and the substance
  // verdict is a real string rather than a silent "no files found". The hermetic fixtures above
  // pin the pass/fail behaviour itself.
  for (const id of [
    "acmm:positive-reinforcement",
    "acmm:session-summary",
    "acmm:session-continuity",
  ]) {
    test(`${id} detects against the real repo and reports substance evidence`, () => {
      const criterion = ALL_CRITERIA.find((c) => c.id === id);
      assert.ok(criterion, `criterion should exist in the catalog: ${id}`);

      const detection = evaluate(criterion, repoRoot);
      assert.notEqual(detection.verdict, "not-found", detection.evidence);

      const results = runSubstanceChecks(new Set([id]), [criterion], repoRoot);
      const { substanceEvidence } = results[id];
      assert.equal(typeof substanceEvidence, "string", `${id} should have a substance checker`);
      assert.notEqual(substanceEvidence, "no files found for substance check", substanceEvidence);
    });
  }

  // Pins the discriminator against the real corpus rather than against a fixture: detection for
  // acmm:positive-reinforcement is `.claude/memory/`, which also holds the corrections corpus, and
  // that one is alive. If a correction could satisfy this checker the criterion would read green
  // off the wrong practice — exactly the false reading #5613 fixed for acmm:feedback-loops.
  test("no correction in the real corpus qualifies as a reinforcement", () => {
    const correctionDir = join(repoRoot, ".claude/memory/corrections");
    const files = readdirSync(correctionDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(correctionDir, f));
    assert.ok(files.length > 0, `expected correction files in ${correctionDir}`);

    const result = substanceCheckers["acmm:positive-reinforcement"](files, repoRoot);
    assert.equal(result.passed, false, result.evidence);
    assert.doesNotMatch(result.evidence, /\d{4}-\d{2}-\d{2}/, result.evidence);
  });
});
describe("runSubstanceChecks", () => {
  test("returns substantive=true for criteria with passing checker", () => {
    const dir = makeTmpDir();
    const skillDir = join(dir, "skills", "test");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: test-skill",
        "description: A well-described skill for testing purposes",
        "---",
        "",
        "# Test Skill",
        "",
        "This skill provides a comprehensive workflow for testing. It includes validation steps, error handling guidance, and detailed instructions that go well beyond a simple stub.",
      ].join("\n")
    );

    const detectedIds = new Set(["acmm:simple-skills"]);
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: [join(skillDir, "SKILL.md")] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, dir);
    assert.equal(results["acmm:simple-skills"].substantive, true);
    rmSync(dir, { recursive: true });
  });

  test("returns substantive=false for criteria with failing checker", () => {
    const dir = makeTmpDir();
    const skillDir = join(dir, "skills", "test");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "stub");

    const detectedIds = new Set(["acmm:simple-skills"]);
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: [join(skillDir, "SKILL.md")] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, dir);
    assert.equal(results["acmm:simple-skills"].substantive, false);
    rmSync(dir, { recursive: true });
  });

  test("returns substantive=null for criteria without checker", () => {
    const detectedIds = new Set(["acmm:some-other-criterion"]);
    const criteria = [
      {
        id: "acmm:some-other-criterion",
        detection: { type: "path", pattern: "some/file" },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, "/tmp");
    assert.equal(results["acmm:some-other-criterion"].substantive, null);
  });

  test("skips substance check for undetected criteria", () => {
    const detectedIds = new Set();
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: ["skills/"] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, "/tmp");
    assert.equal(results["acmm:simple-skills"], undefined);
  });

  test("expands directory patterns that resolve to existing dirs (real-world .claude/skills/ case)", () => {
    // Reproduces the bug: patterns like ".claude/skills/" resolve to existing directories,
    // but substance.js was calling checker(dirPaths) directly instead of expanding them.
    const dir = makeTmpDir();
    const skillsDir = join(dir, ".claude", "skills", "my-skill");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "SKILL.md"),
      [
        "---",
        "name: my-skill",
        "description: Does something useful",
        "---",
        "",
        "# My Skill",
        "",
        "This skill provides a detailed workflow for completing a common task. It includes multiple steps that guide the agent through the process from start to finish with clear checkpoints.",
      ].join("\n")
    );

    const detectedIds = new Set(["acmm:simple-skills"]);
    const criteria = [
      {
        id: "acmm:simple-skills",
        // Pattern is a directory (trailing slash), matching the real acmm.js detection pattern
        detection: { type: "any-of", pattern: [".claude/skills/", ".claude/commands/", "skills/"] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, dir);
    assert.equal(results["acmm:simple-skills"].substantive, true);
    rmSync(dir, { recursive: true });
  });
});
