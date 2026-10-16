---
stage: decompose
run: feature:zone-batch-nonstrict-main
date: 2026-10-14
assumptions:
  - "Four items from the reserved WO 26-35 block; no tracker export per the brief (no (tracker: #N) refs — #6640 stays Conductor-owned and must not auto-close at an Implement boundary)."
---

# Breakdown: zone-batch-nonstrict-main

Ordered; each agent-sized and independently verifiable. WO ids from the
reserved block (26-35). Every item: TDD (failing test first), `pnpm lint`

- `pnpm typecheck` + affected tests green before done; worktree agents
  run `pnpm install --frozen-lockfile` first.

## Work items

- [x] **WO-26: ADR-095 amending ADR-023** — Write
      `docs/adr/ADR-095-same-zone-batching-under-nonstrict-main.md`
      (status `provisional`, repo ADR shape; see ADR-025 for an
      amendment example): the conditional rule, the fail-closed probe,
      and the stale-base mitigation per `architecture.md` § Design 4.
      Set ADR-023's status line to `amended by ADR-095` — its Decision
      section stays byte-identical. Add the README.md index row.
      Acceptance: SC-5; `check-adr` green.
- [x] **WO-27: selector `strictMain` option** — In
      `scripts/issue-zone.mjs`, extend `selectZoneSpreadBatch` per
      `architecture.md` § Design 1 (occupied zone → admitted path sets;
      prefix-aware pairwise disjointness via `extractPathsFromBody`;
      empty path sets never stack; global slot unchanged). Tests first in
      `scripts/__tests__/issue-zone.test.mjs`: default-unchanged (run the
      existing suite untouched), three disjoint same-zone → one batch,
      overlapping pair → deferred, pathless same-zone pair → deferred,
      global pair → still single slot. Acceptance: SC-1, SC-2, SC-3.
- [x] **WO-28: fail-closed strict probe** — New
      `scripts/main-strictness.mjs`: pure `classifyMainStrictness()`
      (only a parsed literal `strict: false` yields
      `strictMain: false`; error/non-JSON/missing field → `true`) + thin
      CLI wrapping `gh api`. Unit tests in
      `scripts/__tests__/main-strictness.test.mjs` cover the four input
      shapes. Acceptance: SC-4.
- [x] **WO-29: wire the compose hook + docs** — Rewrite
      `.claude/implement-queue.md` § compose: run the WO-28 probe each
      iteration, pass `{ maxWorkers: 3, strictMain }` to
      `selectZoneSpreadBatch`; update the gotchas § CI bullets that
      describe the zone rule (one-per-zone is now the strict/fail-closed
      mode, spread-with-disjoint-scopes the measured-non-strict mode).
      Acceptance: SC-6 full-gate sweep (`pnpm lint`, `pnpm typecheck`,
      `pnpm exec vitest run --config scripts/vitest.config.mjs
scripts/__tests__/issue-zone.test.mjs
scripts/__tests__/zone-vocabulary.test.mjs
scripts/__tests__/main-strictness.test.mjs`); docs name
      `main-strictness.mjs` and ADR-095 consistently.

## Notes

- Blueprint gate: this run stops here (`stop-after: decompose`).
  Implement is dispatched by the Conductor only after Matt approves the
  policy change (issue filed without `ready` on purpose).
- Reserved ids spent: ADR-095, WO-26..29. Unspent: ADR 96-97, WO 30-35,
  returned to the block.
