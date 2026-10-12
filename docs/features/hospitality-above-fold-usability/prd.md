---
stage: prd
run: feature:hospitality-above-fold-usability
date: 2026-10-11
prd-id: 1
ux: required
assumptions:
  - "Primary content defined per page as the element a staffer came to use: data table/list (Reservations, Guests, Waitlist), canvas (Floor Plans, Timeline), form (Settings, Setup) — brief names the category, page mapping is the audit's output."
  - "Pages measured at 1366×768 CSS pixels, default zoom, signed-in state with seeded demo data — the staff-laptop case the brief names."
  - "Public pages (PublicBookingPage, ManageReservationPage) included in the audit but fixes there are lower priority than staff pages — issue describes staff pain."
---

# PRD 1 — above-the-fold usability, hospitality dashboard

## Problem

Hospitality pages spend the first viewport on title, padding and intro
chrome; the content staff navigate for starts below the fold on laptop
screens. Issue #6367.

## Goals

1. **Measure:** a per-page audit recording, at 1366×768, the Y offset at
   which primary content starts, and which component contributes each
   band of space above it.
2. **Fix:** reduce above-the-fold dead space so primary content starts
   within the first viewport on every staff-facing page.
3. **Hold:** a guard (test or baseline) that keeps first-content-y from
   regressing silently.

## Non-goals

- Marketing site, rialto-web showcase.
- Mobile/responsive rework; information-architecture changes.
- Rialto spacing-token redesign (fixes may _use_ existing tokens only).

## Success criteria

- **SC-1:** On a 768px-tall viewport, each audited staff page renders the
  top edge of its primary content without scrolling (first-content-y
  < 768 CSS px, measured by the audit harness).
- **SC-2:** No page loses functionality or a11y: axe checks and existing
  page tests stay green; heading structure unchanged in order.
- **SC-3:** Audit artifact committed with before/after numbers per page —
  the issue's "audit" half is a deliverable, not a side effect.

## Scope boundaries

In: `apps/hospitality/src/pages/**`, its shared layout/header components,
page-level CSS modules. Out: everything else; rialto component changes
only if the audit proves the space originates there, and then behind this
run's review gate with visual-baseline regen planned.

## UX decision

`ux: required` — the change is entirely a user-facing layout change;
ux.md defines the density target and what "above the fold" must contain
per page archetype.
