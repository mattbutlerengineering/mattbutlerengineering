---
name: acmm-audit
description: "Audit this repo against the AI Codebase Maturity Model (ACMM) — canonical 6-level rubric with 85 criteria from 4 source frameworks (ACMM, Fullsend, AEF, Reflect). Writes a report to .claude/acmm/, files GitHub issues for the next-level gaps, and rewrites the README badge. Invoke with /acmm-audit [--apply] [--badge] [--trend]."
user-invocable: true
---

# ACMM Audit

Canonical AI Codebase Maturity Model — scores how AI-operable a repo is on a 6-level scale (L1 Assisted → L6 Fully Autonomous). Fills the gap between `/site-audit` (UX/code health) and `/progress-tracker` (loop metrics): ACMM evaluates the **meta-properties** of the repo — do we have the instructions, metrics, loops, and gates in place to be AI-driven?

The criterion catalog is **ported verbatim** from [kubestellar/console](https://github.com/kubestellar/console/tree/main/web/src/lib/acmm/sources) — the reference implementation validated in the [arXiv paper (2604.09388)](https://arxiv.org/abs/2604.09388). 85 criteria total across 4 cited source frameworks.

## Invocation

```bash
# Dry run — scores the repo, writes report, creates nothing
node scripts/acmm/audit.js

# Create deduplicated GitHub issues for next-level gaps (fed to ship-loop)
node scripts/acmm/audit.js --apply

# Rewrite README badge between <!-- acmm:begin -->/<!-- acmm:end -->
node scripts/acmm/audit.js --badge

# Full run (scheduled trigger invokes this)
node scripts/acmm/audit.js --apply --badge

# Just print trend from .claude/acmm/state.json
node scripts/acmm/audit.js --trend
```

## What it does

1. Loads 85 criteria from `scripts/acmm/sources/{acmm,fullsend,agentic-engineering-framework,claude-reflect}.js`.
2. Runs file-presence detection on each (no network, native `fs` only):
   - `path` — single file or directory; trailing `/` requires a directory
   - `any-of` — array of paths; ANY match satisfies
   - `glob` — reserved (no canonical criterion uses it yet)
3. Computes the level via threshold walk: each level needs **≥70% of its scannable criteria** detected to advance (L2 needs only 1, since it's a single OR-group of agent-instruction files).
4. Writes `.claude/acmm/state.json` (full computation) and `.claude/acmm/report.md` (human-readable scorecard).
5. With `--apply`, files GitHub issues only for **next-level gaps** to avoid spam — dedupes via `state.issuesCreated[criterionId]`.
6. With `--badge`, rewrites the README shields.io badge in place.

## The 6 levels

| L | Name | Role | Characteristic |
|---|---|---|---|
| 1 | Assisted / Ad Hoc | Executor | AI used opportunistically; no project-specific config |
| 2 | Instructed | Rule-writer | AI receives project context through committed files |
| 3 | Measured / Enforced | Analyst | Rules mechanically enforced; AI loop instrumented |
| 4 | Adaptive / Structured | Governor | Workflows are structured and environment-aware |
| 5 | Semi-Automated | Operator | System detects + proposes; humans approve |
| 6 | Fully Autonomous | Strategist | System acts; humans audit after the fact |

L0 (Prerequisites) is a **soft indicator** — basic engineering hygiene (test suite, CI/CD, contributing guide, etc.) — not part of the threshold walk.

## Source frameworks

| Source | Criteria | Citation |
|---|---|---|
| **[ACMM](https://github.com/kubestellar/console)** | 65 | The 6-level model (L0 prereqs + L1–L6) |
| **[Fullsend](https://github.com/fullsend-ai/fullsend)** | 8 | Readiness + autonomy criteria (test coverage, CI/CD, auto-merge policy) |
| **[Agentic Engineering Framework](https://github.com/DimitriGeelen/agentic-engineering-framework)** | 6 | Governance criteria (task traceability, structural gates) |
| **[Claude Reflect](https://github.com/BayramAnnakov/claude-reflect)** | 6 | Self-tuning criteria (correction capture, CLAUDE.md auto-sync) |

## Categories

Criteria carry one of: `feedback-loop`, `readiness`, `autonomy`, `observability`, `governance`, `self-tuning`, `prerequisite`, `learning`, `traceability`. The cross-cutting overlay surfaces **learning & feedback** and **traceability & audit** counts independently of the level breakdown.

## Cadence

- **On-demand** — anytime via this skill.
- **Scheduled** — `mbe-acmm-audit` RemoteTrigger on claude.ai, daily 10:00am PT (cron `0 17 * * *` UTC), invocation: `node scripts/acmm/audit.js --apply --badge`. Staggered from the other audits (Mon 8:23 deep-audit, Tue–Sun 9:41 light-audit, daily 5:11pm progress-tracker) so they don't contend for the agent queue.

## Integration

- **GitHub label:** `acmm` (color `#d4a030` — matches `--rialto-accent` gold). Created on first `--apply` via `gh label create acmm --force`.
- **Ship-loop:** `acmm` issues carry `ready` + `audit`, so `/ship-loop`'s Phase-B dispatcher picks them up with the same prioritization as site-audit findings.
- **Progress-tracker:** reads `.claude/acmm/state.json` history to surface level-over-time in its daily metrics log.

## Testing

```bash
node --test scripts/acmm/__tests__/
```

13 tests covering detection engine semantics + computeLevel threshold-walk invariants + source-data structural integrity.

## Adapting detection patterns to our stack

Most canonical patterns are `any-of` arrays of common paths — they match our stack as-is (e.g., `CLAUDE.md`, `AGENTS.md`, `.husky/`, `.github/workflows/`). When a criterion is genuinely missing because our stack uses a different convention, the right move is to **add our path to the `any-of` array** in `scripts/acmm/sources/acmm.js` (or the relevant source file) — not to manufacture a stub file. The principle is the same one that keeps `backfill-metrics.js` committed but un-run: don't game the score, fix the underlying state or extend the rubric to recognize legitimate variants.

## Files

```
scripts/acmm/
  sources/                    Ported from kubestellar/console
    acmm.js                   65 ACMM criteria + 7 LevelDef entries (L0–L6)
    fullsend.js               8 Fullsend criteria
    agentic-engineering-framework.js   6 AEF criteria
    claude-reflect.js         6 Reflect criteria
    index.js                  SOURCES, ALL_CRITERIA, ACMM_LEVELS exports
    types.js                  JSDoc-only type definitions
  detection.js                Pure (cwd, criterion) → boolean engine (path/any-of)
  computeLevel.js             Threshold-walk scoring (70% per level, L2 OR-group)
  scannableIdsByLevel.js      Per-level scannable ID map (single source of truth)
  state.js                    load/save/recordHistory for .claude/acmm/state.json
  audit.js                    Main entry (shebang, argv, orchestration)
  outputs/
    issues.js                 gh CLI wrapper with dedup; files for next-level gaps only
    report.js                 Markdown renderer → .claude/acmm/report.md
    badge.js                  README fence rewriter (L0 grey → L6 gold)
  __tests__/
    detection.test.js         Detection engine semantics
    computeLevel.test.js      Threshold-walk + source-data structural invariants
.claude/acmm/                 (generated; gitignored)
  state.json                  history + issuesCreated map + last full computation
  report.md                   human-readable scorecard (overwritten each run)
```
