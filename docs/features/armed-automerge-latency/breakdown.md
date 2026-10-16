---
stage: decompose
run: feature:armed-automerge-latency
date: 2026-10-15
assumptions:
  - "Work-order ids WO-46..WO-49 are taken in order from this item's reserved block (wo 46-55); wo 50-55 go unused."
  - "Tracker mirror: all items mirror the one existing issue #6651 (ADR-0026 import, no new issues created); #6651 closes at the implementation PR."
  - "WO-47 and WO-48 are mutually exclusive by design (PRD R2): WO-46's evidence selects exactly one, and the other is checked off as 'not selected — see WO-46 finding' rather than left dangling. A breakdown row that can be legitimately closed without code is recorded here so Implement's every-checkbox rule stays meaningful."
  - "Ordering is strict dependency order: evidence (WO-46) gates the remedy (WO-47 xor WO-48), which gates the in-the-wild observation (WO-49). WO-46..48 execute only in a GitHub-credentialed session; nothing here is executable from the planning worktree."
---

# Breakdown: armed auto-merge completion

Progress lives in the checkboxes — Implement checks items off as acceptance
criteria are met, test-first per repo mandate where code ships. Stage gate:
this run stops here (`stop-after: decompose` in the brief); the items below
belong to a later, credentialed Implement session.

## Milestone 1: evidence

- [ ] **WO-46 — capture and classify #6577's hold** — run architecture § 1's
      evidence procedure verbatim (timeline, `merged_by`/`auto_merge`,
      check runs **and** commit statuses on the final head SHA, workflow-run
      history across 2026-10-13T22:10Z → 2026-10-14T22:20Z,
      `node scripts/ci-gate-status.mjs 6577`); match the signature against
      architecture § 2's table top-down; post the root-cause statement with
      run IDs/timestamps as a comment on issue #6651 (PRD R1, R4). AC: the
      comment names who merged, when `CI Gate` first went green in the
      rollup, and the selected remedy row. (tracker: #6651)

## Milestone 2: remedy — exactly one of WO-47 / WO-48 ships

- [ ] **WO-47 — code fix for the named mechanism** (only if WO-46 selects a
      repo-owned mechanism) — implement that row's remedy from architecture
      § 2, RED first: a unit test pinning the failing case (pure function in
      `scripts/merge-queue-eligibility.mjs` / `scripts/rescue-automation-prs.mjs`,
      or a real-YAML workflow test per `scripts/__tests__/merge-queue-tier-race.test.mjs`),
      then the minimal fix to GREEN. Review gates unweakened (PRD R3);
      gates: `pnpm lint && pnpm typecheck && pnpm test` on affected
      packages. AC: regression test fails on pre-fix code, passes on the
      fix. (tracker: #6651)
- [ ] **WO-48 — gotchas entry for an intended/one-off hold** (only if WO-46
      selects the last table row) — add a `.claude/rules/gotchas.md` § CI
      bullet carrying the discriminating signature (timestamps, run IDs,
      what to query next time) and the explicit statement that armed
      Dependabot PRs have **no rescue path** (`automation-pr-rescue.yml`
      sweeps `automation/*` + `auto-merge` label only). AC: entry matches
      the house style (measured, cites evidence, names the fast triage
      check). (tracker: #6651)

## Milestone 3: confirmation in the wild

- [ ] **WO-49 — observation criterion** — after the remedy lands, watch the
      next armed Dependabot auto-merge PR (part 7's groups arm them on
      open): it must merge within one CI cycle of `CI Gate` going green on
      its head SHA, with no human action after green (PRD R5 reading, prd.md
      assumptions). Note that PR's number on issue #6651 and close #6651.
      If it stalls again, reopen at WO-46 with the new PR as the specimen —
      do not stack a second remedy without fresh evidence. (tracker: #6651)

## Notes

- All four items need GitHub API access; none are executable from this
  planning worktree (no credential). WO-46's commands are fully specified
  in `architecture.md` § 1 so the Implement session starts without
  re-deriving context.
- Out of scope regardless of finding: tier policy, part 7's policy module
  and groups, merge-queue redesign (PRD non-goals).
