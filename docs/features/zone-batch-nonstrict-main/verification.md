---
stage: verify
run: feature:zone-batch-nonstrict-main
date: 2026-10-15
---

# Verification: zone-batch-nonstrict-main

All four work items (WO-26 ADR, WO-27 selector, WO-28 fail-closed probe,
WO-29 compose-hook wiring) are implemented on `conductor/b20261014c-6640`.
Checked each PRD-3 success criterion against the actual code/tests/docs,
not against the breakdown's own `[x]` marks.

## Gate

`bash scripts/conductor-gate.sh` — green: lint, typecheck, and the full
`scripts` test suite (**282 files / 5257 tests**, all passed, turbo-cached).
Also ran the WO-29-named subset directly
(`pnpm exec vitest run --config scripts/vitest.config.mjs
scripts/__tests__/issue-zone.test.mjs scripts/__tests__/zone-vocabulary.test.mjs
scripts/__tests__/main-strictness.test.mjs`): **84/84 passed**
(issue-zone 65, zone-vocabulary 12, main-strictness 7).

## SC-1 (default unchanged)

`selectZoneSpreadBatch(candidates, { maxWorkers, strictMain = true })` —
default parameter is `true`, and the strict-mode branch (`if (strictMain)
continue;`, `scripts/issue-zone.mjs:445`) is byte-for-byte the pre-existing
one-per-zone logic. Test "default is unchanged: same-zone surplus with
disjoint paths is still deferred when strictMain is omitted"
(`scripts/__tests__/issue-zone.test.mjs:279`) asserts the omitted-option
and explicit-`true` cases produce the same deferral. **Pass.**

## SC-2 (spread when safe)

Test "three disjoint same-zone issues batch together when strictMain is
false" (`issue-zone.test.mjs:299`) — three same-zone issues with pairwise
disjoint `extractPathsFromBody` path sets all land in one batch of three.
**Pass.**

## SC-3 (overlap defers)

Two tests: "overlapping same-zone pair is deferred even when strictMain is
false" (`issue-zone.test.mjs:320`) and "pathless same-zone issue is
deferred even when strictMain is false" (`issue-zone.test.mjs:336`) — an
overlapping path set, and an issue with no extractable paths, both fail to
stack (`candidatePaths.size === 0` early-continue at `issue-zone.mjs:448`;
`pathSetsDisjoint` prefix-aware overlap check at `issue-zone.mjs:450-453`).
A fourth test confirms the global slot stays single-occupancy in
non-strict mode too. **Pass.**

## SC-4 (fail closed)

`classifyMainStrictness` (`scripts/main-strictness.mjs`) only returns
`strictMain: false` on a successfully parsed, literal `strict === false`.
Every other input — `gh api` error, non-JSON body, missing `strict` field,
non-boolean/non-`false` value — returns `strictMain: true`. Seven unit
tests (`scripts/__tests__/main-strictness.test.mjs`) cover all four named
input shapes plus two extra edge cases (`strict:true`, a truthy string
`"false"`) and a reason-string invariant; all pass. The CLI wrapper
(`run()`) catches any `execFileSync` throw and feeds the caught error into
the same pure classifier, so a real `gh api` failure reaches the same
fail-closed path as the unit tests exercise directly. **Pass.**

## SC-5 (record)

- `docs/adr/ADR-095-same-zone-batching-under-nonstrict-main.md` exists
  (status `active`), and `docs/adr/README.md` lists it with the correct
  path and date.
- `docs/adr/ADR-023-merge-train-batch-composition.md` frontmatter keeps
  `status: active` and adds `amended_by: ADR-095`, plus an inline callout
  banner ("Amended by ADR-095 ... without changing the Decision stated
  here"); `docs/adr/README.md`'s ADR-023 row reads `amended (by ADR-095)`.
  The breakdown's literal phrasing ("status line to `amended by
ADR-095`") is satisfied via the README index row + the new
  `amended_by` field rather than overwriting the `status:` value itself —
  this is the only precedent for an ADR amendment in this repo, so there
  was no existing convention to diverge from, and it keeps `status:
active` true (ADR-023's Decision is still in force, merely
  conditioned).
- Diffed ADR-023's `## Decision` section against its pre-WO-26 git history
  (`f2bd2442a`'s parent) — unchanged aside from the new callout line
  immediately after the title, which sits outside `## Decision`. **Pass.**

## SC-6 (gates)

Covered under "Gate" above — lint, typecheck, and both named test files
(plus `main-strictness.test.mjs`) are green. **Pass.**

## Residual note (not a PRD gap)

`check-adr`'s structural rule flags the ADR-027..094 numbering gap
inherent to this run's reserved-ID-block scheme; WO-26's own commit
message documents this as expected, not a regression, and the sanctioned
gate (`conductor-gate.sh`) does not run that structural check — the full
`scripts` suite it does run is green. No action needed.

## Verdict

All six PRD-3 success criteria pass with evidence. WO-26 through WO-29 are
complete and gate-verified. Ready to ship.
