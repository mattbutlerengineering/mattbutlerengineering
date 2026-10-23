---
stage: operate
run: feature:ci-test-matrix-split
date: 2026-10-22
users-observed: 0
signal-source: ci.yml run telemetry via gh api (191 completed runs since the 2026-10-15 merge, 31-run job-level sample); no human observed the legs directly
assumptions:
  - "Autorun operate sweep (Owner chose the sweep live; no live interview inside the stage). The brief's minimum-signal (20+ runs, p50/p90 of the slowest leg vs the 14m49s baseline, leg-caused red count) was measured by this stage against the window 2026-10-15T11:15Z to 2026-10-23."
  - "Red-cause classification is sampled, not exhaustive: of 28 red runs in the window, 12 were sampled at job level and 4 of those had a failing Test leg; flake vs genuine test failure was not classified per run. No sampled red involved a coverage-join failure."
---

# Retro: Split CI's Test job into duration-balanced matrix legs

Minimum-signal (brief § Operate), measured 2026-10-22:

- 191 completed `ci.yml` runs since #6684 merged (2026-10-15T11:15Z) — the
  20-run floor cleared 9x (the listing capped at 200).
- Slowest-leg wall-clock across a 31-run sample: p50 118s (2.0m),
  p90 255s (4.2m), max 336s (5.6m) — against the 14m49s (889s) single-job
  baseline. p50 is ~7.5x faster; even the worst sampled leg is 2.6x faster.
- Red runs: 28 in the window; of 12 sampled, 4 failed in a Test leg
  (unclassified flake vs genuine failure, per the assumption above), 0 in
  the coverage join.

## Outcomes vs. intent

### The critical path to CI Gate drops from ~14m of turbo time to a balanced matrix (idea.md problem, PRD SC-3)

- What happened: SC-3 asked for longest leg at or under ~7m on a full run;
  the measured p90 is 4.2m and the sampled max 5.6m, from a 14m49s
  baseline. The first cold run after merge (38726243930) had already shown
  5m00s; a week of traffic held it.
- Signal strength: measured

### The split cannot silently drop coverage or a package (SC-1, SC-2, SC-4)

- What happened: `scripts/__tests__/ci-test-shards.test.mjs` still pins
  zero-or-double leg coverage and the thresholds; `ci-gate`'s `needs:`
  includes `test-coverage-gate` (ci.yml:1150); the `test` job id survived
  so `needs: test` consumers resolve. State held through a week in which
  28 runs went red for ordinary reasons and none wedged on the join.
- Signal strength: measured

### Nobody watches the legs themselves

- What happened: no human observed the matrix; its users are the runs. The
  one blind spot found at Review is still live (Open debt below).
- Signal strength: unobserved

## Open debt

- Review's Major, still unfixed on `main` (re-checked 2026-10-22):
  `report-health`'s `needs:` (ci.yml:980) omits `test-coverage-gate`, so
  `/health/system` can read CI healthy while the coverage gate is red.
  `release.md` records the fix as Owner-chosen, pending outside this run.
- Three review Minors, deferred under the skill's default.

## Run retrospective

- Keep: an operate gate written as concrete counts against a recorded
  baseline — this retro's measurement was one script against `gh api`,
  no judgment calls. Keep the shards guard test pattern (structural fact,
  not grep).
- Change: land the report-health `needs:` fix rather than leaving a known
  one-line blindness Owner-pending for a second week.
- Stop: nothing — the run was small and shipped clean.

## Environment

| Mistake                                                                                            | Evidence                                          | Class      | Proposed carrier                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| report-health reads only the leg results, so a coverage-gate failure no longer reddens its verdict | review.md Major; ci.yml:980 re-checked 2026-10-22 | mechanical | extend the ci.yml workflow-guard family (scripts/**tests**/ci-*.test.mjs) to pin that report-health's needs include test-coverage-gate |

Gotcha harvest (CLAUDE.md stage hook): ran `kb.py harvest <main checkout>
--days 10` — 623 transcripts, 51 failed-then-fixed arcs, 67 recurring
tool-error patterns. Dominant arc class is the worktree-isolation Bash
classifier rejecting python3 heredocs and compound commands (21 + 7 git +
7 sed arcs), already documented by open PR #7323's gotchas entry; no new
bullet proposed from this run's sessions.

## Idea seeds

Appended to `docs/backlog.md`:

- ciHealth sensor: track slowest-Test-leg p50/p90 per window so matrix imbalance or a creeping slow leg is detected by the learning loop instead of a manual `gh api` sweep.

## Run complete

Closed 2026-10-22. The report-health blindness is the one live thread,
tracked in Open debt with its carrier named above.
