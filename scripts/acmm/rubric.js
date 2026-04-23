/**
 * ACMM (AI Codebase Maturity Model) rubric — 36 checks across 4 dimensions × 5 levels.
 *
 * Inspired by https://github.com/ossf/scorecard/issues/5021 and the 4 dimensions the
 * outreach issue names: instruction files, measurement workflows, feedback loops,
 * gating policies. The canonical rubric isn't publicly fetchable — these checks are
 * our local interpretation.
 *
 * A repo is at Level N iff every check at L1..N passes. Strict passing — any L4
 * failure caps the score at L3 even with every L5 check green.
 */

/**
 * @typedef {"Instructions" | "Measurement" | "Feedback" | "Gating"} Dimension
 * @typedef {1 | 2 | 3 | 4 | 5} Level
 *
 * @typedef {Object} CheckMeta
 * @property {string} id         Stable ID in the form `${dimensionPrefix}${level}.${n}` (e.g. "I3.1").
 * @property {Dimension} dimension
 * @property {Level} level
 * @property {string} description  Short human-readable check name.
 * @property {string} remedy       How to fix this if it fails. Becomes the issue body.
 */

/** @type {CheckMeta[]} */
export const CHECKS = [
  // ── L1: Initial ───────────────────────────────────────────
  { id: "I1.1", dimension: "Instructions", level: 1, description: "README.md exists",
    remedy: "Add a `README.md` at the repo root with project purpose + how to run locally." },
  { id: "I1.2", dimension: "Instructions", level: 1, description: "Any AI instruction file exists (CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules)",
    remedy: "Add one AI-assistant instructions file at the repo root. `CLAUDE.md` or `AGENTS.md` is conventional." },
  { id: "M1.1", dimension: "Measurement", level: 1, description: "Any test file pattern (**/*.test.*, **/*.spec.*, tests/)",
    remedy: "Add at least one test file. Even a single `hello.test.ts` is enough to cross L1." },
  { id: "F1.1", dimension: "Feedback", level: 1, description: "Git history is non-trivial (≥10 commits)",
    remedy: "This usually clears itself. If the repo is newly initialized, commit real work." },
  { id: "G1.1", dimension: "Gating", level: 1, description: ".gitignore exists",
    remedy: "Add a `.gitignore` appropriate to the stack (ignore `node_modules/`, build output, env files, etc.)." },

  // ── L2: Managed ───────────────────────────────────────────
  { id: "I2.1", dimension: "Instructions", level: 2, description: "Root CLAUDE.md has project-specific content (>500 chars, not a template)",
    remedy: "Flesh out root `CLAUDE.md` past 500 chars with project context: tech stack, commands, conventions. Empty templates don't count." },
  { id: "I2.2", dimension: "Instructions", level: 2, description: "README references AI workflow or agents",
    remedy: "Add a section to `README.md` pointing at `CLAUDE.md` / `AGENTS.md` or explaining how AI agents are used." },
  { id: "M2.1", dimension: "Measurement", level: 2, description: "package.json scripts include test AND typecheck AND lint",
    remedy: "Add scripts for all three: `test`, `typecheck`, `lint`. Each should exit non-zero on failure." },
  { id: "F2.1", dimension: "Feedback", level: 2, description: ".github/workflows/ OR a pre-commit hook config exists",
    remedy: "Add either a GitHub Actions workflow or a pre-commit hook (husky/lefthook/pre-commit) so checks run automatically." },
  { id: "G2.1", dimension: "Gating", level: 2, description: "Linter config present (eslint / biome / ruff)",
    remedy: "Add a linter config: `eslint.config.*`, `.eslintrc*`, `biome.json`, or `ruff.toml`." },
  { id: "G2.2", dimension: "Gating", level: 2, description: "Pre-commit hook wired (.husky/ or equivalent)",
    remedy: "Wire a pre-commit hook via husky, lefthook, or `.pre-commit-config.yaml`." },

  // ── L3: Defined ───────────────────────────────────────────
  { id: "I3.1", dimension: "Instructions", level: 3, description: "Per-package/service CLAUDE.md files (≥3 across packages/ services/ apps/)",
    remedy: "Add scoped `CLAUDE.md` files in the top 3+ packages/services so AI has local context when editing inside them." },
  { id: "I3.2", dimension: "Instructions", level: 3, description: "ADR directory with ≥1 decision",
    remedy: "Create `docs/adr/` (or `docs/decisions/`) with at least one architectural decision record." },
  { id: "I3.3", dimension: "Instructions", level: 3, description: "≥3 skills or agents in .claude/",
    remedy: "Add skills at `.claude/skills/<name>/SKILL.md` or agents at `.claude/agents/<name>.md`. Aim for 3+." },
  { id: "M3.1", dimension: "Measurement", level: 3, description: "Separate lint / typecheck / test scripts in package.json",
    remedy: "Split CI-gated commands into distinct scripts so each can be run independently." },
  { id: "F3.1", dimension: "Feedback", level: 3, description: "Pre-commit runs multiple gates (lint + typecheck OR test)",
    remedy: "Extend the pre-commit hook to run at least two of {lint, typecheck, test}." },
  { id: "F3.2", dimension: "Feedback", level: 3, description: ".github/PULL_REQUEST_TEMPLATE.md exists",
    remedy: "Add `.github/PULL_REQUEST_TEMPLATE.md` with a summary + test plan checklist." },
  { id: "G3.1", dimension: "Gating", level: 3, description: "CODEOWNERS file exists",
    remedy: "Add `.github/CODEOWNERS` (or `CODEOWNERS` at root) mapping paths to owners." },
  { id: "G3.2", dimension: "Gating", level: 3, description: "ADR enforcement script (scripts/check-adr* or equivalent)",
    remedy: "Add a pre-commit/CI script that validates ADRs — syntax, numbering, status enum." },

  // ── L4: Measured ──────────────────────────────────────────
  { id: "I4.1", dimension: "Instructions", level: 4, description: "AI reference index (llms.txt / llms-full.txt / AGENTS.md index)",
    remedy: "Generate `llms.txt` (condensed) and/or `llms-full.txt` (full). Lists all public APIs + examples for LLM consumption." },
  { id: "I4.2", dimension: "Instructions", level: 4, description: "≥5 skills or agents (ecosystem, not toy)",
    remedy: "Grow the skill/agent set to at least 5. Indicates AI workflows are a real part of how the repo ships, not a demo." },
  { id: "M4.1", dimension: "Measurement", level: 4, description: "Scheduled metrics loop (progress-tracker skill or cron)",
    remedy: "Add a scheduled skill/job that computes repo/agent metrics on a cadence. See `.claude/skills/progress-tracker/` for a reference shape." },
  { id: "M4.2", dimension: "Measurement", level: 4, description: "Persistent metrics log (.claude/improvement-loop/log.md or equivalent)",
    remedy: "Append metrics to a dated log file so trends can be observed, not just spot-checked." },
  { id: "M4.3", dimension: "Measurement", level: 4, description: "Agent spend tracking (log file or a spend-logging script)",
    remedy: "Track agent cost per run (e.g. JSONL at `.claude/agent-spend.jsonl` with {runId, cost, date}) or commit a script (e.g. `scripts/log-agent-cost.js`) that materializes the log at runtime. Enables per-issue ROI + budget alerts." },
  { id: "F4.1", dimension: "Feedback", level: 4, description: "Automated issue→PR loop (issue-worker skill or equivalent)",
    remedy: "Add a skill/job that picks up `ready` issues and dispatches an agent to resolve them. Closes the loop." },
  { id: "F4.2", dimension: "Feedback", level: 4, description: "Scheduled audits (RemoteTriggers OR GitHub workflow schedule)",
    remedy: "Add a `schedule:` entry to a workflow OR configure a RemoteTrigger so audits run without human invocation." },
  { id: "G4.1", dimension: "Gating", level: 4, description: "Destructive-op check script (scripts/check-destructive-* or similar)",
    remedy: "Add a check that flags destructive SQL / config / infra operations and requires explicit approval markers." },
  { id: "G4.2", dimension: "Gating", level: 4, description: "ADR compliance enforced in pre-commit AND CI (not one or the other)",
    remedy: "Wire the ADR check into both `.husky/pre-commit` AND a GitHub workflow, so bypass via `--no-verify` still gets caught." },

  // ── L5: Optimizing ────────────────────────────────────────
  { id: "I5.1", dimension: "Instructions", level: 5, description: "Meta-documentation: root CLAUDE.md explains the agent/ship loop itself",
    remedy: "Document the AI workflow IN `CLAUDE.md` — which skills run when, label state machine, how to add a new audit. Meta-reflective." },
  { id: "M5.1", dimension: "Measurement", level: 5, description: "Metrics log has ≥6 consecutive weekly entries (sustained)",
    remedy: "Keep running the scheduled metrics loop; this check clears itself once the log has enough history." },
  { id: "M5.2", dimension: "Measurement", level: 5, description: "LLM observability wired (Langfuse / OpenTelemetry to agent runs)",
    remedy: "Wire agent runs to Langfuse or an OTel collector so traces/generations/costs are observable, not just logged locally." },
  { id: "F5.1", dimension: "Feedback", level: 5, description: "Meta-improvement loop creates `meta-improvement`-labeled issues",
    remedy: "Extend the metrics loop to detect recurring patterns and file `meta-improvement` issues for process gaps." },
  { id: "F5.2", dimension: "Feedback", level: 5, description: "Circuit breaker / self-tuning in agent loop (documented in a skill)",
    remedy: "Add a circuit breaker that pauses the agent loop when failure rate exceeds a threshold. Document it in the relevant skill." },
  { id: "F5.3", dimension: "Feedback", level: 5, description: "Auto-recovery for agent-failed issues (documented)",
    remedy: "Document (and implement) how `agent-failed` issues get re-queued. E.g. retry stale failures up to N times automatically." },
  { id: "G5.1", dimension: "Gating", level: 5, description: "Reviewer agents or automated PR review configured",
    remedy: "Add an automated PR reviewer — either a GitHub Action or a code-reviewer agent wired into the PR flow." },
  { id: "G5.2", dimension: "Gating", level: 5, description: "Regression gate — failing tests block merge",
    remedy: "Configure branch protection to require the test job to pass before merge. (If CI is unpaid/disabled, document the local gate.)" },
];

/**
 * Group checks by dimension for reporting.
 * @param {CheckMeta[]} checks
 * @returns {Record<Dimension, CheckMeta[]>}
 */
export function byDimension(checks = CHECKS) {
  /** @type {Record<Dimension, CheckMeta[]>} */
  const out = { Instructions: [], Measurement: [], Feedback: [], Gating: [] };
  for (const c of checks) out[c.dimension].push(c);
  return out;
}

/** Given per-check pass/fail, compute the overall achieved level. */
/**
 * @param {Record<string, boolean>} passed  Map of checkId → passed.
 * @param {CheckMeta[]} checks
 * @returns {Level | 0}  0 if even L1 has a failure.
 */
export function computeLevel(passed, checks = CHECKS) {
  /** @type {Level[]} */
  const levels = [1, 2, 3, 4, 5];
  let achieved = 0;
  for (const L of levels) {
    const levelChecks = checks.filter((c) => c.level === L);
    const allPassed = levelChecks.every((c) => passed[c.id] === true);
    if (!allPassed) break;
    achieved = L;
  }
  return /** @type {Level | 0} */ (achieved);
}
