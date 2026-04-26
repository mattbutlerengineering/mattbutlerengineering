/**
 * Render the canonical ACMM scorecard as a markdown report at
 * `.claude/acmm/report.md`.
 *
 * Layout:
 *   1. Score header (level, role, anti-pattern)
 *   2. Per-level threshold table
 *   3. Per-source summary (citations to ACMM / Fullsend / AEF / Reflect)
 *   4. Detected/missing breakdown grouped by level
 *   5. Cross-cutting overlay (learning, traceability)
 *   6. Trend table
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { loadLatestColdStart, scoreColdStart } from "../cold-start.js";

/**
 * @param {string} cwd
 * @param {Object} args
 * @param {import("../state.js").State} args.state
 * @param {Array<import("../sources/types.js").Criterion>} args.criteria
 * @param {Array<import("../sources/types.js").Source>} args.sources
 * @param {import("../computeLevel.js").LevelComputation} args.computation
 * @param {{added: string[], removed: string[], levelDelta: number, countDelta: number, priorLevel: number, priorCount: number} | null} [args.diff]
 */
export function writeReport(cwd, { state, criteria, sources, computation, diff }) {
  const detectedSet = new Set(state.detectedIds ?? []);
  const date = new Date().toISOString().slice(0, 10);
  const coldStart = loadLatestColdStart(cwd);

  const lines = [];

  // ── Header ────────────────────────────────────────────────
  lines.push(`# ACMM Scorecard — Level ${computation.level} · ${computation.levelName}`);
  lines.push("");
  lines.push(
    `_Generated ${date} · ${detectedSet.size}/${criteria.length} criteria detected · role: **${computation.role}**_`,
  );
  lines.push("");
  lines.push(
    `Canonical 6-level model ported from [kubestellar/console](https://github.com/kubestellar/console/tree/main/web/src/lib/acmm/sources). Cited from four source frameworks: ACMM, Fullsend, Agentic Engineering Framework, Claude Reflect. See [arXiv:2604.09388](https://arxiv.org/abs/2604.09388).`,
  );
  lines.push("");

  if (computation.antiPattern) {
    lines.push(`> **Anti-pattern at this level:** ${computation.antiPattern}`);
    lines.push("");
  }
  if (computation.nextTransitionTrigger) {
    lines.push(`> **Next transition trigger:** ${computation.nextTransitionTrigger}`);
    lines.push("");
  }

  // ── Since-last-run diff (loop signal) ─────────────────────
  if (diff) {
    const arrow = diff.levelDelta > 0 ? "↑" : diff.levelDelta < 0 ? "↓" : null;
    const countSign = diff.countDelta > 0 ? `+${diff.countDelta}` : diff.countDelta < 0 ? `${diff.countDelta}` : "±0";
    const detected = state.detectedIds?.length ?? 0;
    const levelStr = arrow ? `L${diff.priorLevel} ${arrow} L${computation.level}` : `L${computation.level} (unchanged)`;
    const headline = diff.levelDelta === 0 && diff.added.length === 0 && diff.removed.length === 0
      ? `**Since last run:** no change (still L${computation.level}, ${detected} detected).`
      : `**Since last run:** ${levelStr} · ${diff.priorCount} → ${detected} detected (${countSign}).`;
    lines.push(`## Since last run`);
    lines.push("");
    lines.push(headline);
    lines.push("");
    if (diff.added.length > 0) {
      lines.push(`**Newly detected (+${diff.added.length}):** ${diff.added.map((id) => `\`${id}\``).join(", ")}`);
      lines.push("");
    }
    if (diff.removed.length > 0) {
      lines.push(`**Regressed (-${diff.removed.length}):** ${diff.removed.map((id) => `\`${id}\``).join(", ")}`);
      lines.push("");
    }
  }

  // ── Next steps (top of report — most actionable first) ────
  if (computation.missingForNextLevel.length > 0) {
    const nextLevel = computation.level + 1;
    const det = computation.detectedByLevel[nextLevel] ?? 0;
    const req = computation.requiredByLevel[nextLevel] ?? 0;
    const needToClose = Math.max(0, Math.ceil(req * 0.7) - det);
    lines.push(`## Next steps — close ${needToClose} of ${computation.missingForNextLevel.length} L${nextLevel} gap${computation.missingForNextLevel.length === 1 ? "" : "s"}`);
    lines.push("");
    lines.push(`Each line below is a concrete remediation hint derived from the criterion's detection paths. The cheapest path to L${nextLevel} is to satisfy the ${needToClose} cheapest items.`);
    lines.push("");
    for (const c of computation.missingForNextLevel) {
      const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
      const fixHint = remediationHint(patterns);
      lines.push(`- **\`${c.id}\`** — ${c.name}`);
      lines.push(`  → ${fixHint}`);
    }
    lines.push("");
  }

  // ── Per-level threshold table ─────────────────────────────
  lines.push("## Per-level threshold");
  lines.push("");
  lines.push("Each level needs ≥70% of its scannable criteria detected (L2 needs only 1).");
  lines.push("");
  lines.push("| Level | Detected | Required | % | Passed |");
  lines.push("|---|---|---|---|---|");
  for (const n of [2, 3, 4, 5, 6]) {
    const det = computation.detectedByLevel[n] ?? 0;
    const req = computation.requiredByLevel[n] ?? 0;
    const pct = req > 0 ? Math.round((det / req) * 100) : 0;
    const passed = computation.level >= n ? "✅" : "❌";
    lines.push(`| L${n} | ${det} | ${req} | ${pct}% | ${passed} |`);
  }
  lines.push("");
  lines.push(`Prerequisites (L0, soft indicator): **${computation.prerequisites.met}/${computation.prerequisites.total}**`);
  lines.push("");

  // ── Per-source summary ────────────────────────────────────
  lines.push("## By source framework");
  lines.push("");
  lines.push("| Source | Detected | Total | Citation |");
  lines.push("|---|---|---|---|");
  for (const src of sources) {
    const total = src.criteria.length;
    const det = src.criteria.filter((c) => detectedSet.has(c.id)).length;
    lines.push(`| [${src.name}](${src.url}) | ${det} | ${total} | ${src.citation} |`);
  }
  lines.push("");

  // ── Signal quality (behavioral, beyond path-existence) ───
  const flake = state.behavioral?.flake;
  if (flake) {
    const pct = (flake.rate_30d * 100).toFixed(1);
    const n = flake.sample_size;
    const icon = n < 5 ? "·" : flake.rate_30d < 0.01 ? "✅" : flake.rate_30d <= 0.05 ? "⚠️" : "❌";
    const note = n < 5 ? " (insufficient data)" : "";
    lines.push("## Signal quality");
    lines.push("");
    lines.push(`- **${icon} CI flake rate (30d):** ${pct}% (n=${n})${note}`);
    lines.push("");
    lines.push("_A flake = same commit produced both ✅ and ❌ on different runs. Healthy: <1%, watch: 1–5%, broken: >5%._");
    lines.push("");
  }

  // ── Agent PR outcomes (behavioral) ────────────────────────
  const apr = state.behavioral?.agent_pr;
  if (apr) {
    lines.push("## Agent PR outcomes (last 30 days)");
    lines.push("");
    if (apr.insufficient_data) {
      lines.push(`_Insufficient data: only ${apr.sample_size} agent PR${apr.sample_size === 1 ? "" : "s"} in window. Metrics will appear once n ≥ 5._`);
    } else {
      const acc = (apr.acceptance_rate_30d * 100).toFixed(0);
      const rev = (apr.revert_rate_30d * 100).toFixed(0);
      const ttm = apr.median_time_to_merge_hours.toFixed(1);
      const htr = (apr.human_touch_ratio * 100).toFixed(0);
      const accIcon = apr.acceptance_rate_30d >= 0.8 ? "✅" : apr.acceptance_rate_30d >= 0.5 ? "⚠️" : "❌";
      const revIcon = apr.revert_rate_30d <= 0.05 ? "✅" : apr.revert_rate_30d <= 0.15 ? "⚠️" : "❌";
      lines.push(`- **${accIcon} Acceptance rate:** ${acc}% (${apr.merged_count} merged of ${apr.merged_count + apr.closed_unmerged_count} decided)`);
      lines.push(`- **${revIcon} Revert rate:** ${rev}% within 7 days of merge`);
      lines.push(`- **Median time-to-merge:** ${ttm}h`);
      lines.push(`- **Human-touch ratio:** ${htr}% of merged PRs had non-author commits`);
      lines.push(`- **Sample:** ${apr.sample_size} agent PR${apr.sample_size === 1 ? "" : "s"} (${apr.open_count} still open)`);
    }
    lines.push("");
    lines.push("_Agent PR detection: branch starts with `agent-`/`worktree-agent-`/`fix/agent-`/`feat/agent-`, or has `has-pr` label._");
    lines.push("");
  }

  // ── Agent evals (behavioral, frozen task suite) ──────────
  const evals = state.behavioral?.evals;
  if (evals) {
    const icon = evals.status === "green" ? "✅" : evals.status === "yellow" ? "⚠️" : evals.status === "red" ? "❌" : "·";
    const pct = (evals.passRate * 100).toFixed(0);
    lines.push("## Agent evals (last 30 days)");
    lines.push("");
    if (evals.status === "unknown") {
      lines.push(`_Insufficient data: only ${evals.n} run${evals.n === 1 ? "" : "s"} in window. Status appears once n ≥ 3._`);
    } else {
      lines.push(`- **${icon} Pass rate:** ${pct}% (n=${evals.n})`);
      lines.push(`- **Median score:** ${evals.medianScore.toFixed(2)} of 1.00`);
      if (evals.medianCostUsd !== null) lines.push(`- **Median cost:** $${evals.medianCostUsd.toFixed(2)} per run`);
      if (evals.medianTurns !== null) lines.push(`- **Median turns:** ${evals.medianTurns}`);
      if (Object.keys(evals.perModel ?? {}).length > 1) {
        lines.push("");
        lines.push("By model:");
        for (const [model, m] of Object.entries(evals.perModel)) {
          lines.push(`- \`${model}\`: ${(m.passRate * 100).toFixed(0)}% (n=${m.n}, score ${m.medianScore.toFixed(2)})`);
        }
      }
    }
    lines.push("");
    lines.push("_Frozen task fixtures under `scripts/acmm/evals/tasks/`. Status: ≥80% pass = green, ≥50% = yellow, else red. Add tasks or run via `node scripts/acmm/evals/index.js`._");
    lines.push("");
  }

  // ── Cold start (behavioral, last weekly measurement) ─────
  if (coldStart) {
    const score = scoreColdStart(coldStart);
    const icon = { healthy: "✅", watch: "⚠️", broken: "❌", unknown: "·" }[score];
    const measured = coldStart.ts ? coldStart.ts.slice(0, 10) : "unknown date";
    lines.push("## Cold start");
    lines.push("");
    lines.push(`_Last measured ${measured}${coldStart.commit ? ` at \`${coldStart.commit.slice(0, 7)}\`` : ""}._`);
    lines.push("");
    lines.push(`- **${icon} Total:** ${formatSeconds(coldStart.total_seconds)} (clone → green tests)`);
    lines.push(`  - install: ${formatSeconds(coldStart.install_seconds)}`);
    lines.push(`  - test: ${formatSeconds(coldStart.test_seconds)} ${coldStart.test_passed ? "✓" : "✗ FAILED"}`);
    lines.push("");
    lines.push("_Healthy: <5min · Watch: 5–15min · Broken: >15min or test failed. Measured weekly on a clean GitHub Actions runner with no caches._");
    lines.push("");
  }

  // ── Cross-cutting overlay ─────────────────────────────────
  lines.push("## Cross-cutting overlay");
  lines.push("");
  lines.push(
    `- **Learning & feedback:** ${computation.crossCutting.learning.met}/${computation.crossCutting.learning.total}`,
  );
  lines.push(
    `- **Traceability & audit:** ${computation.crossCutting.traceability.met}/${computation.crossCutting.traceability.total}`,
  );
  lines.push("");

  // ── Per-level criteria detail ─────────────────────────────
  for (const level of [0, 2, 3, 4, 5, 6]) {
    const levelCriteria = criteria.filter((c) => c.level === level);
    if (levelCriteria.length === 0) continue;
    const det = levelCriteria.filter((c) => detectedSet.has(c.id)).length;
    const status =
      level === 0
        ? `(prerequisite, ${det}/${levelCriteria.length})`
        : computation.level >= level
          ? `✓ achieved (${det}/${levelCriteria.length})`
          : `✗ gaps (${det}/${levelCriteria.length})`;
    lines.push(`## Level ${level} ${status}`);
    lines.push("");
    for (const c of levelCriteria) {
      const mark = detectedSet.has(c.id) ? "✓" : "✗";
      const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
      lines.push(`- **${mark} \`${c.id}\`** \`${c.source}\` \`${c.category}\` — ${c.name}`);
      lines.push(`  _${c.description}_`);
      lines.push(`  Detection (${c.detection.type}): ${patterns.map((p) => `\`${p}\``).join(" · ")}`);
    }
    lines.push("");
  }

  // ── Missing-for-next-level (actionable) ───────────────────
  if (computation.missingForNextLevel.length > 0) {
    lines.push(`## Next-level gaps (${computation.missingForNextLevel.length})`);
    lines.push("");
    lines.push(`To advance from L${computation.level} → L${computation.level + 1}, close ≥70% of the criteria below.`);
    lines.push("");
    for (const c of computation.missingForNextLevel) {
      const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
      lines.push(`- **\`${c.id}\`** — ${c.name}`);
      lines.push(`  ${c.description}`);
      lines.push(`  _Detection:_ ${patterns.map((p) => `\`${p}\``).join(" · ")}`);
    }
    lines.push("");
  }

  // ── Trend ─────────────────────────────────────────────────
  if (state.history.length > 0) {
    lines.push("## Trend");
    lines.push("");
    lines.push("| Date | Level | Detected |");
    lines.push("|---|---|---|");
    for (const h of state.history.slice(-10)) {
      const det = h.detected ?? h.passed; // back-compat with old history shape
      const tot = h.total;
      lines.push(`| ${h.date} | L${h.level} | ${det}/${tot} |`);
    }
    lines.push("");
  }

  const out = join(cwd, ".claude/acmm/report.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf-8");
  return out;
}

/**
 * Derive a one-line remediation hint from a criterion's detection patterns.
 * The criterion passes if ANY listed path exists, so we suggest creating the
 * first (canonical) one.
 *
 * @param {string[]} patterns
 * @returns {string}
 */
function remediationHint(patterns) {
  const canonical = patterns[0];
  const isDir = canonical.endsWith("/");
  const action = isDir ? `mkdir -p ${canonical}` : `touch ${canonical}`;
  if (patterns.length === 1) return `\`${action}\``;
  return `\`${action}\` (or any of: ${patterns.slice(1).map((p) => `\`${p}\``).join(", ")})`;
}

/**
 * Format a duration in seconds as `Nm Ss` (or just `Ns` under a minute).
 * @param {number} seconds
 */
function formatSeconds(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}
