---
stage: architect
run: feature:zone-batch-nonstrict-main
date: 2026-10-14
ux: skipped — no user-facing surface (per prd.md)
adr: ADR-027 (reserved as ADR-095; renumbered at merge because check-adr requires gap-free ids)
assumptions:
  - "Disjointness is computed over extractPathsFromBody()'s path sets with prefix-aware comparison (a path and any of its ancestors/descendants overlap), reusing the module's existing extraction rather than a second parser."
  - "The strict probe is a small pure-classifier script (scripts/main-strictness.mjs) wrapping `gh api`, mirroring the repo's pure-decision + thin-wrapper pattern (ci-gate-status, merge-queue-eligibility), rather than inline jq in the skill doc — testable fail-closed behaviour needs a unit seam."
---

# Architecture: zone-batch-nonstrict-main

Paragraph scale. Three seams, all existing.

## Design

1. **Selector** (`scripts/issue-zone.mjs`). `selectZoneSpreadBatch`
   gains `strictMain = true` in its options object. The loop keeps one
   `occupied` map, now zone → array of admitted issues' path sets.
   Admission for a non-global issue whose zone is occupied (only
   reachable when `strictMain === false`): its extracted path set must be
   non-empty and pairwise disjoint (prefix-aware) from every path set
   already admitted in that zone. Empty/unextractable path sets never
   stack. Priority order is still the input order; a new zone is taken
   whenever the candidate order offers one (zone-spread as tie-breaker
   falls out of order preservation — no reordering is introduced).
   `null` zone keeps the single global slot in both modes. Pure, no I/O.
2. **Strict probe** (`scripts/main-strictness.mjs`, new).
   `classifyMainStrictness(output, error)` → `{ strictMain: boolean }`:
   only a successful `gh api repos/…/branches/main/protection/
required_status_checks` response whose parsed `strict` is literally
   `false` yields `strictMain: false`; any error, non-JSON, or missing
   field → `true`. CLI entry prints JSON for the compose hook. Fail
   closed = fail to today's behaviour, same discipline as
   `classifyBuildFreshness` (never trust what you can't prove).
3. **Compose hook** (`.claude/implement-queue.md` § compose). Runs the
   probe each iteration (branch protection is repo _state_, not code —
   gotchas § CI), passes `{ maxWorkers, strictMain }` to the selector.
4. **Policy record.** ADR-027 amends ADR-023: Decision = the rule in (1)
   gated by (2)/(3); ADR-023 status line → `amended by ADR-027`, Decision
   section untouched. Stale-base mitigation stated: the exposure exists
   today for any concurrent PRs under non-strict main regardless of
   batching; the standing mitigations are main's push CI,
   `revert-watchdog`, and the per-zone merge-train lock still serializing
   the merges themselves — this ADR widens _claiming_, not _merging_.
   Written `provisional` (no live user confirmation in this run), with
   docs/adr/TEMPLATE.md shape and a README.md index row.

## Decisions (one-liners, no ADR each)

- Reuse `extractPathsFromBody` — no second parser to drift (same rule
  that put `issueZone` on `zone-vocabulary.mjs`).
- Probe lives at the call site; selector stays pure (PRD non-goal).
- Reserved ADR-095 renumbered to ADR-027 at merge: `check-adr` rejects gaps in ADR ids.

## Risks

Mis-estimated path sets can overlap in reality; the cost is bounded —
the merge-train zone lock still serializes same-zone merges, and main's
push CI + revert-watchdog catch a bad merge result. A missed spread
(over-deferral) is just today's throughput.
