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
total. Each level also reports a margin (`detected − ceil(0.7 × required)`);
L2 is the one exception, since its own gate is "any single criterion"
(1-of-required) rather than the 70% ratio every other level uses, so its
margin is `detected − 1`. The margin is how many currently-detected criteria
could be lost before the level drops — a margin of 1 or less is flagged.

**The human-touch gate trusts that agents always write the
`Co-Authored-By` trailer.** `human-touch-ratio` (L6) classifies a merged
agent PR as human-touched when its commits carry an author other than the
agent's own `Co-Authored-By` identity — it has no way to see whether a
commit that reads as human-authored was actually produced by an agent that
simply forgot to add the trailer. Measured on 2026-09-28: 48 of 51
"human-touched" PRs in the current 30-day window (21.3% of the sample) are
2026-08-31–09-02 agent commits pushed directly under `mattbutlerengineering`
on `worktree-agent-*` branches with no `Co-Authored-By` trailer at all (e.g.
#4909) — they read as human intervention and will keep doing so until they
age out of the 30-day window around 2026-10-02. This isn't a heuristic gap
to patch; it's a hard dependency on every future agent commit actually
carrying the trailer.
