---
stage: review
run: maintenance:week-view-service-times
date: 2026-10-26
verdict: changes
assumptions:
  - "Conductor review brief: findings are requested as changes, never fixed here; nothing but this artifact is committed after the review began."
---

# Review: per-service names and times in the Week view

## Scope

The run's commits since `1be92990e` (autorun brief) on
`conductor/b20261027-7749`, i.e. the code diff `6af871b9e..HEAD`
excluding run artifacts, cost markers and regenerated llms files:
16 files, +248/−30. Touched surfaces: `packages/types`
(`availability-config-api.ts` — `DaySummaryServiceSchema` extracted,
`services` added to `AvailabilityDaySummarySchema`, `focusDay` unified),
`services/reservations` (`availability-config-checks.ts` resolver,
`availability-preview.ts` now delegating to `summarizeDay`),
`apps/hospitality` (`day-summary.ts`, `AvailabilityCalendar.tsx` + css,
three i18n catalogs) and their tests. `verification.md` exists (5/5
PASS), so the predecessor gate is satisfied — no inverted order.

## Findings

### Major: `services` is required on `AvailabilityDaySummarySchema`, deviating from architecture.md's "optional" and breaking the client during a deploy-order window

- Scenario: `packages/types/src/schemas/availability-config-api.ts:241`
  declares `services: z.array(DaySummaryServiceSchema)` with no
  `.optional()`, while architecture.md's Decision says "Add an optional
  `services` array" — an undocumented deviation. It has a concrete
  failure: `ApiClient.call` validates every success body against the
  endpoint contract (`packages/api-client/src/client.ts:186` →
  `request`'s `schema.safeParse`, throwing `ApiValidationError`), and
  the hospitality static site (Cloudflare) and reservations-api (DO)
  deploy on separate paths with no ordering guarantee — gotchas.md also
  records CDN-cached bundles and a Deploy Services circuit breaker that
  can hold the API side. A new client bundle calling the old API gets
  day summaries without `services`, `listDays` throws, and the whole
  Availability calendar errors — month view included, not just missing
  week lines. The client code already tolerates absence
  (`apps/hospitality/src/components/availability/day-summary.ts:52`
  reads `summary?.services ?? []`), so `.optional()` costs nothing
  there.
- Standard: none (`docs/standards.json` not present).
- Decision: deferred — change requested. Either make the field
  `.optional()` (server keeps always sending it; if the preview's
  `focusDay` must keep it required, re-extend there), or record the
  deviation and the accepted deploy-order window in architecture.md.

### Minor: `summarizeDay` keys the services list off the display string `label === "Closed"`

- Scenario:
  `services/reservations/src/services/availability-config-checks.ts:126`
  gates `services` on `label === "Closed"`, but `dayLabel` (`:94`)
  returns the schedule's own configured name as the label. A Manager who
  names a schedule "Closed" gets `services: []` for every day it covers,
  so the Week view and the preview's `focusDay` silently drop real
  hours. Converse edge: a windowed venue closure spanning 0–2880 leaves
  `day.services` populated (the engine empties services only for
  unwindowed closures, `packages/availability/src/resolve-day.ts:181`),
  so the payload says `label: "Closed"`, `serviceCount: 2`,
  `services: []` — count and list disagree in one response. Derive the
  closed state structurally (whole-day venue closure band, or
  `day.services.length === 0`) instead of comparing the label string.
  This also changes prior preview behavior: the old `focusDay` mapper
  listed services unconditionally.
- Standard: none.
- Decision: deferred — change requested alongside the major; same file,
  small.

## Passes with no findings

- **Correctness** (beyond the minor above): `minuteText` wraps
  past-midnight closes through the `nextDay` key; loading day and month
  mode return `[]` lines; deleted-service names fall back to the
  resolved day's own name; ordering comes from the engine's resolved
  services. Clean.
- **Security**: no new input surface — the new field is server-produced
  and schema-validated at the client boundary; query bounds on the days
  range are unchanged; no secrets; no injection surfaces. Clean.
- **Complexity**: small diff, no new abstractions, no `lean:` markers
  added, no dead code; `daySummaryServices` is exported and consumed by
  the resolver and its tests. Clean against the cut-list's categories as
  skimmed (headings only — see Verdict).
- **Design** (beyond the major above): the extraction-and-reuse of
  `DaySummaryServiceSchema` matches the stated decision; the week cell
  follows the closure-band precedent; ADR-031 stays reserved and unused,
  consistent with the recorded "No ADR" assumption.
- **ADR compliance**: `adr_status.py` reports 30 ADRs, all standing
  `unrecognized` (repo's own status words; treated as live per the
  reference). Read against the ones the diff reaches: ADR-024 (ISO date
  strings — `serviceDate` unchanged), ADR-029/030 (minutes stay
  venue-local, resolver stays pure over engine output), ADR-001 (cell
  style uses rialto tokens), ADR-028 (strings through app i18n catalogs
  with es-MX/fr-CA parity). No violations. Out of scope: the remaining
  ADRs (auth, routing, deploy topology, RLS, merge policy and similar
  subjects the diff never touches).
- **Domain passes**: none selected — the diff touches no payments,
  migrations or dependency paths (`references/domain-reviewers.md`
  table).
- **Standards**: `docs/standards.json` does not exist; nothing to cite.

## Verdict

Changes requested — one major (required `services` field vs the
documented optional decision, with a real deploy-window failure) and one
minor (label-string gating in `summarizeDay`). Both are small, same-area
edits; route them to Implement and re-verify the schema test plus the
resolver's closed-day cases. Not run or partial, counted fail-closed:
visual/E2E baselines and a live browser walkthrough (already recorded as
not verified in verification.md), the lean cut-list applied from its
headings rather than read in full, and the 25 live ADRs whose subjects
the diff does not reach were not read in full. None of these are claimed
as passes.
