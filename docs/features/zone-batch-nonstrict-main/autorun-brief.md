# Autorun brief — zone-batch-nonstrict-main

<!-- stop-after: decompose — lifted 2026-10-18, see § Resume 2026-10-18 -->

## Feature description (what and why)

Issue #6640 (part 6 of 6 for tracking #6637, SDLC speed): ADR-023 limits
each `/implement-queue` batch to one issue per merge-train zone
(`selectZoneSpreadBatch`, `scripts/issue-zone.mjs`). Its entire rationale
is ADR-016's **strict** `main`: same-zone siblings go out-of-date on each
merge, forcing an O(k²) `update-branch` + CI re-run tax. Measured
2026-10-14 (and 2026-08-17 in gotchas § CI): `main` is **not** strict —
`{"strict": false, "contexts": ["CI Gate"]}`. With strict off there is no
forced update-branch, so the zone rule costs parallelism without buying
its stated benefit. Amend the policy so a batch may hold up to
`maxWorkers` same-zone issues when their expected file sets are disjoint,
gated on a live read of the `strict` flag that fails closed to today's
behaviour.

## Run scale

Feature run. Slug: `zone-batch-nonstrict-main`.
Run directory: `docs/features/zone-batch-nonstrict-main/`.

## Idea-stage inputs

- **Problem, sufferer's view:** the implement-queue operator watches 14
  of the 19 localization issues (#6612–#6630) sit in the
  `apps/hospitality` zone and drain **one per batch** while worker slots
  idle — a throughput tax paid to a merge-ordering hazard that no longer
  exists.
- **Who has it / coping today:** `/idea-to-prod:implement-queue`
  sessions and the Conductor; they cope by waiting out serial drains.
- **Why now:** issue #6640 filed it with fresh measurement; the
  localization backlog makes the cost concrete today.
- **Evidence (labelled, measured):** `gh api …/branches/main/protection/
required_status_checks` → `{"strict": false, "contexts": ["CI Gate"]}`
  (2026-10-14; same result recorded 2026-08-17 in gotchas § CI). The
  zone cluster count (14/19) is from the issue.
- **Solution hunch:** `selectZoneSpreadBatch` grows a `{ strictMain }`
  option (default `true` = today); when `false`, same-zone issues with
  disjoint expected file sets may share a batch, zone-spread remaining
  the tie-breaker. The compose hook reads `strict` live each iteration,
  failing closed to `strictMain: true`.
- **Success, one sentence:** with strict off, three same-zone issues
  with disjoint scopes form one batch, while every existing test's
  output is unchanged under the default.
- **Biggest unknowns / ways this dies:** merging against a stale base is
  real (ADR-023 cited it) — but it applies today regardless of batching,
  and main's push CI + `revert-watchdog` already carry it; "expected
  file sets" are estimates from issue text, so overlap detection can
  under-approximate — it must fail toward deferral, never toward
  stacking overlapping work.

## Scope boundaries

- **In:** ADR amendment (new ADR, ADR-023 status line only);
  `scripts/issue-zone.mjs` + its tests; the compose-hook strict probe
  (fail closed); `.claude/implement-queue.md` § compose; the gotchas §
  CI bullets describing the zone rule.
- **Out:** rewriting ADR-023's Decision section; the merge-train lock
  (`scripts/zone-vocabulary.mjs` untouched); branch-protection settings
  themselves; the single-global-slot rule (unchanged); issues #6633–#6636.

## Constraints / already decided

- `strictMain: true` default must reproduce today's output bit-for-bit
  on every existing test.
- An API error reading branch protection yields `strictMain: true`
  (fail closed).
- ADR-023's Decision section stays as written; only its status line
  changes ("amended by" the new ADR).
- Pure selector stays pure: the strict probe lives at the call site
  (compose hook), never inside `selectZoneSpreadBatch`.

## Tracker

No tracker interaction by this run. Issue #6640 is owned by the
Conductor batch (conductor/b20261014c-6640); artifacts reference it in
prose/frontmatter only. Work items carry no `(tracker: #N)` refs so no
Implement-boundary close can touch #6640.

## User-facing surface

None — selector logic, a CLI probe, and docs. The PRD decides `ux:` on
that basis.

## Release authorization

None. Prepare-and-stop is moot: this run stops after Decompose (the
blueprint gate); Implement onward is dispatched by the Conductor only
after Matt's go-ahead on the policy change.

## Reserved ids (Conductor block for #6640)

PRD 3; ADR 95-97; WO 26-35. If exhausted, stop and surface. (The issue
text's "ADR-028" was a decompose-time guess; the reserved block is
authoritative, so the amending ADR is ADR-027.)

## Resume 2026-10-18 — shipped by the Conductor; Verify + Review + Ship record

The Owner re-invoked autorun on this run on 2026-10-18 and answered two gap
questions live (not assumptions):

1. **Shape:** "Verify + Review + Ship record." The `stop-after: decompose`
   line above is lifted.
2. **Operate:** see `operate:` below.

Facts measured at resume, not assumptions:

- Shipped: **#6678** `d1047723e` ("feat(merge-train): batch same-zone
  issues while main is non-strict"), merged 2026-10-15T05:37:59Z; ADR-027
  amending ADR-023 via #6661 `14c71bc53`; #6640 closed
  2026-10-15T05:38:01Z; ledger #6949. `breakdown.md` 4/4 checked.
- This session has `gh` and network. Open-PR pre-flight 2026-10-18: no
  open PR touches `scripts/issue-zone*`, `.claude/implement-queue.md` or
  ADR-023/027.
- Remaining stages run in `.claude/worktrees/zone-batch-close`, branch
  `docs/zone-batch-close`, cut from `origin/main`. Run
  `pnpm install --frozen-lockfile` and `pnpm build --filter '@mbe/scripts^...'`
  before scripts tests (run from repo root:
  `pnpm exec vitest run --config scripts/vitest.config.mjs <filter>`).

What each stage does:

- **Verify** grades the PRD success criteria against `main` with real
  commands: the module's unit tests; a live read of
  `branches/main/protection/required_status_checks` (`strict`); the
  fail-closed path when that read errors (exercise it through the real
  code with an injected failing reader, not by reasoning); and a read-only
  replay of real implement-queue batches since 2026-10-15 (from
  implement-queue ledgers/logs/telemetry or PR timelines — find the
  source; say if none is reliable): which batches held >=2 same-zone
  issues, whether their file sets were disjoint, and whether any pair
  needed `update-branch` or conflicted. Read-only on GitHub.
- **Review** reviews #6678 + ADR-027 as merged plus anything on `main`
  since touching the same files. A major stays open for the Owner.
- **Ship** records the release that already happened (`outcome:
released`); evidence is the first real implement-queue runs using the
  new selection. No new release action. A critical finding is a live
  defect, reported.
- The orchestrator opens the docs PR and leaves it for the Owner.

## Operate

operate:
minimum-signal: >-
At least 5 implement-queue batches since 2026-10-15 that held 2 or
more same-zone issues, with a count of how many of those pairs hit a
merge conflict or needed update-branch. users-observed counts
honestly; 0 is valid.
