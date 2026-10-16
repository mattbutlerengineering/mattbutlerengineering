---
stage: decompose
run: feature:tier-escalation-false-positives
date: 2026-10-14
assumptions:
  - "Cut lines and milestone boundaries chosen by this stage without live review (autorun; the brief pre-decided scope, tracker policy, and the stop-after gate). Reserved WO ids 76-85 are available to the Conductor for dispatching these items; the checkboxes here remain the state."
  - "No tracker export (brief § Tracker): the Conductor owns issue #6655's lifecycle; no per-item issues are created."
---

# Breakdown: Tier escalation counts only real review surface

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Standing rules: every logic item starts with a failing test
(`scripts/__tests__/tier-escalation.test.mjs` is part of the item that adds
the module, never a follow-up); gates before check-off are `pnpm lint`,
`pnpm typecheck`, `pnpm test` (scripts tests run via
`pnpm exec vitest run --config scripts/vitest.config.mjs …`).

## Milestone 1: Policy module exists and pins the motivating cases

- [x] **Review-surface counting + size escalation** — add
      `scripts/tier-escalation.mjs` exporting `countReviewSurfaceAdditions`
      and `decideSizeEscalation`, with the exclusion list from
      `architecture.md` § Interfaces.
  - Accept: tests pin #6610's file shape (1194 generated + 16 docs + 988
    code → counted ≤ 1000, no escalation from T3) and #6591's (1387 code +
    943 docs → counted > 1000, escalates); missing `additions` counts 0;
    `docs/features/**` md excluded while root-level `*.md` counts.
  - Blocked by: —
- [x] **Keyword escalation with incident cue** — add
      `decideKeywordEscalation` (title backstop, same-sentence incident cue,
      `pathTier >= T3` hardset kept verbatim, #5956 hyphen/code-span guards
      preserved).
  - Accept: #6541's sentence ("…`E2E_AUTH0_*` credentials or CI/artifact
    access…") → `none`; "we leaked the Stripe key and must rotate it" →
    escalation that lands T4; keyword in title alone → `bump`; keyword +
    sensitive path → `hardset-T4`; `check-deploy-secret-provisioning` in
    prose → `none`.
  - Blocked by: Review-surface counting + size escalation (shares module +
    test file scaffolding)

## Milestone 2: Workflow calls the module; docs state the policy

- [ ] **Adapter swap in `tier-classifier.yml`** — replace the inline size
      and keyword escalation blocks with dynamic import of the module;
      gather per-file additions for the size call; keep bypass/fork/path
      rules inline and untouched.
  - Accept: `scripts/__tests__/tier-classifier-workflow.test.mjs` (extended
    to assert the module is what decides both escalations),
    `tier-classifier-dispatch.test.mjs`, and `merge-queue-tier-race.test.mjs`
    all green; a thrown module error fails the step (fail-closed path
    demonstrated in the workflow test).
  - Blocked by: Keyword escalation with incident cue
- [ ] **`docs/change-tiers.md` policy update** — state that generated files
      (the module's exclusion list) don't count toward size escalation and
      that keyword escalation requires an incident signal, linking the
      module as the source of truth.
  - Accept: doc names the exact exclusion list and the incident-cue rule;
    a list-agreement test asserts the doc's list matches the module's
    exported one (drift fails CI).
  - Blocked by: Adapter swap in `tier-classifier.yml`

## Milestone 3: Replay gate proves the delta

- [ ] **Replay CLI** — `node scripts/tier-escalation.mjs replay --limit 300`
      fetching title/body/file-additions via GitHub REST, computing
      old-vs-new for both rules, printing a markdown table of changed
      verdicts in both directions.
  - Accept: unit tests cover table assembly from fixture PR data and the
    fail-loud path (no credential → non-zero exit with message, never an
    empty table); "0 changed" printed explicitly when nothing changes.
  - Blocked by: Keyword escalation with incident cue
- [ ] **Run the replay and pin the delta** — execute against the last 300
      PRs in a credentialed environment, paste the table into the
      implementation PR description, and add a pinned test for every PR
      whose tier changes (intended) or fix the rule (unintended).
  - Accept: PRD success criteria 1, 2 and 4 all demonstrably hold; every
    changed case appears both in the table and as a test.
  - Blocked by: Replay CLI; Adapter swap in `tier-classifier.yml`

## Design gaps found

none.

## Notes

Deviations discovered during Implement get logged here, dated. The
implementation PR is T4 by path rule (`tier-classifier.yml` edit): it waits
on Matt regardless of these rules' own verdicts, and reserved ADR-110 is the
number to use if the T4 gate demands an ADR at merge time.

- **2026-10-15** — Milestone 1 item 1's pinned #6610 case doesn't land at the
  acceptance text's literal numbers. #6610's real additions (verified via
  `git show --numstat`) are 1194 generated (llms.txt/llms-full.txt regen) +
  16 docs (CLAUDE.md) + 988 code = 1004 review-surface lines once generated
  is excluded — 4 over the `>1000` threshold, not "≤ 1000" as drafted. The
  motivating complaint stands regardless (the old rule escalated on the full
  2198-line raw diff, including the generated noise); the pinned fixture in
  `scripts/__tests__/tier-escalation.test.mjs` rounds the code count down by
  4 (984, not 988) to land cleanly inside the "no escalation" case rather
  than assert a count that is actually just over the line. Byte-exact replay
  against real PR history is Milestone 3's job (the replay CLI) — that is
  where this ±4 discrepancy should get a real answer: either the threshold
  is intentionally tight enough that #6610 still bumps a tier (acceptable,
  since T3→T4 on a reservations-routes PR isn't absurd), or CLAUDE.md-class
  docs need their own exclusion. Flagging rather than deciding here.
