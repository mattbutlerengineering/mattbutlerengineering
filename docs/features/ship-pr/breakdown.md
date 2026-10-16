---
stage: decompose
run: feature:ship-pr
date: 2026-10-14
assumptions:
  - "Cut lines accepted from the architecture without live review (autorun,
    stop-after: decompose). Work-order ids drawn from this item's reserved
    block (wo 16–25); WO-0020–WO-0025 unused."
  - "Tracker import only: the four items mirror issue #6639 per the brief;
    no export (this environment has no GitHub credential, and the issues
    already exist)."
---

# Breakdown: /ship-pr

Progress lives in the checkboxes below — Implement checks items off as
their acceptance criteria are met.

## Milestone 1: /ship-pr runs the full boundary on an arbitrary PR

- [x] **WO-0016 — Write `.claude/skills/ship-pr/SKILL.md`** — the ordered
      protocol per `architecture.md`: preconditions (open PR; draft refused
      without `--ready`, with it run `gh pr ready <N>` first), then
      `node scripts/agent-core-build-freshness.mjs check`, then
      `classifyCiGateStatus` (`scripts/ci-gate-status.mjs`) acting on
      `green` only with the profile's `gate-missing` dispatch-and-re-poll,
      then `reviewersForDiff` specialists plus the `reviewer` subagent
      (any FLAG stops), then
      `gh pr merge <N> --auto --squash --delete-branch` (direct merge when
      GitHub reports `CLEAN` and refuses `--auto`), ending in the
      one-screen summary. Shape follows
      `.claude/skills/local-ci-precheck/SKILL.md`. (tracker: #6639)
  - Accept: `grep` of the skill file finds `ci-gate-status.mjs`,
    `agent-core-build-freshness.mjs` and `reviewersForDiff`; the file
    references `.claude/implement-queue.md` § ci-status / § reviewers /
    § merge-command rather than restating their steps; no new script or
    classifier is added anywhere in the diff.
  - Blocked by: —
- [x] **WO-0017 — Add the `/ship-pr` row to CLAUDE.md § Skills** — one
      table row in the Project Automation table, purpose line matching the
      skill's frontmatter description. (tracker: #6639)
  - Accept: `node scripts/check-claude-md-table-drift.mjs` passes with the
    new skill present; the row's purpose text matches the SKILL.md
    description.
  - Blocked by: WO-0016
- [x] **WO-0018 — Run the repo gates over both surfaces** — drift checks
      plus the standard affected gates. (tracker: #6639)
  - Accept: `node scripts/check-claude-md-table-drift.mjs`,
    `node scripts/check-skill-references.mjs`, and
    `pnpm lint && pnpm typecheck && pnpm test` (affected packages) all exit
    0, outputs quoted in the PR.
  - Blocked by: WO-0016, WO-0017
- [x] **WO-0019 — Dry walk-through on PR #6591, recorded in the PR body** —
      without merging anything: name the CI classification #6591's head
      would get, the specialists `reviewersForDiff` names for its changed
      files, and the merge action the skill would take. (tracker: #6639)
  - Accept: the implementation PR body contains the walk-through —
    classification + reviewer list + would-be action — produced by running
    the real scripts, not asserted.
  - Blocked by: WO-0016

## Design gaps found

None.

## Notes

Blueprint gate: this run stops here (`stop-after: decompose` in
`autorun-brief.md`). Implementation proceeds only on the Owner's answer at
the Conductor's gate.
