---
paths:
  - "apps/**/*.{tsx,css}"
  - "packages/rialto/**"
---

# UI quality — the tells the daily loop files

Before writing or changing UI, read [the rubric prose](../../docs/ui-quality/rubric.md)
(`docs/ui-quality/rubric.md`). The `mbe-ui-quality` routine judges every page
against it and files each tell below as an issue — avoid them at the source.
The fix is almost always a rialto token: see `packages/rialto/CLAUDE.md`
§ Token Usage Rules.

## Agent-built tells — what a generated page looks like

- [ ] `agent-built/unrequested-dark-theme` — no permanent dark canvas; use the
      `--rialto-surface*` tokens, which follow the theme.
- [ ] `agent-built/gradient-background` — no decorative gradients; flat
      surfaces, and `--rialto-accent` only for focus, selection, primary actions.
- [ ] `agent-built/icon-card-grid` — no grid of icon-in-a-circle cards; show the
      real product (a number, a screenshot, a working component).
- [ ] `agent-built/inter-headline` — headlines in `--rialto-font-display` at the
      `--rialto-text-*` scale, never Inter or the system sans.
- [ ] `agent-built/gray-card-border` — group with `--rialto-space-*` and the
      `--rialto-shadow-*` tiers; a `--rialto-border` rule only where regions
      must separate.
- [ ] `agent-built/three-feature-card-row` — as many items as are true, most
      important given the most room.
- [ ] `agent-built/generic-hero-copy` — name what this product does for whom,
      in its own nouns (tables, covers, reservations, components).

## Accessibility tells

- [ ] `accessibility/non-descriptive-alt` — alt text says what the image means
      here; decorative images get `alt=""`.
- [ ] `accessibility/vague-link-purpose` — no "click here" / "learn more"; the
      link text (or `aria-label`) names the destination.
- [ ] `accessibility/heading-content-mismatch` — each heading titles its
      section; levels stay in outline order.
- [ ] `accessibility/axe-critical`, `accessibility/axe-serious`,
      `accessibility/axe-moderate`, `accessibility/axe-minor` — zero axe
      violations at any impact, `color-contrast` included: use the
      contrast-checked text tokens, keep content inside `<main>` and landmarks.

Bugs (`bugs/blank-render`, `bugs/unhandled-error`, `bugs/dead-in-app-link`,
`bugs/failed-request`) are detected mechanically; every route must render
content or an actionable error state, and every in-app link must match a route.
