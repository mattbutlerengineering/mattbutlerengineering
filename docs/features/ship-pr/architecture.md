---
stage: architect
run: feature:ship-pr
date: 2026-10-14
ux: skipped — terminal-only project skill; no user-facing UI surface
assumptions:
  - "Trade-offs resolved from the brief and issue #6639 without live user
    input; the issue mandates reuse-over-reimplement, which settles the
    main decision."
---

# Architecture: /ship-pr

## Approach

A protocol document, not a program: `.claude/skills/ship-pr/SKILL.md`
instructs the invoking agent to run the already-existing boundary pieces in
the queue's order, referencing each by path. Depth comes from reuse — the
skill's interface is one command (`/ship-pr <N> [--ready]`) and it hides
the entire gate behind it while owning none of the gate's rules. The
alternative shape (a new `scripts/ship-pr.mjs` orchestrator wrapping the
same calls) loses: it would be a second executable restatement of
`.claude/implement-queue.md` § ci-status/§ reviewers/§ merge-command that
drifts the day the profile changes, and the reviewer subagent cannot be
spawned from a script anyway — dispatching it is an agent capability.

## Components

### `.claude/skills/ship-pr/SKILL.md` (new)

- Responsibility: the ordered protocol — preconditions, which script to
  run at each step, how to act on each result, and the final summary.
- Collaborators: everything below, by reference (path or section link),
  never by restating their logic.

### Existing gate pieces (unchanged, referenced by path)

- `scripts/agent-core-build-freshness.mjs` — `check` run first; exit 1 ⇒
  rebuild or treat as needing full review (per § fast-path).
- `scripts/ci-gate-status.mjs` — `classifyCiGateStatus` verdict drives the
  branch: `green` proceeds; `gate-missing` ⇒ dispatch `ci.yml` on the PR
  branch and re-poll (per § ci-status); anything else stops, named.
- `reviewersForDiff` (`@mbe/agent-core` dist) — names the specialist
  subagents for the PR's changed files (per § reviewers).
- `reviewer` subagent (`.claude/agents/`) — universal quality gate; its
  FLAG verdict is terminal for this invocation.
- `gh pr merge <N> --auto --squash --delete-branch` — arm merge on PASS;
  direct merge when GitHub reports `CLEAN` and refuses `--auto` (per
  § merge-command and the standing memory note).

## Data model

None. The skill holds no state; PR number and flags are the only inputs,
GitHub and the scripts' exit codes are the only reads.

## Interfaces & contracts

### `/ship-pr <N> [--ready]`

- Input: an open PR number; `--ready` opts a draft in via `gh pr ready <N>`.
- Output: a one-screen summary — CI classification, reviewers run with
  verdicts, merge action taken (armed / merged directly / stopped-at).
- Failure modes (each stops; none arm merge): draft without `--ready`;
  freshness check unrecoverable; CI classification not `green` after the
  profile's `gate-missing` recovery; any specialist or reviewer FLAG;
  `[Merge Without Review]` denial (stop for the session, report, never
  retry through another tool — gotchas § CCR #6125).

## Stack & dependencies

- None new — one markdown file plus a CLAUDE.md table row. The drift
  checks (`check-claude-md-table-drift.mjs`, `check-skill-references.mjs`)
  already police both surfaces.

## Decisions & alternatives

- **Skill document** over new orchestrator script — a script re-implements
  the profile and drifts; the issue's own acceptance criterion ("adds no
  new gate logic") rules it out; reviewer dispatch needs an agent anyway.
- **Reference the profile's sections** over restating their steps — a
  restated sentence must be kept in sync; CLAUDE.md already records that
  duplicated-sentence drift burned this repo twice.
- **`--ready` flag** over auto-readying drafts — a draft is an explicit
  author hold; flipping it must be an explicit operator choice.
- **No ADR** — the decision is easily reversed (delete one file and a
  table row) and unsurprising given the issue text; fails two of the three
  ADR-test legs, so reserved ADR ids 92–94 go unused.

## ADRs

None — no decision met the ADR bar.
