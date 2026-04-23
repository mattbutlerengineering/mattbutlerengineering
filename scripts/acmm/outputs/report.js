/**
 * Render the ACMM scorecard as a markdown report at `.claude/acmm/report.md`.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { byDimension } from "../rubric.js";

/**
 * @param {string} cwd
 * @param {Object} args
 * @param {import("../state.js").State} args.state
 * @param {import("../rubric.js").CheckMeta[]} args.checks
 */
export function writeReport(cwd, { state, checks }) {
  const passed = Object.entries(state.checks).filter(([, r]) => r.passed).length;
  const total = checks.length;
  const grouped = byDimension(checks);
  const date = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push(`# ACMM Scorecard — Level ${state.currentLevel}`);
  lines.push("");
  lines.push(`_Generated ${date} · ${passed}/${total} checks passing._`);
  lines.push("");
  lines.push(
    "Rubric inspired by the 4 dimensions named in [ossf/scorecard#5021](https://github.com/ossf/scorecard/issues/5021). See `.claude/skills/acmm-audit/SKILL.md` for details.",
  );
  lines.push("");

  // Dimension summary
  lines.push("## Summary by dimension");
  lines.push("");
  lines.push("| Dimension | Passed | Next gap |");
  lines.push("|---|---|---|");
  for (const [dim, dimChecks] of Object.entries(grouped)) {
    const dimPassed = dimChecks.filter((c) => state.checks[c.id]?.passed).length;
    const nextGap = dimChecks.find((c) => !state.checks[c.id]?.passed);
    lines.push(`| ${dim} | ${dimPassed} / ${dimChecks.length} | ${nextGap ? `${nextGap.id} — ${nextGap.description}` : "—"} |`);
  }
  lines.push("");

  // Per-level section
  for (const level of [1, 2, 3, 4, 5]) {
    const levelChecks = checks.filter((c) => c.level === level);
    const levelPassed = levelChecks.filter((c) => state.checks[c.id]?.passed).length;
    const status = levelPassed === levelChecks.length ? "✓ complete" : "✗ gaps";
    lines.push(`## Level ${level} — ${status} (${levelPassed}/${levelChecks.length})`);
    lines.push("");
    for (const c of levelChecks) {
      const r = state.checks[c.id];
      const mark = r?.passed ? "✓" : "✗";
      lines.push(`- **${mark} ${c.id}** \`${c.dimension}\` — ${c.description}`);
      lines.push(`  _Evidence:_ ${r?.evidence ?? "(not evaluated)"}`);
      if (!r?.passed) {
        lines.push(`  _Remedy:_ ${c.remedy}`);
      }
    }
    lines.push("");
  }

  // Trend footer
  if (state.history.length > 0) {
    lines.push("## Trend");
    lines.push("");
    lines.push("| Date | Level | Passed |");
    lines.push("|---|---|---|");
    for (const h of state.history.slice(-10)) {
      lines.push(`| ${h.date} | L${h.level} | ${h.passed}/${h.total} |`);
    }
    lines.push("");
  }

  const out = join(cwd, ".claude/acmm/report.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf-8");
  return out;
}
