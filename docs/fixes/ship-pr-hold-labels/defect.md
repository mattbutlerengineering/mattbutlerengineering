---
stage: capture
run: maintenance:ship-pr-hold-labels
date: 2026-10-17
re-entry: implement
origin: "docs/features/ship-pr/review.md § Major 1 (Owner reversed its deferral on 2026-10-17, per autorun-brief.md), folding in Minors 1, 3 and 4. No docs/backlog.md seed exists for this defect (grep for ship-pr / needs-review / hold found none), so none is claimed. No tracker intake issue."
assumptions:
  - "The hold check covers the PR's linked issue as well as the PR itself. The brief says to stop on a hold label 'as the plugin's step 2 does', and that step reads 'A hold_labels label on the PR or its issue'. The linked issue is the one a `Closes #N` / `Fixes #N` trailer in the PR body names; a PR with none has only its own labels checked."
  - "Labels are re-read immediately before the merge call in step 5, not only in step 1. The brief is silent. Reason: the review gives `CLEAN` PRs as the case with no window for `merge-queue.yml`'s `--disable-auto`, and a review takes minutes, so a hold added during review would otherwise be missed."
  - "Minor 1's mapping takes the review's own recommended follow-up as written: acceptance criteria come from the PR body plus its `Closes #N` issue and are empty only when both lack them; the reviewer reads code from a throwaway worktree of the PR head; a flag or block stops with no retry and no new worker."
  - "(Implement, 2026-10-17) Step 5's hold re-read covers the linked issue as well as the PR, matching step 1, so both hold checks read the same scope. The work item names only the PR's labels; the wider read is a superset and costs one `gh issue view`."
  - "(Implement, 2026-10-17) No breakdown.md exists; per the brief, defect.md's work items are the checklist and Implement's notes go under § Implement log here."
  - "(Implement, 2026-10-17) The precheck's `pnpm lint` and `pnpm typecheck` lanes were run sequentially, not in the skill's parallel form, per the stage instructions (parallel lanes race on packages/rialto/dist)."
  - "Re-entry is `implement`, the brief's expected default. The fix is wording in one markdown skill file, with no design choice beyond the three assumptions above."
---

# Defect: /ship-pr reviews and merges a PR that carries the `needs-review` hold label

## Defect

**Observed.** `.claude/skills/ship-pr/SKILL.md` (as of `origin/main`
`4a2981e9a`) treats `needs-review` only as a reason to skip the fast path,
and names only gate-path files as a hold at merge time.

- Step 1 (`:33-36`) reads `labels` with `gh pr view <N> --json state,isDraft,labels,headRefOid`
  but stops only on draft state. Nothing in step 1 acts on a label.
- Step 4 (`:63-69`): "a gate-path match or a `needs-review` label is checked
  **before** the fast path is consulted, not after … A gate-path PR still
  gets the review below, then step 5 holds it." The label only turns the
  fast path off.
- Step 5 (`:86-90`): "A changed file matching a gate path (`GATE_PATHS` in
  `@mbe/agent-core`) holds the PR for a human merge instead … If GitHub
  reports the PR `CLEAN` and refuses `--auto`, merge directly with the same
  command minus `--auto`." No label is named as a hold.

So on a green PR carrying `needs-review`, a reviewer pass leads the agent to
run `gh pr merge <N> --auto --squash --delete-branch`, or to merge directly
when GitHub reports `CLEAN`.

**Expected.** A `hold_labels` label "ends the gate here: no review, no merge":

- Plugin `implement-queue/SKILL.md` gate step 2 (`:137-138`): "A
  `hold_labels` label on the PR or its issue ends the gate here: no review,
  no merge." Its Merge policy (`:165-171`) says consent never covers a PR
  that "carries a `hold_labels` label".
- Profile `.claude/implement-queue.md`: frontmatter `hold_labels: [needs-review]`
  (`:5`); intro (`:16`) merges only with "no `needs-review` label"; § No tier
  hold (`:262`) lists "a `needs-review` label" under "What still holds a PR".
- `CLAUDE.md` label table: `needs-review` "Blocks auto-merge — a human must
  look at this PR".

**Folded-in minors (same review, same file):**

- **Minor 1.** Step 4 (`:69-77`) sends the agent to § reviewers and to "that
  section's retry/hold policy", which assumes a queue worker. A `/ship-pr`
  invocation has no `acceptanceCriteria` "extracted from the issue body"
  when no issue is linked (`docs/agents/reviewer-contract.md:24`), no
  `.claude/worktrees/agent-<taskId>/` worktree for the reviewer to read from
  (`.claude/agents/reviewer.md:79`), and no worker for the retry policy to
  re-dispatch (`.claude/implement-queue.md:242`). Step 4 also says "stop",
  which contradicts that section's "retry".
- **Minor 3.** Step 2 (`:44-45`) says the freshness check covers "the dist
  both `classifyCiGateStatus` support code and `reviewersForDiff` depend
  on". `scripts/ci-gate-status.mjs` imports only `node:child_process` and
  `node:url` (`:84-85`), so CI classification never touches the dist.
- **Minor 4.** Step 4's restated gate-path / `needs-review` pre-check
  (`:63-69`) duplicates what `qualifiesForLowRiskFastPath` (returns `false`
  for gate paths since #6794) and § fast-path (`.claude/implement-queue.md:142-148`)
  already decide. It breaks the skill's own rule against restating
  (`:12-15`).

## Reproduction / Evidence

- A trace through the skill text, quoted above, measured in
  `docs/features/ship-pr/review.md` § Major 1 on 2026-10-17 and re-read
  here against `origin/main` `4a2981e9a`. The line numbers the review cites
  (`:63-69`, `:79-90`, `:44-45`, `:12-15`) are unchanged.
- It has **never been observed** on a real PR. `/ship-pr`'s review-and-merge
  half has never run end to end (review Minor 5): its only exercise stopped
  at step 3 with `pending`.
- There is no failing test and none can be written in the usual sense: the
  skill is markdown an agent follows. The regression evidence for Verify is
  therefore (a) a re-read trace showing every path from step 1 to a merge
  command passes a hold-label stop, and (b) the drift checks below passing.

## Root-cause hypothesis

Hypothesis, not a finding: the skill restated a narrower hold than the
profile it reuses (gate path only, folded into the fast-path pre-check)
instead of pointing at the profile's `hold_labels`. #6675 added the
gate-path hold as an explicit step and nothing added the label hold beside
it.

## Blast radius

- Only sessions that invoke `/ship-pr`. No routine or workflow calls it.
- When it fires, it bypasses an explicit human hold. On a `CLEAN` PR it
  merges directly, so `merge-queue.yml`'s `--disable-auto` has no window to
  undo it.
- Present since #6667 / #6675 (2026-10-15).
- Scale: one markdown file, no runtime code, no deploy surface. Review and
  Ship scale down accordingly; Verify does not.

## Ruled out

- **"The hold is already reachable by reference."** Step 5 points at
  § merge-command, which contains the "What still holds a PR" list
  (`.claude/implement-queue.md:262`). The review judged that insufficient:
  the skill's own steps are the text an agent acts on, and they state a
  narrower hold. Do not close this run on that argument.
- **The CI classifier needing a fresh dist** (Minor 3's wording). Measured:
  `scripts/ci-gate-status.mjs` has no `@mbe/agent-core` import.

## Work items

- [x] **Hold-label stop in step 1** — after the draft check, stop when the PR,
      or the issue its body links with `Closes`/`Fixes #N`, carries a label in
      the profile's `hold_labels` (point at `.claude/implement-queue.md`
      frontmatter, do not restate the list). Report `held — <label>`; no
      review is dispatched.
  - Accept: step 1 names `hold_labels` by pointer and says the stop comes
    before review; the Output block's `Action:` line covers `held — <label>`.
- [x] **Re-check holds before merging** — step 5 re-reads the PR's labels
      (`gh pr view <N> --json labels`) immediately before the merge command and
      stops on a hold label, including on the `CLEAN` direct-merge path.
  - Accept: no path in step 5 reaches `gh pr merge` without a label re-read;
    step 5 names both gate paths and hold labels as holds.
- [x] **Replace step 4's pre-check with a pointer (Minor 4)** — drop the
      restated gate-path / `needs-review` pre-check prose at `:63-69` and point
      at § fast-path and `qualifiesForLowRiskFastPath`, which already decide it.
  - Accept: step 4 contains no restated fast-path rule; gate-path holds are
    still stated once, in step 5.
- [x] **Map queue-only review inputs for a single PR (Minor 1)** — in step 4,
      state where each comes from: acceptance criteria from the PR body plus
      its `Closes #N` issue (empty only when both lack them, and say so in the
      `ReviewInput`); the reviewer reads code from a throwaway worktree of the
      PR head that the skill creates and removes; a `flag`/`block` stops with
      no retry and no worker dispatch.
  - Accept: step 4 no longer defers to "that section's retry/hold policy"
    without qualification, and "stop" and "retry" no longer contradict.
- [x] **Fix step 2's dist wording (Minor 3)** — say the freshness check
      governs `reviewersForDiff` / `qualifiesForLowRiskFastPath` only, and that
      `scripts/ci-gate-status.mjs` does not depend on the dist.
  - Accept: step 2 no longer names `classifyCiGateStatus` as a dist
    dependent.
- [x] **Drift checks** — run, in the worktree, and record results:
      `node scripts/check-skill-references.mjs`,
      `node scripts/check-claude-md-table-drift.mjs`,
      `node scripts/detect-instruction-rot.mjs`, and
      `pnpm exec prettier --check .claude/skills/ship-pr/SKILL.md docs/fixes/ship-pr-hold-labels/`.
  - Accept: all four exit 0. If the `CLAUDE.md:94` `/ship-pr` row stops
    matching the skill's description, update the row (the only other file
    this run may touch besides its own artifacts).

## Notes

- Constraints from the brief: edit only `.claude/skills/ship-pr/SKILL.md`
  plus this run's artifacts (and the `CLAUDE.md` row only if a drift check
  demands it). Do not edit `.claude/implement-queue.md`.
- Out of scope, kept as follow-ups: review Minor 2 (classifier call recipe),
  Minor 5 (first real end-to-end run), Minor 6 (profile's stale
  `gate-unattributed` note), and the local-ci-precheck rialto/dist race.
- Work already in flight (checked 2026-10-17): `gh pr list --state open`
  returned `[]`. Nothing matches; the check ran.
- Release authorization (brief): the run may merge its own PR once `CI Gate`
  is present and green and the repo's implement-queue gate passes, never
  past a `needs-review` label or a gate-path file. No deploy, tag or publish
  exists for a skill file.
- Next stage: Implement (`re-entry: implement`).

## Implement log (2026-10-17)

**Test first (markdown skill, so the "test" is a grep over the text an agent
follows).** Before the edit, on `origin/main` `4a2981e9a`:

```
== hold_labels mentions:          0
== step1: gh pr view <N> --json state,isDraft,labels,headRefOid … stops only on draft
== step5 hold wording:            :86 "A changed file matching a gate path … holds the PR" (only hold named)
== classifyCiGateStatus in step 2: :44 "the dist both `classifyCiGateStatus` support code and"
== retry/hold policy:             :76 "per that section's retry/hold policy"
== restated pre-check:            :66 "label is checked **before** the fast path is consulted"
```

After the edit:

```
== hold_labels mentions:          :41 (step 1 stop), :104 (step 5 re-read)
== held — <label>:                :42 (step 1), :105 (step 5), :131 (Output Action line)
== classifyCiGateStatus as dist dependent: 0
== retry/hold policy:             0
== restated pre-check:            0
== needs-review literal:          0   (the skill points at hold_labels instead)
== merge order: :98-100 hold re-read precedes :112 gh pr merge and :117 the CLEAN direct-merge path
```

**Drift checks (work item 6), all exit 0:**

```
node scripts/check-skill-references.mjs
  PASS: Every /slash-command named in an instruction file resolves to a skill or is declared with a reason.
  PASS: No repo-local skill shares a plugin skill's name without a declared reason.
node scripts/check-claude-md-table-drift.mjs
  PASS: CLAUDE.md tables (CLI commands, skills, subagents) match the repo tree.
node scripts/detect-instruction-rot.mjs
  ✓ No instruction rot detected.
pnpm exec prettier --check .claude/skills/ship-pr/SKILL.md docs/fixes/ship-pr-hold-labels/
  All matched files use Prettier code style!
```

The skill's frontmatter `description` is unchanged, so the `CLAUDE.md`
`/ship-pr` row still matches and was not touched.

**Pipeline hook — local-ci-precheck (before first push), lanes run
sequentially, all exit 0:** `pnpm install --frozen-lockfile` 0; `pnpm lint`
0 (52/52 tasks); `pnpm typecheck` 0 (52/52 tasks); arch-audit 0
(`check-adr`: "No architectural violations detected", `check-deps`: "All
external dependencies are consistent"); drift 0 (dep-graph `git diff` clean,
`pack --check` clean on 27 llms.txt dirs).
