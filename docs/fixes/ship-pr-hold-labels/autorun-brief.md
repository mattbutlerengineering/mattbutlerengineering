---
run: maintenance:ship-pr-hold-labels
date: 2026-10-17
---

# Autorun brief: /ship-pr honours hold labels

Collected 2026-10-17 in a live session. The Owner re-invoked autorun with
no target and, offered four options, chose **"Fix ship-pr Major 1"**. That
choice also settles the Owner decision `docs/features/ship-pr/review.md`
left open: the Major 1 deferral is **reversed — fix it**. This file is the
brief, not an artifact; it never counts toward orientation.

## The Owner's answers (live)

1. **Run:** a maintenance (fix) run for ship-pr review Major 1, folding in
   review Minors 1, 3 and 4.
2. **Release authorization:** the option the Owner picked read "The brief
   would allow merge on green through the normal gate." So this run **may
   merge its own PR** once CI Gate is present and green and the repo's
   implement-queue gate passes (fast path if the classifier allows it,
   otherwise the universal reviewer plus any diff-matched specialist, and
   never past a `needs-review` label or a gate-path file). No deploy, tag
   or publish exists for a skill file.

## Defect (source: `docs/features/ship-pr/review.md` § Major 1, measured 2026-10-17)

Every field below is quoted or condensed from the review, which read the
skill on `origin/main`. Line numbers are as of that review; re-read the file.

- **Observed vs expected.** `.claude/skills/ship-pr/SKILL.md` step 4
  (≈`:63-69`) treats `needs-review` only as a reason to skip the fast path,
  and step 5 (≈`:79-90`) names only gate-path files as a hold. So on a
  green PR carrying `needs-review`, a reviewer PASS leads the agent to arm
  `gh pr merge --auto`, or, when GitHub reports `CLEAN`, merge directly.
  Expected: the label "ends the gate here: no review, no merge", per the
  plugin skill (`implement-queue/SKILL.md` gate step 2, and its Merge
  policy), the profile (`.claude/implement-queue.md` frontmatter
  `hold_labels: [needs-review]`, its intro paragraph, and § No tier hold's
  "What still holds a PR"), and CLAUDE.md's label table.
- **Reproduction evidence.** A trace through the skill text (above). It has
  **never been observed** on a real PR, and `/ship-pr`'s review-and-merge
  half has never been run end to end (review Minor 5). There is no failing
  test, because the skill is markdown an agent follows.
- **Root-cause hypothesis (a hypothesis, not a finding).** The skill
  restated a narrower hold than the profile it reuses, instead of pointing
  at the profile's `hold_labels`.
- **Blast radius.** Only sessions that invoke `/ship-pr` (no routine or
  workflow calls it). When it fires, it bypasses an explicit human hold,
  and on a `CLEAN` PR `merge-queue.yml`'s `--disable-auto` gets no window.
  Since #6667 / #6675 (2026-10-15).
- **Already ruled out.** The hold is still reachable by reference, because
  the profile's § merge-command section (which step 5 points to) contains
  the "What still holds a PR" list. The review judged that insufficient:
  the skill's own steps are the text an agent acts on.

## Folded-in minors (same review)

- **Minor 1:** step 4 hands the agent queue-only inputs a hand-opened PR
  lacks (acceptance criteria from a linked issue, a worker worktree path,
  a retry policy that dispatches a new worker). Say where each comes from
  for a `/ship-pr` invocation, or what to do when it is absent.
- **Minor 3:** step 2 says `classifyCiGateStatus` depends on the
  agent-core dist; `scripts/ci-gate-status.mjs` imports only Node
  built-ins. Fix the wording.
- **Minor 4:** step 4's restated gate-path / `needs-review` pre-check
  duplicates § fast-path and #6794's predicate. Replace it with a pointer
  (the skill's own rule is not to restate).

Out of scope: Minor 2 (classifier call recipe), Minor 5 (first real run),
Minor 6 (profile's stale `gate-unattributed` note: separate profile fix),
and the local-ci-precheck rialto/dist race. They stay as follow-ups.

## Constraints

- Markdown only: `.claude/skills/ship-pr/SKILL.md`, plus this run's
  artifacts. Do not edit `.claude/implement-queue.md` in this run.
- After editing, run `node scripts/check-skill-references.mjs`,
  `node scripts/check-claude-md-table-drift.mjs`,
  `node scripts/detect-instruction-rot.mjs` and `prettier --check`.
- Re-entry depth: the capture stage decides; the expected default is
  `re-entry: implement` (scoped fix, no design decision).
- Tracker: no issue seeds this run, and none is created.

## Execution environment

Worktree `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/ship-pr-hold-labels`,
branch `fix/ship-pr-hold-labels`, cut from `origin/main`. Open-PR
pre-flight at start: zero open pull requests. Run every command there;
never touch the main checkout.
