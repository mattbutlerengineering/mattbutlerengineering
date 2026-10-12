---
stage: idea
run: feature:hospitality-above-fold-usability
date: 2026-10-11
intake: "#6367"
assumptions:
  - "Affected surface is the hospitality dashboard app (apps/hospitality), not the marketing site — the issue says 'hospitality website' and names no package; the dashboard is where staff work daily."
  - "Target viewport for 'the fold' is laptop-class (~1280×800 / 1366×768) — the dashboard is a desktop staff tool, not mobile-first."
  - "Duplicate-work check could not run: this session has no GitHub credential (no gh, no push), so open PRs could not be enumerated. Proceeding; the conductor gate reviews before merge."
---

# Idea — above-the-fold usability on hospitality pages

## Problem (sufferer's view)

A host opens Reservations (or Guests, Waitlist, Floor Plans…) on the
front-desk laptop and sees a page title, generous padding, and empty
space — the actual reservations list starts below the fold. Every page
load costs a scroll before any work can happen.

## Who has it, how they cope today

Venue staff on laptop viewports. They cope by scrolling immediately on
every navigation, or zooming the browser out — both friction, neither
remembered across pages.

## Why now

Issue #6367 filed by Matt; the dashboard has accreted pages (17 under
`apps/hospitality/src/pages/`) each with its own header/intro spacing,
and the whitespace problem now repeats across "a lot of pages" rather
than one.

## Evidence

Anecdote (labelled as such): Matt's direct observation in #6367. No
telemetry on scroll depth exists. The first work item of this run is a
measured audit (per-page first-content-y at 1366×768) that converts the
anecdote into numbers before anything is changed.

## Solution hunch (not a design)

Most of the dead space likely comes from shared chrome — the app shell,
page-header component, and page-level `*.module.css` padding — so one
shared tightening plus a few per-page hero/intro trims should move every
page at once. Confirm via audit first.

## Success in one sentence

On a 768px-tall viewport, every audited hospitality page shows the start
of its primary content (table/list/form) without scrolling.

## Biggest unknowns / ways this dies

- Spacing may live in rialto components shared beyond hospitality —
  fixing there risks a wide blast radius and visual-baseline churn
  (the ±1px cascade gotcha).
- "Whitespace" may be intentional brand air (speakeasy/high-class vibe);
  the fix must densify without flattening the brand.
- Audit may show the problem is page-specific, not shared — then the S
  estimate grows to N small fixes.
