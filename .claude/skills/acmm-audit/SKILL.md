---
name: acmm-audit
description: "Audit this repo against the AI Codebase Maturity Model (ACMM). Scores the repo across 4 dimensions (instruction files, measurement workflows, feedback loops, gating policies) × 5 levels, writes a report to .claude/acmm/, and optionally files GitHub issues for gaps. Invoke with /acmm-audit [--apply] [--badge] [--trend]."
user-invocable: true
---

# ACMM Audit

Inspired by [ossf/scorecard#5021](https://github.com/ossf/scorecard/issues/5021) — an AI Codebase Maturity Model that scores how AI-operable a repo is. Fills the gap between `/site-audit` (UX/code health) and `/progress-tracker` (loop metrics): ACMM evaluates the **meta-properties** of the repo — do we have the instructions, metrics, loops, and gates in place to be AI-driven?

## Invocation

```bash
# Dry run — scores the repo, writes report, creates nothing
node scripts/acmm/audit.js

# Create deduplicated GitHub issues for each gap (fed to ship-loop)
node scripts/acmm/audit.js --apply

# Rewrite README badge between <!-- acmm:begin -->/<!-- acmm:end -->
node scripts/acmm/audit.js --badge

# Full run (scheduled trigger invokes this)
node scripts/acmm/audit.js --apply --badge

# Just print trend from .claude/acmm/state.json
node scripts/acmm/audit.js --trend
```

## What it does

1. Runs 36 checks in parallel (native `fs` + `git`; no network):
   - 4 dimensions × 5 levels = 20 slots, with 1–2 checks each.
   - Each check returns `{passed, evidence}` and has a fixed `remedy` string.
2. Strict level scoring: **Level N iff every check at L1..N passed**. One L3 failure caps at L2 even with L5 perfect.
3. Writes `.claude/acmm/state.json` (JSON) and `.claude/acmm/report.md` (human-readable).
4. With `--apply`, creates issues labelled `acmm` + `audit` + `ready` — dedupes via `state.issuesCreated[checkId]` so reruns don't spam. Ship-loop will pick them up.
5. With `--badge`, rewrites the README shields.io badge in place.

## The rubric (36 checks)

| Dimension | What it measures |
|---|---|
| **Instructions** | CLAUDE.md/AGENTS.md presence + depth, per-package scoped docs, skills/agents ecosystem, `llms.txt` reference index |
| **Measurement** | Test scripts, separate lint/typecheck/test commands, scheduled metrics loops, persistent metrics logs, agent-spend tracking, LLM observability |
| **Feedback** | Git history, CI or pre-commit hooks, multi-gate pre-commit, PR template, issue→PR loop, scheduled audits, meta-improvement loop, circuit breaker, auto-recovery |
| **Gating** | `.gitignore`, linter config, pre-commit wired, CODEOWNERS, ADR enforcement in pre-commit AND CI, destructive-op checks, reviewer agents, regression-gate tests |

Full rubric: `scripts/acmm/rubric.js`. Check logic: `scripts/acmm/checks.js`.

## Cadence

- **On-demand** — anytime via this skill.
- **Scheduled** — `mbe-acmm-audit` RemoteTrigger on claude.ai, Wed 10:00am PT, invocation: `node scripts/acmm/audit.js --apply --badge`. Staggered from the other audits (Mon 8:23 deep-audit, Tue–Sun 9:41 light-audit, daily 5:11pm progress-tracker) so they don't contend for the agent queue.

## Integration

- **GitHub label:** `acmm` (color `#d4a030` — matches `--rialto-accent` gold). Created on first `--apply` via `gh label create acmm --force`.
- **Ship-loop:** `acmm` issues carry `ready` + `audit`, so `/ship-loop`'s Phase-B dispatcher picks them up with the same prioritization as site-audit findings. Trivially fixable gaps (CODEOWNERS, PR template) tend to close in one agent turn.
- **Progress-tracker:** reads `.claude/acmm/state.json` history to surface level-over-time in its daily metrics log.

## Testing

```bash
node --test scripts/acmm/__tests__/
```

19 tests across rubric structural invariants + per-check fixture tests.

## Files

```
scripts/acmm/
  rubric.js                 36 check metadata + computeLevel + byDimension
  checks.js                 36 check runners (pure (cwd) → CheckResult)
  state.js                  load/save/recordHistory for .claude/acmm/state.json
  audit.js                  main entry (shebang, argv, orchestration)
  outputs/
    issues.js               gh CLI wrapper with dedup
    report.js               markdown renderer → .claude/acmm/report.md
    badge.js                README fence rewriter
  __tests__/
    rubric.test.js          structural invariants
    checks.test.js          fixture-based runner tests
.claude/acmm/               (generated)
  state.json                history + issuesCreated map
  report.md                 human-readable scorecard (overwritten each run)
```
