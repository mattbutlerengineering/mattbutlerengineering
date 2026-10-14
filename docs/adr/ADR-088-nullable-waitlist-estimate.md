# ADR-088: Waitlist wait estimate is nullable end to end

- **Status:** provisional (written unattended in autorun maintenance run
  `waitlist-estimate-null`, pending Owner review at the blueprint gate)
- **Date:** 2026-10-13

## Context

#6556 computes waitlist wait estimates from live table turnover; the
estimator honestly returns `number | null` (null = no table can seat the
party, or every fitting table is blocked). But `waitlist_entries.
estimated_wait_minutes` is `Int NOT NULL`, the API schemas and
`@mbe/types` declare `number`, so the service bridges the gap with
`?? 0` — and guests are told "0 min wait" precisely when no estimate
exists (issue #6580).

## Decision

`estimatedWaitMinutes` is `number | null` at every layer: Prisma column
`Int?` (DROP NOT NULL migration, no backfill), `@mbe/types` and zod/JSON
response schemas nullable, service stores and returns the estimator's
value uncoerced, SMS and widget render null as "estimate unavailable".

Rejected alternatives:

- **Sentinel value (`-1`/`0`)** — keeps the column NOT NULL but every
  consumer must know the magic number; the current defect is exactly this
  failure with `0`.
- **Keep stored `0`, fix only the render** — leaves the lie in the data;
  staff lists and future consumers re-surface it.
- **Drop the column (compute-only)** — loses the join-time estimate the
  entry record and staff list rely on, and widens the blast radius for no
  guest-visible gain.

## Consequences

- Public API consumers of the join response and
  `/public/v1/venues/:slug/waitlist/status` must handle `null` —
  this is the one-way-ish part: re-tightening to NOT NULL later needs a
  backfill and a consumer sweep.
- NULL propagates correctly through the legacy position-rescale SQL
  (`estimated/position × position` on NULL stays NULL).
- "No estimate" becomes observable and testable instead of aliasing the
  busiest-night answer to "0 min".
