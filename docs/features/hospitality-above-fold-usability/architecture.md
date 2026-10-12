---
stage: architect
run: feature:hospitality-above-fold-usability
date: 2026-10-11
ux: required — see ux.md
assumptions:
  - "Shared-chrome hypothesis (space originates in app shell / page-header / page module.css padding) is recorded as a hypothesis the audit work order confirms or refutes — not assumed true by any fix item."
  - "Audit harness is a Playwright script in apps/hospitality/e2e (repo's existing E2E home) rather than a new package — smallest footprint; must be wired into a workflow by explicit path per the silent-spec gotcha, or kept as a locally-run script with its output committed."
---

# Architecture — above-the-fold audit + fix

## Approach

Two phases, measurement before mutation:

1. **Audit harness.** A Playwright script (`apps/hospitality/e2e/` or
   `scripts/`) that loads each page at 1366×768 with mocked/seeded data,
   locates the page's primary-content element by a per-page selector
   table, and records `getBoundingClientRect().top`. Output: one
   committed markdown/JSON table in this run directory
   (`audit-results.md`): page → first-content-y → contributing elements
   (walk ancestors, attribute top-space to shell / header / page CSS).
2. **Fixes, shared-first.** If the audit attributes ≥50% of above-fold
   space to shared chrome, fix the shared component once (token step-
   down per ux.md rule 3), re-run the audit, then fix residual per-page
   offenders. Otherwise fix per page, worst-first.
3. **Regression guard.** The same selector table drives an assertion
   (first-content-y < 768) added to the hospitality E2E suite — wired by
   explicit file path into the workflow (gotcha: a spec not named in the
   workflow never runs).

## Decisions (one-liners — none meet the ADR bar; all two-way doors)

- Measure with Playwright bounding rects, not Lighthouse — deterministic,
  already in-repo, no new dependency.
- Fix via rialto spacing-token step-downs in hospitality's own CSS
  modules / layout components; touch `packages/rialto` only if audit
  proves origin there (separate review, visual-baseline regen from CI
  artifact per gotcha — never from macOS).
- Audit output committed as a run artifact, not a dashboard — SC-3 wants
  evidence, not infrastructure.

## Risks

- Visual-baseline cascade (±1px gotcha) if any shared primitive changes:
  budget a baseline-regen step in the fix work orders.
- Auth'd pages need the E2E auth bypass/mocks already used by the
  hospitality suite; pages that can't render data show empty states —
  audit must seed data or mark the page "measured empty" honestly.

## Reserved ids

ADRs 31–33 reserved but unused (no decision passed the three-leg test).
Work orders take wo 6–15; breakdown uses wo-6 … wo-11.
