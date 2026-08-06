---
id: ADR-024
title: Unified ISO-String Date-Value Vocabulary (Calendar/DatePicker/DateRange)
status: active
date: 2026-08-06
---

# ADR-024: Unified ISO-String Date-Value Vocabulary (Calendar/DatePicker/DateRange)

## Context

Rialto's date family shipped in two PRs, four days apart, under two different API decisions:

- **`Calendar`/`DatePicker`** (issue #3336, PR #3367, merged 2026-07-11) implemented the
  original #3196 decision (2026-07-10 comment): _"Value shape: `string | null` — an ISO
  `yyyy-mm-dd` calendar date. No `Date` objects in the public API (no timezone footguns,
  trivially serialisable)."_
- **`DateRange`** (issue #3288, PR #3435, merged 2026-07-12) implemented a **later** #3196
  comment (2026-07-12 06:45, titled "API decision delegated to implementing agent"):
  _"Value shape: `Date | null` for single; `{ start: Date | null; end: Date | null }` for
  range... following prevailing headless-UI conventions (react-aria / Radix)."_ That
  delegation comment explicitly allowed deviation ("Deviations from the above are fine if
  justified in the PR body") — it was a suggested default, not a hard mandate, and
  PR #3435 itself flags the resulting inconsistency under a "Deviations (justified)"
  heading: _"`Date` objects in the public API, per the binding 2026-07-12 API decision on
  #3196 — even though shipped Calendar/DatePicker speak ISO strings."_

The result: `Calendar`/`DatePicker` take `value: string | null`; `DateRange` takes
`value: { start: Date | null; end: Date | null }`. Issue #3436 filed this split as a
reviewer nit. Issue #3437 (DateRangePicker, Popover + DateRange) is blocked on resolving it
— it can't decide its own value shape until this ADR settles the boundary.

### Verified current state (read directly from source, not from issue prose)

- `packages/rialto/src/components/Calendar/Calendar.tsx` — `CalendarProps.value: string | null`
  (ISO `yyyy-mm-dd`), `min?: string`, `max?: string`, `isDateDisabled?: (isoDate: string) => boolean`.
- `packages/rialto/src/components/DatePicker/DatePicker.tsx` — same ISO-string shape,
  composes `Popover` + `Calendar`.
- `packages/rialto/src/components/DateRange/DateRange.tsx` — `DateRangeValue = { start: Date
| null; end: Date | null }`, `min?: Date`, `max?: Date`, `isDateDisabled?: (date: Date) =>
boolean`. Critically, `DateRange`'s **internal** implementation converts `Date ⇆ ISO` at
  its own boundary (`dateToIso`/`isoToDate`) and then reuses the exact same ISO-based
  `date-grid.ts` grid machinery that `Calendar` uses — the component's core logic already
  speaks ISO; `Date` exists only as a thin adapter layer wrapping it at the public prop
  boundary.

### Consumer-impact grep (verified, not assumed)

Grepping `apps/**/*.{ts,tsx}` for the actual `DateRange`/`Calendar`/`DatePicker` component
imports (as opposed to unrelated same-named identifiers):

- `apps/hospitality` has **zero** imports of any of the three components. Its
  `enableDateRange` prop (`DatePartySelector.tsx`, `BookingWidget.tsx`) is an unrelated
  boolean flag name, and `apps/rialto-web/src/data/tapechart-fixtures.ts`'s
  `defaultDateRange()` is an unrelated fixture helper for the tape-chart demo — neither
  touches the rialto `DateRange` component.
- The **only** real consumer of the `DateRange` component (`<DateRange>`, `DateRangeValue`)
  is `apps/rialto-web/src/pages/forms/DateRangePage.tsx` — the package's own showcase page.
- `Calendar`/`DatePicker` are likewise consumed only by rialto-web showcase pages
  (`DatePickerPage.tsx`, `BookingWizardExamplePage.tsx`).

No production app has any code path that would break from a prop-type change to any of the
three components today.

## Decision

**Migrate `DateRange` to the ISO `yyyy-mm-dd` string vocabulary, matching
`Calendar`/`DatePicker`. Option (a).**

`DateRangeValue` becomes `{ start: string | null; end: string | null }`; `min`/`max` become
`string`; `isDateDisabled` becomes `(isoDate: string) => boolean` — the same shapes
`Calendar`/`DatePicker` already expose. The migration (issue #3839) deletes `DateRange`'s
`dateToIso`/`isoToDate` boundary-adapter functions rather than adding new ones, since the
component's internals are already ISO-native.

### Why this overrides the 2026-07-12 delegation's suggested default

The task brief for this ADR defaults to option (a) "absent contrary evidence in #3196." The
2026-07-12 delegation comment is contrary evidence on its face — it explicitly recommends
`Date`-based values. This ADR follows the evidence rather than rubber-stamping the default,
and still lands on (a), for four reasons:

1. **The delegation was non-binding by its own text.** It handed the API decision to the
   implementing agent ("no longer HITL... the implementing agent picks the API surface")
   and explicitly sanctioned deviation ("Deviations from the above are fine if justified in
   the PR body"). It was a suggested reference default, not an override of the already-
   shipped `Calendar`/`DatePicker` contract.
2. **`Calendar`/`DatePicker` shipped first (2026-07-11) and are unaffected.** The delegation
   comment postdates their merge by a day; nothing in it proposes reopening #3336/PR #3367.
   Treating the newer `DateRange` PR as silently redefining an already-shipped sibling API
   is a bigger, unreviewed change than the ADR process is meant to slip through.
3. **The cited "prevailing headless-UI convention" justification is weaker than stated.**
   react-aria — one of the two libraries #3196 cites — does not actually use raw JS `Date`
   in its public date APIs; it uses its own timezone-safe `CalendarDate` value object
   specifically to avoid the footguns the _original_ 2026-07-10 ISO decision was already
   avoiding. Raw `Date | null` does not faithfully replicate the convention it was invoked
   to justify.
4. **ISO is the lower-cost convergence point.** Two of three components already ship ISO;
   `DateRange`'s own grid math is ISO under the hood; and per the consumer grep above, the
   only real consumer of any of the three components is a rialto-web showcase page — so
   there is no external-consumer cost differential between the two directions, only an
   internal-code-simplicity one, and ISO wins that by deleting an adapter rather than adding
   one.

This does not repudiate the 2026-07-12 comment as wrong — react-aria/Radix-style convenience
APIs are a legitimate design point — it says that comment's specific recommendation (raw
`Date`) was superseded by shipped reality before this ADR, and the balance of evidence now
favours consolidating on the vocabulary two of three components already carry.

### Consumer impact

- **`apps/hospitality`**: no impact — verified zero imports of `DateRange`/`Calendar`/
  `DatePicker` (see grep above).
- **`apps/rialto-web`**: `DateRangePage.tsx` (`packages/rialto`'s own showcase) constructs
  `DateRangeValue` with `new Date(...)` literals and formats via `Intl.DateTimeFormat`; it
  will need updating to ISO strings. In scope for the catalog/docs update, issue #3840 (part
  3 of this chain), not this ADR.
- **Changeset**: required. `DateRangeValue`'s `start`/`end` fields, `min`/`max`, and
  `isDateDisabled`'s parameter all change type — a breaking prop-signature change for
  `@mattbutlerengineering/rialto`. The migration issue (#3839) adds a `major`-type changeset
  (per changesets convention; `packages/rialto` is pre-1.0 at `0.2.0`, where semver treats a
  `major`-flagged changeset as a minor bump — see `.changeset/` for the existing pattern).

### Migration plan (executed in #3839)

1. Change `DateRangeValue`, `DateRangeProps.min`/`max`, and `isDateDisabled`'s parameter type
   from `Date` to `string` (ISO `yyyy-mm-dd`).
2. Delete `dateToIso`/`isoToDate` and the `Date ⇆ ISO` boundary conversion in
   `DateRange.tsx` — the internal grid code already consumes ISO strings directly from
   `date-grid.ts`; the adapter layer becomes dead code.
3. Update `DateRange.test.tsx` fixtures from `Date` literals to ISO strings.
4. Add a changeset (`major`) documenting the breaking prop-type change.
5. Update `apps/rialto-web/src/pages/forms/DateRangePage.tsx` to construct/format ISO
   strings instead of `Date` objects (or defer to #3840 if that issue owns showcase-page
   updates — coordinate at implementation time).
6. `packages/rialto` gates (lint/typecheck/test) plus `check-adr`/`check-deps` green.

This ADR does **not** perform the migration — that is #3839. This ADR does not touch the
catalog/docs (#3840) or build `DateRangePicker` (#3841).

## Consequences

**Positive**

- One value vocabulary across the entire date family — external design-system evaluators
  (`PRODUCT.md`'s stated target user for `packages/rialto`) see a consistent contract instead
  of two, closing the exact rough edge #3436 was filed to fix.
- `DateRange`'s implementation gets simpler, not more complex — the `Date ⇆ ISO` adapter is
  deleted, not extended; the component's core logic already speaks ISO.
- `DateRangePicker` (#3437/#3841) can compose `Popover` + `DateRange` with the same ISO
  contract `DatePicker` already uses — no new adapter needed at that layer either.
- No production consumer breakage — verified zero `apps/hospitality` usage.

**Negative / trade-offs**

- Breaking prop-type change to `DateRangeValue`/`DateRangeProps` for
  `@mattbutlerengineering/rialto` — requires a changeset and touches the rialto-web showcase
  page that already renders it.
- `DateRange`'s public API had exactly one PR's worth of life (2026-07-12 → this ADR) before
  changing again — a second churn on the same surface, avoidable only by having settled this
  boundary before #3435 merged.
- Overrides a maintainer-authored comment on #3196. Recorded here explicitly, with the
  evidence, so the override is auditable rather than silent; still subject to review/veto
  through the normal PR process for #3839.

## Alternatives Considered

### (b) ISO-string adapters on top of the `Date` API

Keep `Date`-typed public props (matching `DateRange`'s current shape and the 2026-07-12
delegation) and add ISO-string adapter components/hooks for `Calendar`/`DatePicker`-style
consumers, or vice versa. Rejected: this converges on `Date` as the canonical type across the
family, which requires retrofitting `Calendar` and `DatePicker` — the two components that
shipped first, are more heavily used in showcase code today (`DatePickerPage.tsx`,
`BookingWizardExamplePage.tsx`), and whose original ISO rationale (no timezone footguns,
trivial serialisation to JSON/query-string/HTML `<input type="date">`) still holds. It is
strictly more migration surface than (a) for no consumer-facing benefit, since the grep above
shows no real consumer depends on either shape today.

### (c) Document the split as an intentional, unrelated boundary (inline primitives use `Date`, field widgets use ISO)

Rejected on the evidence: #3196's own comment history shows this was not an intentional
boundary rule — it was two different decisions applied to two components shipped two days
apart, and PR #3435 itself labels the `Date` choice a "deviation" from the shipped ISO
precedent, not a deliberate inline-vs-field-widget split. There is no comment anywhere in
#3196/#3436/#3437 proposing "primitives use `Date`, field widgets use ISO" as a rule — that
framing does not match what the components actually do either, since `Calendar` (an inline
primitive) already uses ISO strings, the same as `DatePicker` (a field widget). Documenting a
split that isn't actually keyed to inline-vs-field-widget would misdescribe the codebase.

### Keep `DateRange` on `Date`, migrate `Calendar`/`DatePicker` to `Date` instead

Not one of the three options in scope for this ADR, but considered given the 2026-07-12
delegation's stated preference. Rejected for the reasons in "Why this overrides the
2026-07-12 delegation's suggested default" above: it is the higher-migration-cost direction
(two shipped components instead of one), it re-adds the timezone/serialisation footguns the
original ISO decision was written to avoid, and the "prevailing headless-UI convention" cited
to justify it does not hold up against react-aria's actual `CalendarDate` value-object
approach.

## See Also

- [#3196](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3196) — DatePicker/Calendar API decision + implementation (original ISO decision, later delegation comment)
- [#3436](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3436) — Reconcile date-value vocabulary (this ADR's source issue)
- [#3437](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3437) — DateRangePicker, blocked on this decision
- [#3839](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3839) — Implements the migration this ADR specifies (part 2/4)
- [#3840](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3840) — Catalog/docs update for all three components (part 3/4)
- [#3841](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3841) — DateRangePicker built on the unified vocabulary (part 4/4)
