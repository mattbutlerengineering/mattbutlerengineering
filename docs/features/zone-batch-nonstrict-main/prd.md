---
stage: prd
run: feature:zone-batch-nonstrict-main
date: 2026-10-14
id: PRD-3
ux: not-applicable
ux-reason: no user-facing surface — a pure selector option, a CLI probe, an ADR, and doc updates
assumptions:
  - "Disjointness source fixed to the issue-text path estimates the selector already extracts (extractPathsFromBody / Files-to-Modify sections): the brief says 'expected file sets' without naming a source, and the selector is pure so it can only see issue text."
  - "An issue with no extractable paths is treated as potentially overlapping everything in its zone (one-per-zone for it) — fail toward deferral, per the brief's constraint."
---

# PRD-3: Same-zone batching when `main` is not strict

One page, feature scale. Source: issue #6640, `idea.md`, ADR-023.

## Problem

`selectZoneSpreadBatch` (ADR-023) admits one issue per merge-train zone
per batch. The rule exists solely to dodge the O(k²) `update-branch`/CI
tax of ADR-016's strict `main` — and `main` is measured non-strict
(`{"strict": false}`, 2026-10-14 and 2026-08-17). Result: 14 of 19
localization issues share one zone and drain one at a time with workers
idle.

## Scope

**In**

1. **Policy record.** ADR-027 amending ADR-023 (status line only on
   ADR-023; Decision section untouched), stating the new rule and the
   stale-base mitigation (main's push CI + `revert-watchdog`; the real
   per-zone merge-train lock still serializes the merges themselves).
2. **Selector.** `selectZoneSpreadBatch(candidates, { maxWorkers,
strictMain = true })`. Default reproduces today's output exactly.
   With `strictMain: false`: up to `maxWorkers` same-zone issues may be
   admitted when their expected file sets are pairwise disjoint;
   zone-spread stays the tie-breaker (a new zone beats a second seat in
   an occupied one); the single-global-slot rule is unchanged.
3. **Live probe.** The implement-queue compose hook reads `strict` from
   the branch-protection API each iteration; any API error, missing
   field, or unparseable output yields `strictMain: true` (fail closed).
4. **Docs.** `.claude/implement-queue.md` § compose rewritten for the
   conditional rule; the gotchas § CI bullets that describe the zone
   rule updated to match.

**Out**

- ADR-023's Decision text; `scripts/zone-vocabulary.mjs` and the
  merge-train lock; branch-protection settings themselves; co-scheduling
  two global (`null`-zone) issues; issues #6633–#6636 / part 5.

## Success criteria

- **SC-1 (default unchanged):** with `strictMain: true` (and when the
  option is omitted), `selectZoneSpreadBatch` output is identical to
  today for every existing test in `scripts/__tests__/issue-zone.test.mjs`.
- **SC-2 (spread when safe):** with `strictMain: false`, three same-zone
  issues with disjoint expected file sets form one batch of three.
- **SC-3 (overlap defers):** with `strictMain: false`, two same-zone
  issues with overlapping expected file sets do NOT share a batch; nor
  do two same-zone issues when either has no extractable paths.
- **SC-4 (fail closed):** an API error reading branch protection yields
  `strictMain: true` at the compose call site.
- **SC-5 (record):** ADR-027 exists and is indexed in
  `docs/adr/README.md`; ADR-023's status line reads amended-by-ADR-027
  and its Decision section is byte-identical.
- **SC-6 (gates):** `pnpm lint`, `pnpm typecheck`, and the affected
  test suites green (`scripts/__tests__/issue-zone.test.mjs`,
  `scripts/__tests__/zone-vocabulary.test.mjs`).

## Non-goals

Raising `maxWorkers`; changing priority ordering (security > ci-fix >
feature > audit); making the selector impure (the probe stays at the
call site).
