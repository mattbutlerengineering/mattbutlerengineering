---
stage: ux-design
run: feature:hospitality-above-fold-usability
date: 2026-10-11
assumptions:
  - "No new screens — this is a density pass over existing pages, so the UX artifact defines fold rules per page archetype instead of new flows (scaled per feature-run rule)."
  - "Brand air is preserved by trimming *stacked* vertical gaps (header padding + page padding + intro margin collapsing into one band), not by shrinking type or removing the header — keeps the speakeasy/high-class vibe."
---

# UX — fold rules for hospitality pages

## Page archetypes and what the first viewport must show (768px tall)

| Archetype       | Pages (examples)                               | Above the fold                                           |
| --------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Data table/list | Reservations, Guests, Waitlist                 | Page title + primary actions + filter row + ≥3 data rows |
| Canvas/visual   | Floor Plans, Floor Plan Editor, Timeline       | Title + toolbar + top of canvas                          |
| Form/setup      | Settings, Setup, Setup Hours, Venue Onboarding | Title + first two form fields                            |
| Status/summary  | HomePage, Briefing, Admin                      | Title + first summary card row                           |
| Public          | PublicBookingPage, ManageReservation           | Venue name + first bookable slot / reservation summary   |

## Density rules

1. One vertical rhythm above content: shell top padding + page header +
   intro must sum to ≤ ~200px. Collapse stacked margins; don't delete the
   header.
2. Intro/explainer prose moves beside the title or into a tooltip when it
   alone pushes content down.
3. Spacing changes use existing rialto tokens (step down, e.g.
   `xl → lg`), never hard-coded px — keeps theme integrity.
4. Headings keep order and level (a11y SC-2); focus order unchanged.
5. Empty states may stay airy — the rule binds pages _with_ content.

## Anti-goals

Cramped tables, removed breathing room between content sections, type
scale reductions. The fix is where the air sits, not how much exists
below the fold.
