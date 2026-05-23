/**
 * Instruction evolver for the improvement flywheel.
 *
 * Runs on Friday learning-loop runs. Reads the week's process metrics
 * and threshold changes, detects recurring patterns (3+ occurrences),
 * and either auto-commits low-risk instruction updates or files
 * review-gated issues for high-risk changes.
 *
 * Usage:
 *   node scripts/instruction-evolver.mjs              # run evolution step
 *   node scripts/instruction-evolver.mjs --dry-run    # show what would change
 *   node scripts/instruction-evolver.mjs --force      # run even if not Friday
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const METRICS_PATH = resolve(ROOT, "metrics", "process-metrics.jsonl");
const THRESHOLD_CHANGES_PATH = resolve(ROOT, "metrics", "threshold-changes.jsonl");
const INSTRUCTION_CHANGES_PATH = resolve(ROOT, "metrics", "instruction-changes.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function recentEntries(entries, daysBack = 7) {
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return entries.filter((e) => {
    const ts = e.timestamp ?? e.date;
    return ts && new Date(ts) >= cutoff;
  });
}

export function detectPatterns(metrics, thresholdChanges) {
  const patterns = [];
  const recent = recentEntries(metrics);

  const highFpRuns = recent.filter((m) => m.fp_rate !== null && m.fp_rate > 30);
  if (highFpRuns.length >= 3) {
    patterns.push({
      type: "recurring-high-fp",
      count: highFpRuns.length,
      detail: `FP rate > 30% in ${highFpRuns.length} of last ${recent.length} runs`,
      suggestedChange: "gotcha",
      title: "High false positive rate persists",
      body: "Threshold loosening alone isn't fixing the FP rate. Detection rules may be too aggressive — review sensor thresholds and dedup logic.",
    });
  }

  const lowEffRuns = recent.filter(
    (m) => m.agent_success_rate !== null && m.agent_success_rate < 50
  );
  if (lowEffRuns.length >= 3) {
    patterns.push({
      type: "recurring-low-effectiveness",
      count: lowEffRuns.length,
      detail: `Agent success rate < 50% in ${lowEffRuns.length} of last ${recent.length} runs`,
      suggestedChange: "gotcha",
      title: "Agent effectiveness consistently low",
      body: "Agent success rate below 50% for 3+ runs. Check agent prompts, budget limits, or issue complexity routing.",
    });
  }

  const recentThresholds = recentEntries(thresholdChanges);
  const byThreshold = {};
  for (const c of recentThresholds) {
    const key = c.threshold;
    if (!key) continue;
    byThreshold[key] = byThreshold[key] ?? [];
    byThreshold[key].push(c);
  }

  for (const [name, changes] of Object.entries(byThreshold)) {
    if (changes.length < 3) continue;
    const directions = changes.map(
      (c) => c.direction ?? (c.newValue > c.oldValue ? "tighten" : "loosen")
    );
    const allSame = directions.every((d) => d === directions[0]);
    if (allSame) {
      patterns.push({
        type: "recurring-threshold-drift",
        count: changes.length,
        detail: `${name} adjusted ${directions[0]} ${changes.length}x this week`,
        suggestedChange: "threshold-note",
        title: `Threshold drift: ${name} keeps ${directions[0]}ing`,
        body: `${name} has been ${directions[0]}ed ${changes.length} times this week. This may indicate the underlying issue needs a different fix.`,
      });
    }
  }

  return patterns;
}

export function classifyRisk(changeType) {
  const lowRisk = ["gotcha", "threshold-note", "behavioral-evidence"];
  return lowRisk.includes(changeType) ? "low" : "high";
}

export function formatGotchaEntry(title, description) {
  return `- **${title}**: ${description}`;
}

export function logInstructionChange(logPath, entry) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    JSON.stringify({
      date: new Date().toISOString().split("T")[0],
      ...entry,
    }) + "\n"
  );
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const today = new Date();
  const isFriday = today.getDay() === 5;

  if (!isFriday && !FORCE) {
    console.log("instruction-evolver: not Friday, skipping (use --force to override)");
    return;
  }

  const metrics = loadJsonl(METRICS_PATH);
  const thresholdChanges = loadJsonl(THRESHOLD_CHANGES_PATH);

  if (metrics.length === 0 && thresholdChanges.length === 0) {
    console.log("instruction-evolver: no metrics or threshold data available, skipping");
    return;
  }

  const patterns = detectPatterns(metrics, thresholdChanges);

  if (patterns.length === 0) {
    console.log("instruction-evolver: no recurring patterns detected");
    return;
  }

  console.log(`instruction-evolver: ${patterns.length} pattern(s) detected`);

  for (const p of patterns) {
    const risk = classifyRisk(p.suggestedChange);

    if (DRY_RUN) {
      console.log(`  [${risk}] ${p.type}: ${p.detail}`);
      continue;
    }

    if (risk === "low") {
      console.log(`  auto-commit: ${p.title}`);
      logInstructionChange(INSTRUCTION_CHANGES_PATH, {
        file: ".claude/rules/gotchas.md",
        changeType: "append",
        pattern: p.type,
        evidence: p.detail,
      });
    } else {
      console.log(`  review-gated: ${p.title} (would file issue)`);
      logInstructionChange(INSTRUCTION_CHANGES_PATH, {
        file: "github-issue",
        changeType: "issue",
        pattern: p.type,
        evidence: p.detail,
      });
    }
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
