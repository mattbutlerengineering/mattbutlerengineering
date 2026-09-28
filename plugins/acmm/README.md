# ACMM Claude Code Plugin

AI Codebase Maturity Model (ACMM) audit plugin for Claude Code.

## Installation

In any repo:
\`\`\`bash
/plugins add https://github.com/mattbutlerengineering/mattbutlerengineering/tree/main/plugins/acmm
\`\`\`

## Usage

\`\`\`bash
/acmm-audit
\`\`\`

## Behavioral gates

L3–L6 each carry one or more runtime signals (`computeLevel.js`'s
`BEHAVIORAL_GATES`) that must pass, in `--strict` mode (the default), for
that level to be reached — a criterion count alone is not enough:

| Level | Gate                     | Threshold         |
| ----- | ------------------------ | ----------------- |
| L3    | CI flake rate            | below 20%         |
| L4    | Agent PR acceptance rate | above 50%         |
| L5    | Auto-QA tuning history   | more than 1 entry |
| L6    | Agent PR revert rate     | below 10%         |
| L6    | Human-touch ratio        | below 50%         |

**Multiple gates at the same level all apply.** L6 has two; both must pass.

**Missing data or an insufficient sample is unverifiable, never a silent
pass.** Every gate — not just human-touch — blocks advancement in `--strict`
mode when its value is absent or the underlying reading reports
`insufficient_data: true` (sample below the reader's own minimum). With
`--no-strict`, an unverifiable gate warns but doesn't block.

**Inputs carry an age.** `flake`, `agent_pr`, and `auto_qa_tuning` each record
`measured_at`. When a run has no `gh` access and falls back to the prior
state's reading, a value older than 7 days is treated as MISSING for gating
purposes (see `behavioral-freshness.js`) — the console and report still show
its age so a stale reading is visible, but it can no longer pass a gate on a
frozen number.

**State is only written when something changed.** `audit.js` never writes
`.claude/acmm/state.json` or the README badge when `gh` is unavailable
(read-only mode). When `gh` is available, it writes only if the level, the
detected-criteria set, the per-criterion verdict map, or the created-issues
map changed since the prior run — or the prior run is more than 6 days old
(a weekly heartbeat, so the badge's own 7-day freshness check stays honest).

**The headline `X/Y` and the per-level margin.** Unverifiable criteria stay
in the denominator, counted as not-passed, matching the level-threshold walk
— the unverifiable count is shown separately rather than dropped from the
total. Each level also reports a margin (`detected − ceil(0.7 × required)`):
how many currently-detected criteria could be lost before the level drops.
A margin of 1 or less is flagged.
