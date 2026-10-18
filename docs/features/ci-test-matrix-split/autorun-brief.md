# Autorun brief — ci-test-matrix-split

Collected 2026-10-14. Source: GitHub issue #6664 (batch sdlc-speed-2,
tracking #6666), quoted verbatim into the conductor Worker's objective. This
brief is not a pipeline artifact — it never counts toward orientation or
active-run discovery.

<!-- stop-after: decompose — lifted 2026-10-18, see § Resume 2026-10-18 -->

## Request

Issue #6664, part 2 of 3 of **sdlc-speed-2 — cut the cold/full-run CI Test
critical path**: split `ci.yml`'s single `test` job into a matrix of parallel
legs balanced by measured duration, re-join for the coverage gates, and guard
the split with a workspace-coverage test.

## Run scale

Feature run. Slug: `ci-test-matrix-split`. Artifacts at
`docs/features/ci-test-matrix-split/`.

## Idea-stage inputs

- **Problem.** On a full (cache-busted) run, `test` runs every package's
  `test:coverage` serially-ish (`pnpm turbo test:coverage --concurrency=2`)
  in one job: 14m of turbo time on run 38650413196, while three packages
  alone sum to ~938s (reservations 391s, hospitality 277s, rialto 270s).
  Affected-only PR runs are 1–4m, but any cache bust (lockfile, root turbo
  inputs) pays the full 14m on the critical path to `CI Gate`.
- **Who has it / coping today.** Every PR author — mostly the autonomous
  merge train, whose iteration cadence is bounded by CI wall-clock. Coping:
  waiting, and (gotchas § CI) treating lockfile-touching PRs as a known
  slow class.
- **Why now.** Batch sdlc-speed-2 exists to cut this critical path; #6663
  (part 1) shrinks the longest leg, #6665 (part 3) also edits the test job —
  this item is sequenced between them.
- **Evidence.** Run 38650413196's measured durations, quoted in the issue.
  This Worker has no GitHub credential, so the numbers are carried from the
  issue as filed, labelled as such, not re-measured.
- **Solution shape (hunch).** Matrix legs via turbo `--filter` — one leg per
  heavy package, "everything else" derived by exclusion so a new package can
  never fall outside every leg; per-leg artifact uploads; a
  `test-coverage-gate` job (`needs: test`) that downloads all coverage and
  runs the existing repo-wide and agent-core gates and the codecov upload,
  logic unchanged; `ci-gate` requires the new gate job.
- **Success sentence.** On a forced full run the longest test leg is ≤ ~7m
  and the coverage gate reports the same repo-wide % as main (± rounding),
  with nothing silently dropping out of gating.
- **Biggest unknowns / ways this dies.** (1) Coverage artifact paths must
  reconstruct the repo-relative tree in the gate job or the existing gate
  script finds nothing; (2) renaming/mutating the `Test (Node 22)` job name
  must not orphan `ci-gate`/`report-health` `needs:` or the required-check
  semantics; (3) the "rest" leg's duration is inferred (~total − big three),
  not separately measured.

## Scope boundaries

- **In:** `.github/workflows/ci.yml` (test matrix, coverage-gate job,
  `ci-gate` needs), new guard `scripts/__tests__/ci-test-shards.test.mjs`.
- **Out:** shrinking any individual suite (#6663), further test-job work
  (#6665), changing coverage thresholds or codecov config semantics,
  touching the nightly suite.

## Success criteria (from the issue)

1. Guard test fails if a package with `test:coverage` is in zero or two legs.
2. Guard test fails if `ci-gate` stops depending on the coverage gate.
3. Forced full run: longest test leg ≤ ~7m; coverage gate reports the same
   repo-wide % as main (± rounding).
4. `report-health` and anything else that `needs: test` still resolves.
5. `pnpm lint && pnpm typecheck && pnpm test` (affected) pass.

## Constraints / decisions already made

- Patterns: guard parses the real workflow file
  (`scripts/__tests__/ci-lint-critical-path.test.mjs`); artifact globs are
  fixed-depth, never `**` (#6115, `ci-test-results-glob.test.mjs`).
- Threshold values unchanged: repo-wide `COVERAGE_THRESHOLD: 60`,
  agent-core 80%.
- Keep the `--concurrency=2` cap on every leg's turbo command
  (`nightly-compliance-workflow.test.mjs` asserts the cap is declared).
- Reserved id block for this item: PRD 6, ADR 104–106, WO 56–65. Ids come
  only from this block.
- Tracker: the run references issue #6664 but mirrors no work items to the
  tracker — the conductor owns the issue lifecycle; nothing here may
  auto-close it.
- Release authorization: **withheld**. Moot before ship — this run stops at
  the blueprint gate (`stop-after: decompose` above).

## Resume 2026-10-18 — shipped by the Conductor; re-Verify + Review + Ship record

The Owner re-invoked autorun on this run on 2026-10-18 and answered two gap
questions live (not assumptions):

1. **Shape:** "Re-Verify + Review + Ship." The `stop-after: decompose` line
   above is lifted. The 2026-10-14 `verification.md` graded the PR branch;
   Verify is redone against `main` as it is now.
2. **Operate:** see `operate:` below.

Facts measured at resume, not assumptions:

- Shipped: **#6684** `3c0263c6e` ("ci: shard Test job into balanced matrix
  legs with a coverage join gate"), merged 2026-10-15T11:15:13Z. Blueprint
  #6673 `ff1bd4c70`. `breakdown.md` 5/5 checked.
- Later `ci.yml` changes on `main`: #6720 `650f19217` (start Test after
  Prepare by building the ^build closure in prepare), #6855 `4b68906af`
  (cursorrules drift on docs-only PRs), #6888 `f1f6f7ecf` (knip in lint).
- Baseline: main run 38650413196, single `Test (Node 22)` job, 14m49s.
- Remaining stages run in `.claude/worktrees/ci-matrix-close`, branch
  `docs/ci-test-matrix-close`, cut from `origin/main`.

What each stage does:

- **Verify** rewrites `verification.md` grading every success criterion
  against `main` now, from real CI runs (read-only `gh`): the last ~10
  completed `ci.yml` runs on `main` plus recent PR runs — each Test leg's
  wall-clock vs the 14m49s baseline, every leg's conclusion, the coverage
  join gate's presence in `CI Gate`'s `needs` (read `ci.yml`), and
  coverage upload still covering every package. Cite run IDs and job
  conclusions. Never dispatch workflows, re-run jobs, or push cache-busting
  commits.
- **Review** reviews #6684 as merged plus the later `ci.yml` changes that
  touch the Test/coverage jobs. A major finding stays open for the Owner.
- **Ship** records the release that already happened (`outcome:
released`): evidence is the first real `ci.yml` runs on `3c0263c6e`-or-later
  using the legs. No new release action. A critical finding is a live
  defect, reported.
- The orchestrator opens the docs PR and leaves it for the Owner.

## Operate

operate:
minimum-signal: >-
At least 20 main/PR ci.yml runs after #6684 merged, measuring p50/p90
wall-clock of the slowest Test leg against the 14m49s single-job
baseline, plus a count of red runs caused by a leg (flake, imbalance,
coverage-join failure). users-observed counts honestly; 0 is valid.
