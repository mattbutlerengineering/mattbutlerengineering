#!/usr/bin/env node

/**
 * ACMM audit runner — canonical 6-level model.
 *
 * Ports the criterion catalog from kubestellar/console:
 *   web/src/lib/acmm/sources/{acmm,fullsend,agentic-engineering-framework,claude-reflect}.ts
 *
 * Usage:
 *   node scripts/acmm/audit.js                     # dry run — write state + report
 *   node scripts/acmm/audit.js --apply             # + create deduplicated GitHub issues for gaps
 *   node scripts/acmm/audit.js --badge             # + rewrite README badge
 *   node scripts/acmm/audit.js --apply --badge     # full run (what scheduled triggers call)
 *   node scripts/acmm/audit.js --trend             # print history only
 *
 * Exit code: 0 on completion regardless of level (diagnostic, not gating).
 */

import { ALL_CRITERIA, SOURCES } from "./sources/index.js";
import { verdictCounts } from "./evaluate.js";
import { evaluateWithInheritance } from "./inheritance.js";
import { substanceCheckers } from "./substance.js";
import { computeLevel } from "./computeLevel.js";
import { computeDetectionDiff } from "./diff.js";
import { loadState, saveState, recordHistory } from "./state.js";
import { writeReport } from "./outputs/report.js";
import { updateBadge } from "./outputs/badge.js";
import { applyIssuesForFailures, ensureAcmmLabel } from "./outputs/issues.js";
import { measureFlakeRate } from "./flake-rate.js";
import { measurePrOutcomes } from "./pr-outcomes.js";
import { measureEvals } from "./evals.js";
import { formatEvalsLine } from "./evals-freshness.js";
import { freshBehavioralReading, describeBehavioralAge } from "./behavioral-freshness.js";
import path from "node:path";
import fs, { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Weekly heartbeat: write state even with no detected change once the prior
 *  run is this old, so the badge's own 7-day freshness check stays honest
 *  (#5852 AC9). */
const STATE_HEARTBEAT_MAX_AGE_DAYS = 6;

/**
 * Is `gh` usable right now — binary present AND authenticated? A single
 * upfront check drives the state-write policy (AC9): per-criterion
 * evaluation and the flake/PR-outcome readers already handle a `gh` failure
 * on their own call sites and are unaffected by this flag.
 *
 * @param {{ execFn?: typeof execFileSync, ghBin?: string }} [opts]
 * @returns {boolean}
 */
export function checkGhAvailable(opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const ghBin = opts.ghBin ?? "gh";
  try {
    execFn(ghBin, ["auth", "status", "--hostname", "github.com"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reshape `measureFlakeRate()`'s output into the `behavioral.flake` snapshot
 * `computeLevel`'s L3 gate reads — carrying `insufficient_data` and
 * `oldest_record_at` through unchanged (review item 1). A prior version of
 * this reshape dropped both fields, so a 3-SHA/0-flake sample read as a
 * passing gate instead of unverifiable, and the report's "oldest record
 * covered" line never had data to render.
 *
 * @param {ReturnType<typeof import("./flake-rate.js").computeFlakeRate>} flake
 * @param {{ now?: Date }} [opts]
 * @returns {{ rate_30d: number, sample_size: number, flaky_shas: string[], insufficient_data: boolean, oldest_record_at: string|null, measured_at: string }}
 */
export function buildFlakeSnapshot(flake, opts = {}) {
  const now = opts.now ?? new Date();
  return {
    rate_30d: flake.flake_rate_30d,
    sample_size: flake.flake_sample_size,
    flaky_shas: flake.flaky_shas,
    insufficient_data: flake.insufficient_data,
    oldest_record_at: flake.oldest_record_at,
    measured_at: now.toISOString(),
  };
}

/**
 * Render one behavioral gate's console line. Single source of truth for gate
 * rendering (review item 6) — this used to be duplicated across two loops
 * that had drifted apart, and neither distinguished "no value was ever
 * measured" from "a value exists but `insufficient_data` disqualifies it".
 * The latter must say so explicitly — a bare percentage next to a ✗ FAIL
 * icon reads as "the data says this fails" when the true state is "the
 * sample is too small to trust".
 *
 * @param {ReturnType<typeof import("./computeLevel.js").computeLevel>["behavioralGates"][number]} gate
 * @param {boolean} strict
 * @returns {string}
 */
export function formatBehavioralGateLine(gate, strict) {
  let icon, note;
  if (gate.unverifiable) {
    icon = "?";
    note = gate.dataAvailable ? `insufficient sample (n=${gate.sampleSize ?? "?"})` : "no data";
  } else if (gate.passed) {
    icon = "✓";
    note = "pass";
  } else {
    icon = strict ? "✗" : "!";
    note = strict ? "FAIL (level capped)" : "WARN";
  }
  return `  ${icon} L${gate.level} ${gate.name}: ${gate.description}  [${note}]`;
}

/**
 * Is this module the CLI entry point (invoked directly), rather than
 * imported by a test? `process.argv[1] === __filename` no-ops silently
 * through a symlink or a `/tmp`-resolved path — a symlinked invocation of
 * this script would import all its top-level code but never call `main()`,
 * with no error (review item 7). Resolving both sides through the real
 * filesystem path closes that gap; any resolution failure (a path that
 * doesn't exist) fails closed to "not the entry point" rather than throwing.
 *
 * @param {string|undefined} argv1
 * @param {string} moduleUrl
 * @returns {boolean}
 */
export function isEntryPoint(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/**
 * Decide whether this run's state is worth persisting over the prior run's
 * (#5852 AC9). Writes only when something SIGNIFICANT changed — the current
 * level, the detected-criteria set, the per-criterion verdict map, the
 * created-issues map — or the prior run is old enough that skipping again
 * would let the badge's own 7-day staleness check go dishonestly green.
 * Otherwise a write is pure commit noise: 28 `chore(acmm): daily audit`
 * commits in 30 days whose diff is `lastRun` and one history row.
 *
 * @param {import("./state.js").State} prior
 * @param {import("./state.js").State} next
 * @param {{ now?: Date, heartbeatMaxAgeDays?: number }} [opts]
 * @returns {boolean}
 */
export function shouldWriteState(prior, next, opts = {}) {
  const now = opts.now ?? new Date();
  const heartbeatMaxAgeDays = opts.heartbeatMaxAgeDays ?? STATE_HEARTBEAT_MAX_AGE_DAYS;

  if ((prior.currentLevel ?? null) !== (next.currentLevel ?? null)) return true;
  if (!sameIdSet(prior.detectedIds, next.detectedIds)) return true;
  if (JSON.stringify(prior.checks ?? {}) !== JSON.stringify(next.checks ?? {})) return true;
  if (JSON.stringify(prior.issuesCreated ?? {}) !== JSON.stringify(next.issuesCreated ?? {})) {
    return true;
  }

  const priorRunTs = Date.parse(prior.lastRun);
  if (Number.isNaN(priorRunTs)) return true; // no recorded prior run — must write
  const ageDays = (now.getTime() - priorRunTs) / MS_PER_DAY;
  return ageDays > heartbeatMaxAgeDays;
}

/** @param {string[]} [a] @param {string[]} [b] */
function sameIdSet(a, b) {
  const setA = new Set(a ?? []);
  const setB = new Set(b ?? []);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const argSet = new Set(args);
  const APPLY = argSet.has("--apply");
  const BADGE = argSet.has("--badge");
  const TREND = argSet.has("--trend");
  const STRICT = !argSet.has("--no-strict");

  // Parse --label <label> support
  const EXTRA_LABELS = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--label" && args[i + 1]) {
      EXTRA_LABELS.push(args[i + 1]);
      i++;
    }
  }

  // --project <path> support
  let projectPath = process.cwd();
  const projectIdx = process.argv.indexOf("--project");
  if (projectIdx >= 0 && process.argv[projectIdx + 1]) {
    projectPath = path.resolve(process.cwd(), process.argv[projectIdx + 1]);
  }
  const cwd = projectPath;
  const repoRoot = process.cwd();

  // Load project acmm config if it exists
  let acmmConfig = {
    inherit: false,
    globalPaths: [
      ".github/",
      "CONTRIBUTING.md",
      "docs/",
      "scripts/acmm/",
      ".claude/settings.json",
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
    ],
    // These MUST be local to be detected for a project, even if inherit is true
    localOnly: ["CLAUDE.md", "AGENTS.md", "llms.txt", "llms-full.txt", ".cursorrules"],
  };
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.acmm) {
        if (pkg.acmm.globalPaths) {
          acmmConfig.globalPaths = [
            ...new Set([...acmmConfig.globalPaths, ...pkg.acmm.globalPaths]),
          ];
        }
        if (pkg.acmm.inherit !== undefined) acmmConfig.inherit = pkg.acmm.inherit;
      }
    }
  } catch {
    // Ignore
  }

  /** Read .github/auto-qa-tuning.json and return the history entry count. */
  function measureAutoQaTuning(root) {
    try {
      const p = path.join(root, ".github/auto-qa-tuning.json");
      if (!fs.existsSync(p)) return null;
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      return { history_count: Array.isArray(data.history) ? data.history.length : 0 };
    } catch {
      return null;
    }
  }

  /* ── --trend mode: just print history and exit ─────────── */
  if (TREND) {
    const state = loadState(cwd);
    if (state.history.length === 0) {
      console.log("ACMM: no history yet. Run `/acmm-audit` to seed it.");
      process.exit(0);
    }
    console.log("ACMM trend:");
    console.log("  Date        Level  Detected");
    for (const h of state.history) {
      console.log(`  ${h.date}  L${h.level}     ${h.detected}/${h.total}`);
    }
    process.exit(0);
  }

  /* ── Run detection on all 85 criteria ──────────────────── */
  const startedAt = Date.now();
  const prior = loadState(cwd);
  // Drives the state-write policy below (AC9) — computed once, upfront,
  // rather than inferred from per-criterion "unverifiable" verdicts, which
  // answer a different question (did THIS criterion's own gh call fail).
  const ghAvailable = checkGhAvailable();

  // Evaluate all criteria through the verdict seam, with inheritance support
  const { detectedIds, unverifiableIds, criterionVerdicts, origins } = evaluateWithInheritance(
    ALL_CRITERIA,
    cwd,
    repoRoot,
    acmmConfig
  );

  // Collect hollow criteria for the report section (#2022)
  const hollowCriteria = [];
  for (const c of ALL_CRITERIA) {
    const { verdict, substanceEvidence } = criterionVerdicts.get(c.id);
    if (verdict === "hollow") {
      hollowCriteria.push({
        id: c.id,
        substanceEvidence: substanceEvidence ?? "substance check failed",
      });
    }
  }

  // Collect unverifiable criteria for the report section (#2023)
  const unverifiableCriteria = [];
  for (const c of ALL_CRITERIA) {
    if (unverifiableIds.has(c.id)) {
      const { evidence } = criterionVerdicts.get(c.id);
      unverifiableCriteria.push({
        id: c.id,
        reason: evidence ?? "gh CLI unavailable or error",
      });
    }
  }

  const detectedCount = detectedIds.size;
  // Unverifiable criteria stay IN the denominator, counted as not-passed —
  // matching the level walk, which never subtracts them from
  // requiredByLevel either. Excluding them here inflated the headline (#2023
  // made "97/99" read as almost-everything, when 15 of those 99 were never
  // actually verified) while the level math counted them as failures the
  // whole time — the two disagreed on the same numbers (#5852 AC10).
  // `unverifiableCriteria` (below) still reports the count separately.
  const totalCount = ALL_CRITERIA.length;

  /* ── Behavioral signals (non-fatal — null when tools unavailable, and
   * skipped entirely when gh is unavailable so a known-doomed subprocess
   * isn't spawned for every reader) ── */
  const flake = ghAvailable ? measureFlakeRate() : null;
  const prOutcomes = ghAvailable ? measurePrOutcomes() : null;
  const evalsSummary = measureEvals(cwd);
  const autoQaTuning = measureAutoQaTuning(repoRoot);
  const behavioral = {
    ...(prior.behavioral ?? {}),
    flake: flake ? buildFlakeSnapshot(flake) : (prior.behavioral?.flake ?? null),
    agent_pr: prOutcomes
      ? { ...prOutcomes, measured_at: new Date().toISOString() }
      : (prior.behavioral?.agent_pr ?? null),
    // A carried-forward reading keeps its own `lastRun`/`measured_at`, so
    // `formatEvalsLine` can tell the reader how old it is rather than rendering
    // it as a live measurement — which it did for 133 days (#4199).
    evals:
      evalsSummary.freshness === "current"
        ? { ...evalsSummary, measured_at: new Date().toISOString() }
        : (prior.behavioral?.evals ?? null),
    auto_qa_tuning: autoQaTuning
      ? { ...autoQaTuning, measured_at: new Date().toISOString() }
      : (prior.behavioral?.auto_qa_tuning ?? null),
  };

  // Build the behavioral snapshot that computeLevel expects: top-level
  // flake/agent_pr for L3/L4/L6 gates, auto_qa_history_count for L5 gate.
  // Each reading is age-gated first (#5852 AC3): a value carried forward
  // from `prior.behavioral.*` (the only way to reach this line without a
  // fresh measurement) that is older than DEFAULT_MAX_AGE_DAYS is passed to
  // computeLevel as MISSING, not as a live number — same trap `evals`
  // closed for the eval suite in #5655/#4199, now closed for these three.
  const freshFlake = freshBehavioralReading(behavioral.flake);
  const freshAgentPr = freshBehavioralReading(behavioral.agent_pr);
  const freshAutoQaTuning = freshBehavioralReading(behavioral.auto_qa_tuning);
  const computeBehavioral = {
    flake: freshFlake,
    agent_pr: freshAgentPr,
    auto_qa_history_count: freshAutoQaTuning?.history_count,
  };

  const rawComputation = computeLevel(detectedIds, computeBehavioral, { strict: STRICT });
  const levelCap = prior.levelCap ?? null;
  const computation =
    levelCap !== null && rawComputation.level > levelCap
      ? { ...rawComputation, level: levelCap, capped: true, computedLevel: rawComputation.level }
      : { ...rawComputation, capped: false };

  /* ── Diff vs prior saved state ──────────────────────────── */
  const priorIds = new Set(prior.detectedIds ?? []);
  const isFirstRun = !prior.lastRun;
  const diff = computeDetectionDiff({
    priorIds,
    detectedIds,
    unverifiableIds,
    isFirstRun,
    currentLevel: computation.level,
    priorLevel: prior.currentLevel ?? 0,
  });

  /* ── Build per-criterion results map from verdicts (id → {passed, evidence, ...}) ── */
  const results = {};
  for (const c of ALL_CRITERIA) {
    const { verdict, evidence, substanceEvidence: subEv } = criterionVerdicts.get(c.id);
    const passed = verdictCounts(verdict);
    const entry = { passed, evidence, verdict };

    // Propagate substance info using the separate substanceEvidence field from evaluate()
    if (verdict === "hollow") {
      entry.substantive = false;
      entry.substanceEvidence = subEv ?? null;
    } else if (passed && Object.prototype.hasOwnProperty.call(substanceCheckers, c.id)) {
      // Substance checker registered and criterion passed → substance passed
      entry.substantive = true;
      entry.substanceEvidence = null;
    } else {
      entry.substantive = null;
      entry.substanceEvidence = null;
    }

    results[c.id] = entry;
  }

  // Derive substanceResults shape for console reporting (mirrors prior runSubstanceChecks output)
  const substanceResults = {};
  for (const [id, r] of Object.entries(results)) {
    if (r.substantive !== null) {
      substanceResults[id] = { substantive: r.substantive, substanceEvidence: r.substanceEvidence };
    }
  }

  const nextState = recordHistory(
    {
      ...prior,
      lastRun: new Date().toISOString(),
      currentLevel: computation.level,
      levelName: computation.levelName,
      role: computation.role,
      checks: results,
      detectedIds: [...detectedIds],
      computation,
      behavioral,
      ...(levelCap !== null ? { levelCap } : {}),
    },
    computation.level,
    detectedCount,
    totalCount
  );

  /* ── Optionally: --apply (issues for regressions + gaps in next level) ──
   * Runs BEFORE the write decision — it can change `issuesCreated`, which is
   * itself one of the "significant change" triggers below. Never attempted
   * when gh is unavailable: it shells out to gh for every issue it would
   * create, so it can only fail. ── */
  let applyResult = null;
  if (ghAvailable && APPLY) {
    try {
      ensureAcmmLabel();

      // Build a lookup map for criteria by ID.
      const criteriaById = new Map(ALL_CRITERIA.map((c) => [c.id, c]));

      // File issues for regressed criteria first — these are the headline news.
      const regressedCriteria = diff
        ? diff.removed.map((id) => criteriaById.get(id)).filter(Boolean)
        : [];

      // File issues for criteria gating the NEXT level — avoids issue spam
      // for L5/L6 items when we're still climbing L3. Unverifiable criteria are
      // excluded: unknown status isn't a confirmed gap (#3719).
      const failingForNext = computation.missingForNextLevel.filter(
        (c) => !unverifiableIds.has(c.id)
      );

      // Combine: regressions first, then next-level gaps (dedup handled inside).
      const allFailing = [...regressedCriteria, ...failingForNext];
      applyResult = applyIssuesForFailures(allFailing, prior.issuesCreated || {}, {
        extraLabels: EXTRA_LABELS,
      });
    } catch (err) {
      console.error(`--apply failed: ${err instanceof Error ? err.message : String(err)}`);
      applyResult = {
        createdCount: 0,
        skippedOpen: 0,
        reopenedCount: 0,
        issuesCreated: prior.issuesCreated || {},
        error: true,
      };
    }
  }

  const finalState = applyResult
    ? { ...nextState, issuesCreated: applyResult.issuesCreated }
    : nextState;

  const reportPath = writeReport(cwd, {
    state: finalState,
    criteria: ALL_CRITERIA,
    sources: SOURCES,
    computation,
    diff,
    hollowCriteria,
    unverifiableCriteria,
    origins,
  });

  /* ── State write policy (#5852 AC9) ──────────────────────────
   * `gh` unavailable  → read-only: never write state, never touch the badge.
   * `gh` available    → write only when something significant changed (or
   *                      the prior run is old enough to need a heartbeat);
   *                      otherwise leave state.json and the badge untouched.
   * report.md (above) is gitignored and always regenerated regardless — it
   * costs nothing to keep fresh locally. ── */
  let badgeOutcome = "skipped";
  let stateWriteOutcome;
  if (!ghAvailable) {
    stateWriteOutcome = "read-only: gh unavailable";
  } else if (shouldWriteState(prior, finalState)) {
    await saveState(cwd, finalState);
    if (BADGE) badgeOutcome = updateBadge(cwd, computation.level, finalState);
    stateWriteOutcome = "written";
  } else {
    stateWriteOutcome = "no significant change since last run — state not rewritten";
  }

  /* ── Console summary ─────────────────────────────────────── */
  console.log("");
  const levelDisplay = `${computation.level} (${computation.levelName})`;
  console.log(
    `ACMM Level ${levelDisplay}  ·  ${detectedCount}/${totalCount} criteria detected (${unverifiableIds.size} unverifiable)`
  );
  if (computation.capped) {
    console.log(
      `  ⚠ Capped from computed L${computation.computedLevel} → L${computation.level} (levelCap in state.json)`
    );
  }
  console.log(`Role: ${computation.role}`);

  if (diff) {
    const arrow = diff.levelDelta > 0 ? "↑" : diff.levelDelta < 0 ? "↓" : null;
    const countArrow =
      diff.countDelta > 0
        ? `+${diff.countDelta}`
        : diff.countDelta < 0
          ? `${diff.countDelta}`
          : "±0";
    const levelStr = arrow
      ? `L${diff.priorLevel} ${arrow} L${computation.level}`
      : `L${computation.level} (unchanged)`;
    console.log("");
    console.log(
      `Since last run: ${levelStr}  ·  ${diff.priorCount} → ${detectedCount} detected (${countArrow})`
    );
    if (diff.removed.length > 0) {
      console.log(
        `  - ${diff.removed.length} regressed: ${diff.removed.slice(0, 4).join(", ")}${diff.removed.length > 4 ? `, … (+${diff.removed.length - 4} more)` : ""}`
      );
    }
    if (diff.added.length > 0) {
      console.log(
        `  + ${diff.added.length} newly detected: ${diff.added.slice(0, 4).join(", ")}${diff.added.length > 4 ? `, … (+${diff.added.length - 4} more)` : ""}`
      );
    }
    if (diff.added.length === 0 && diff.removed.length === 0) {
      console.log(`  · no criteria changed`);
    }
  }
  console.log("");
  console.log("Per-level detection (scannable), margin = detected - ceil(0.7 × required):");
  for (const n of [2, 3, 4, 5, 6]) {
    const req = computation.requiredByLevel[n] ?? 0;
    const det = computation.detectedByLevel[n] ?? 0;
    const pct = req > 0 ? Math.round((det / req) * 100) : 0;
    const passed = pct >= 70 || (n === 2 && det >= 1);
    const mark = computation.level >= n ? "✓" : passed ? "·" : " ";
    const margin = computation.marginByLevel?.[n];
    const marginNote =
      margin === undefined ? "" : margin <= 1 ? `  ⚠ margin ${margin}` : `  margin ${margin}`;
    console.log(`  ${mark} L${n}: ${det}/${req} (${pct}%)${marginNote}`);
  }
  console.log("");
  console.log(
    `Prerequisites (soft): ${computation.prerequisites.met}/${computation.prerequisites.total}`
  );
  console.log(
    `Cross-cutting learning: ${computation.crossCutting.learning.met}/${computation.crossCutting.learning.total}`
  );
  console.log(
    `Cross-cutting traceability: ${computation.crossCutting.traceability.met}/${computation.crossCutting.traceability.total}`
  );

  const substEntries = Object.values(substanceResults).filter((s) => s.substantive !== null);
  const substChecked = substEntries.length;
  const substPassed = substEntries.filter((s) => s.substantive === true).length;
  const substFailed = substEntries.filter((s) => s.substantive === false).length;
  if (substChecked > 0) {
    console.log(
      `Substance (Tier 2): ${substPassed}/${substChecked} substantive${substFailed > 0 ? ` (${substFailed} partially met)` : ""}`
    );
    for (const [id, sub] of Object.entries(substanceResults)) {
      if (sub.substantive === false) {
        console.log(`  ◐ ${id}: ${sub.substanceEvidence}`);
      }
    }
    console.log("");
  }

  if (hollowCriteria.length > 0) {
    console.log(`Hollow (detected but substance failed — ${hollowCriteria.length}):`);
    for (const h of hollowCriteria) {
      console.log(`  ◐ ${h.id}: ${h.substanceEvidence}`);
    }
    console.log("");
  }

  if (behavioral.flake) {
    const pct = (behavioral.flake.rate_30d * 100).toFixed(1);
    const n = behavioral.flake.sample_size;
    console.log(`Signal quality: CI flake rate ${pct}% (n=${n})`);
  } else {
    console.log("Signal quality: flake rate unavailable (gh CLI missing or no CI runs)");
  }

  if (behavioral.agent_pr) {
    const o = behavioral.agent_pr;
    if (o.insufficient_data) {
      console.log(`Agent PR outcomes: insufficient data (n=${o.sample_size})`);
    } else {
      const acc = (o.acceptance_rate_30d * 100).toFixed(0);
      const rev =
        o.revert_rate_30d == null
          ? "revert rate unverifiable"
          : `${(o.revert_rate_30d * 100).toFixed(0)}% reverted`;
      const ttm = o.median_time_to_merge_hours.toFixed(1);
      const htr =
        o.human_touch_ratio != null
          ? `${(o.human_touch_ratio * 100).toFixed(0)}% human-touched`
          : "human-touch unverifiable";
      console.log(
        `Agent PR outcomes: ${acc}% accepted · ${rev} · ${ttm}h median time-to-merge · ${htr} (n=${o.sample_size})`
      );
    }
  } else {
    console.log("Agent PR outcomes: unavailable (gh CLI missing or no PRs)");
  }

  console.log(formatEvalsLine(behavioral.evals, { windowDays: evalsSummary.windowDays }));

  // Age of every behavioral input, printed regardless of gate outcome, so a
  // stale carried-forward reading (#5852 AC3) is visible even though
  // computeBehavioral above already treats it as missing. One call site
  // (review item 8) instead of up to six — the antipattern ratchet counts
  // `console.log(` occurrences in source, not runtime invocations.
  const freshnessLines = [
    "",
    "Behavioral input freshness:",
    `  ${describeBehavioralAge("flake", behavioral.flake)}`,
    `  ${describeBehavioralAge("agent_pr", behavioral.agent_pr)}`,
    `  ${describeBehavioralAge("auto_qa_tuning", behavioral.auto_qa_tuning)}`,
  ];
  if (flake?.oldest_record_at) {
    freshnessLines.push(`  flake: oldest record covered ${flake.oldest_record_at.slice(0, 10)}`);
  }
  if (prOutcomes?.oldest_record_at) {
    freshnessLines.push(
      `  agent_pr: oldest record covered ${prOutcomes.oldest_record_at.slice(0, 10)}`
    );
  }
  console.log(freshnessLines.join("\n"));

  console.log("");
  console.log(
    `Behavioral gates${STRICT ? " (strict — failures cap level)" : " (soft — failures are warnings)"}:`
  );
  for (const gate of computation.behavioralGates) {
    console.log(formatBehavioralGateLine(gate, STRICT));
  }

  if (computation.nextTransitionTrigger) {
    console.log("");
    console.log(`Next: ${computation.nextTransitionTrigger}`);
    console.log(`Missing for next level (${computation.missingForNextLevel.length}):`);
    for (const c of computation.missingForNextLevel.slice(0, 6)) {
      console.log(`  • ${c.id} — ${c.name}`);
    }
    if (computation.missingForNextLevel.length > 6) {
      console.log(`  … ${computation.missingForNextLevel.length - 6} more`);
    }
  }

  console.log("");
  console.log(`report: ${reportPath}\nstate:  ${stateWriteOutcome}`);
  if (BADGE) console.log(`badge:  ${badgeOutcome}`);
  if (APPLY && applyResult) {
    console.log(
      `issues: created ${applyResult.createdCount}, skipped-open ${applyResult.skippedOpen}, reopened ${applyResult.reopenedCount || 0}`
    );
  }
  if (!APPLY && computation.missingForNextLevel.length > 0) {
    console.log("");
    console.log(
      "Run with --apply to file GitHub issues for the next-level gaps (implement-queue will pick them up)."
    );
  }

  const durationMs = Date.now() - startedAt;
  console.log(`\ndone in ${durationMs}ms`);
}

// Only run main() when executed directly, not when imported by tests —
// importing must never shell out to `gh`/`git`, read repo state, or write
// files (#5852; same pattern as auto-qa-tune.js). Resolved through
// realpath (review item 7) so a symlinked or `/tmp`-relative invocation
// still runs main() instead of silently no-oping.
if (isEntryPoint(process.argv[1], import.meta.url)) {
  await main();
}
