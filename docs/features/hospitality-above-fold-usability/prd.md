---
stage: prd
run: feature:hospitality-above-fold-usability
date: 2026-10-13
id: PRD-1
ux: not-applicable
ux-reason: no new screens or flows — spacing/rhythm correction on existing pages, governed by the existing ui-quality rubric
assumptions:
  - "ux: not-applicable chosen without live user input: the brief confirms a user-facing surface but proposes no new screen or flow, and the change is bounded by the existing rubric (.claude/rules/ui-quality.md) and brand direction."
  - "Key-page set fixed to the pages both personas live in per apps/hospitality/CLAUDE.md: Home, Reservations, Guests, Timeline, Floor Plans, Waitlist. Other routes are measured but not gated."
  - "Fold budget viewport fixed at 1280×720 (gate) with 1366×768 measured for information: the issue names no viewport; 720px height is the stricter common laptop case."
---

# PRD-1: Above-the-fold usability on hospitality pages

One page, feature scale. Source: issue #6367 and `idea.md`.

## Problem

Hospitality dashboard pages spend the first laptop screenful on padding,
breadcrumb, title block, and status chrome; primary content (the data the
operator navigated for) starts below the fold, forcing a scroll on every
page visit.

## Scope

**In**

1. **Measurement.** A repeatable, scriptable audit that loads each
   hospitality route at 1280×720 and 1366×768 and reports the viewport Y
   at which that page's primary content region starts. Results recorded
   in this run directory as the audit artifact.
2. **Shared-layout fix.** Tighten `DashboardLayout` vertical spend above
   content (the `.content` top-padding override is the known candidate),
   keeping token-only values.
3. **Per-page fixes.** For key pages the audit still convicts after the
   shared fix: tighten that page's header/status stack (merge rows,
   reduce block gaps). Only pages the measurement names.
4. **Guard.** An automated check that fails if a key page's primary
   content starts below the fold budget at 1280×720, so the class stays
   shut.

**Out**

- Rialto token value changes (`packages/rialto`) — blast radius is every
  consumer app.
- Page redesigns, new components, content changes, new flows.
- Marketing site and rialto-web showcase.
- Mobile rework beyond not regressing current 375px behaviour.

## Success criteria

- SC-1: On a 1280×720 viewport, each key page (Home, Reservations,
  Guests, Timeline, Floor Plans, Waitlist) renders the start of its
  primary content region within the viewport without scrolling —
  asserted by the guard check, not by eye.
- SC-2: The audit artifact exists with before/after numbers per route at
  both viewports.
- SC-3: No accessibility regression: axe clean at all impacts on touched
  pages; skip link, landmarks, and breadcrumb semantics unchanged.
- SC-4: All CI gates green, with visual baselines regenerated from the
  Linux CI artifact if the spacing change trips them (expected per
  gotcha), never from macOS.

## Non-goals / risks

- Do not flatten the design: the brand direction prizes air; the target
  is wasted vertical spend above content, not density everywhere.
- A fix that edits many pages invites visual-baseline churn; prefer the
  single shared lever plus the few convicted pages.
