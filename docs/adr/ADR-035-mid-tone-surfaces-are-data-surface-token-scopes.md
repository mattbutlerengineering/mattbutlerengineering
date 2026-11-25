---
id: ADR-035
title: Mid-Tone Surfaces Are data-surface Token Scopes, and Derived Tokens Re-Resolve on Every Scope
status: active
provisional: true
date: 2026-11-25
---

# ADR-035: Mid-Tone Surfaces Are `data-surface` Token Scopes, and Derived Tokens Re-Resolve on Every Scope

> **Status: provisional.** The frontmatter says `status: active` with `provisional: true` because the repo's ADR structural check accepts only `active`, `superseded` and `deprecated` (`tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES`). Written by the Architect stage of `docs/features/rialto-signature-pass/` in an unattended autorun, without a live Owner answer. Confirm or supersede it.

## Context

The rialto-signature-pass run adds two mid-tone surfaces, tinted
(parchment, or smoked brass in dark) and velvet (plum). They sit between the
light and dark extremes (`docs/features/rialto-signature-pass/ux.md`).
Content on them needs different text, border and focus values. Light gold
fails as a focus ring on tinted (2.58:1). Dark text-tertiary at 50% fails on
both new dark surfaces. The focus ring is judged against a gap drawn in
`--rialto-surface`, which inside a band must be the band's own colour.

Rialto already re-declares the light palette on a nested
`[data-theme="light"]` island (generated into `colors.css`). But custom
properties defined in terms of other properties, such as
`--rialto-input-border-focus: var(--rialto-accent)` in
`component-tokens.css` or `--rialto-shadow-focus`, are substituted where
they are declared (`:root`), and descendants inherit the substituted value.
A scope that re-declares `--rialto-accent` therefore never reaches a
component that reads a Tier-3 token. Nested light islands carry this bug
today.

## Decision

1. **A surface is a scope, set by an attribute.** `data-surface="tinted" |
"velvet"` re-declares `--rialto-surface`, `--rialto-focus-gap`, the text
   tokens, the border tokens and `--rialto-focus-ring` for its subtree. The
   values are authored in `src/tokens/colors.surfaces.json`, one entry per
   scope and theme, and the existing generator emits them into `colors.css`.
   There are light, dark and nested-light blocks for each scope, and a parity
   check requires equal keys. The consumer paints the band's background.
2. **The focus ring gets its own tokens.** `--rialto-focus-ring` (default:
   the accent value) and `--rialto-focus-gap` (default: the surface value)
   compose `--rialto-shadow-focus`. The gold fill (`--rialto-accent`) never
   changes per scope, so a primary Button on tinted keeps `#b0841e`.
3. **Derived tokens re-resolve on every scope element.** The selector of
   `component-tokens.css`, and of the one rule declaring
   `--rialto-shadow-focus`, becomes
   `:root, [data-theme], [data-surface], [data-palette]`. Each scope element
   then substitutes Tier-3 and composite tokens against its own semantic
   values.

`token-contrast.test.ts` checks every scope's re-declared pairs against the
band, and checks the ring against both the gap and the band.

## Consequences

- `data-surface` becomes public CSS API. Renaming it later breaks
  consumers.
- The nested light island bug is fixed. Inside a light island under dark,
  component tokens and the focus ring now take light values. Outside
  islands, the computed values are identical to today's.
- Every Tier-3 token is re-declared on each scope element: one declaration
  block per `[data-theme]` or `[data-surface]` element. That is the same
  order of work the browser already does for `:root`. Scope elements are few
  (the provider wrapper and the bands).
- A component that should look lifted on a band must read
  `--rialto-surface-elevated`, not `--rialto-surface`, because the scope
  re-points `--rialto-surface` to the band colour.

## Alternatives Considered

- **A `surface` prop on each component.** Rejected. It touches every
  component, and content composed inside a band would still need the token
  values.
- **Per-scope hand-written overrides of each Tier-3 token.** Rejected. Every
  new component token would need adding to every scope by hand, and nothing
  would check the copies against the JSON.
- **A third theme (for example "dusk") instead of scopes.** Rejected by UX:
  the mid-tones are bands inside light and dark, not a user theme choice.
- **Re-declaring `--rialto-accent` in the tinted scope instead of a
  focus-ring token.** Rejected. It would darken the primary Button fill on
  the band as well.

## See Also

- [ADR-001](ADR-001-rialto-over-tailwind.md): the token foundation.
- [ADR-034](ADR-034-service-aware-mode-is-a-scoped-paint-only-override.md):
  the rush header band uses the tinted scope.
- `packages/rialto/src/tokens/colors-theme-scope.test.ts`: the
  nested-light-scope test this extends.
