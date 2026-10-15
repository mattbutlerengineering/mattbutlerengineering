---
id: ADR-027
title: Same-Zone Batching Under Non-Strict Main
status: active
date: 2026-10-14
---

# ADR-027: Same-Zone Batching Under Non-Strict Main

> **Amends [ADR-023](ADR-023-merge-train-batch-composition.md)**: adds a
> conditional exception to its one-issue-per-zone rule. ADR-023's Decision
> section is unchanged; this ADR states when and how the rule relaxes.

## Context

[ADR-023: Zone-Spread Merge-Train Batch Composition](ADR-023-merge-train-batch-composition.md)
admits at most one issue per merge-train zone per batch, specifically to
dodge the O(k²) `update-branch`/CI-revalidation tax that
[ADR-016: Green-Main Merge-Gating Policy](ADR-016-green-main-merge-gating.md)'s
`strict` main imposes on stacked same-zone PRs.

That tax is conditional on `strict` actually being `true`. Branch
protection is live repo state, not code (see
`.claude/rules/gotchas.md` § CI), and it has been measured non-strict
twice: `{"strict": false}` on 2026-08-17 and again on 2026-10-14. Under a
non-strict `main`, a PR falling behind while a same-zone sibling merges
does not need `update-branch` or a CI re-run to become mergeable — the
tax ADR-023 exists to avoid does not apply.

Paying ADR-023's one-per-zone cost anyway, while `main` measures
non-strict, leaves workers idle for no safety benefit: at the time of
writing, 14 of 19 `ready` localization issues share one zone and drain
one at a time.

## Decision

**`selectZoneSpreadBatch` gains an explicit `strictMain` option,
defaulting to `true`.** With `strictMain: true` (including whenever the
option is omitted), behavior is exactly ADR-023's original rule — one
issue per zone, full stop.

With `strictMain: false`, a non-global issue whose zone is already
occupied may still be admitted, but only when its expected file set
(extracted via the selector's existing `extractPathsFromBody`) is
**non-empty** and **pairwise disjoint** (prefix-aware — a path and any of
its ancestors/descendants count as overlapping) from every path set
already admitted in that zone. An issue with no extractable paths never
stacks; it is treated as potentially overlapping everything in its zone,
so it still gets one-per-zone treatment. The single-global-slot rule
(`null` zone) is unchanged in both modes, and priority order is still the
input order — zone-spread as tie-breaker still falls out of order
preservation, not reordering.

`strictMain` is resolved once per compose iteration, at the call site,
by a small pure classifier (`scripts/main-strictness.mjs`) wrapping
`gh api repos/…/branches/main/protection/required_status_checks`:
only a successful response whose parsed `strict` field is literally
`false` yields `strictMain: false`. Any API error, non-JSON output, or
missing field yields `strictMain: true` — **fail closed to ADR-023's
original behavior**, the same discipline `classifyBuildFreshness` uses
for "never trust what you can't prove."

### Stale-base mitigation

Admitting more than one same-zone PR into a batch raises, for that zone,
the chance that one lands against a base its sibling hasn't accounted
for. This exposure is not new: it already exists today for any two
concurrent same-zone PRs whenever `main` is non-strict, independent of
how the batch that claimed them was composed. This ADR widens batch
**claiming**, not **merging** — the standing mitigations are unchanged
and still carry the risk: `main`'s push CI, `revert-watchdog`, and,
above all, the per-zone merge-train lock, which still serializes the
merges themselves one at a time regardless of how many same-zone issues
a batch claimed.

## Consequences

- **Benefits:** same-zone backlog clusters (the common case observed
  here) drain with parallel workers instead of one-per-batch, with no
  new merge-time risk — the merge-train lock was already the thing
  making same-zone merges safe, not the batch-composition rule.
- **Trade-offs:** disjointness is estimated from issue text, the same
  estimation risk ADR-023 already accepts for zone assignment. A
  mis-estimated overlap is bounded by the same safety net ADR-023 relies
  on — the per-zone lock still serializes the actual merges, so a wrong
  estimate costs throughput (a missed spread, i.e. today's status quo),
  never correctness.
- **Coupling:** the relaxed rule is now conditioned on live branch-protection
  state in addition to the backlog's zone shape. A `main`
  re-strictified later (ADR-016 is unchanged) silently reverts batch
  composition to ADR-023's original one-per-zone behavior with no code
  change required — that is the fail-closed design working as intended,
  not a gap.

## Alternatives Considered

### Always allow same-zone batching, regardless of `strict`

Rejected: this reintroduces the exact O(k²) `update-branch`/CI tax
ADR-023 was written to eliminate, the moment `main` is re-strictified.

### Estimate zone-only and skip the per-same-zone-pair disjointness check

Rejected: two same-zone issues that both touch the same files would be
admitted into the same batch with no signal that their workers' changes
are likely to conflict at merge time — strictly worse than ADR-023's
status quo for that pair, for no benefit over the proposed check, which
is no more expensive.

### Fold this into ADR-023 directly instead of a separate ADR

Rejected for this change: ADR-023's Decision text is the known-good,
load-bearing description of the original rule, cited elsewhere (the
implement-queue skill doc, the gotchas file). Amending it in place risks
rewriting a sentence that other documents quote. A separate ADR records
the new rule and the condition it's gated on without disturbing that
text; ADR-023 only gains a pointer to it.

## See Also

- **ADR-023**: Zone-Spread Merge-Train Batch Composition — the rule this
  ADR conditionally relaxes.
- **ADR-016**: Green-Main Merge-Gating Policy — the origin of the
  `strict`-main constraint this rule is conditioned on.
- **Issue #6640**: the originating issue.
