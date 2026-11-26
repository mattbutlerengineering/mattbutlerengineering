---
id: ADR-034
title: Service-Aware Mode Is a Scoped, Paint-Only Override, Not a Vibe Preset
status: active
provisional: true
date: 2026-11-25
---

# ADR-034: Service-Aware Mode Is a Scoped, Paint-Only Override, Not a Vibe Preset

> **Status: provisional.** The frontmatter says `status: active` with `provisional: true` because the repo's ADR structural check accepts only `active`, `superseded` and `deprecated` (`tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES`). Written by the Architect stage of `docs/features/rialto-signature-pass/` in an unattended autorun, without a live Owner answer. Confirm or supersede it.

## Context

The rialto-signature-pass run adds a service-aware mode to the hospitality
app (`docs/features/rialto-signature-pass/`). As live load climbs, Timeline
and Dashboard move from calm through building to rush, then settle back. No
interactive element may move or resize while this happens (PRD criteria 7
and 8).

The obvious home is the vibe seam (ADR-022): add a `rush` preset, or a
fourth adapter in `RialtoProvider`. Three facts stand against it:

- `RialtoProvider` applies its overrides app-wide on one wrapper, and the
  mode covers two routes.
- The presets carry geometry. `transacting`, `game` and the reduced-data
  adapter shrink `--rialto-space-*`, and `component-tokens.css` feeds those
  into button and input padding. A weight change alters text width.
- The phase is subscribed, time-driven state. That is one of ADR-022's
  triggers for extracting an adapter pipeline ("an adapter with its own
  lifecycle").

## Decision

Rialto gains a scoped primitive, `PaintScope`
(`packages/rialto/src/providers/PaintScope.tsx`). It applies a typed,
paint-only override map to a subtree:

- **Paint-only by type.** `PaintOverrides = Partial<Record<PaintToken,
string>>`, where `PaintToken` comes from a readonly allowlist
  (`paint-tokens.ts`): colour tokens, `--rialto-shadow-*`,
  `--rialto-duration-*` and `--rialto-ease-*`. No spacing, type-scale,
  weight, tracking or radius token is in it. A test parses the token sheets
  and fails if the allowlist ever overlaps them.
- **No box.** The wrapper is `display: contents`. Custom properties inherit
  through it, and it exists in every phase, so a phase change adds or
  removes no DOM node.
- **Reduced motion ranks last.** `PaintScope` merges
  `deriveReducedMotionOverrides(device)` after the caller's map, the same
  precedence `RialtoProvider` uses. A scope can never re-impose motion on a
  user who asked for less.
- **No throw.** It reads `useDeviceContext()`, not `useUIEnvironment()`, so
  it keeps ADR-025's contract.
- **Ambient level.** It carries `data-ambient="full" | "dim" | "quiet"`.
  Ambient components (NeonSign first) read that attribute.

The hospitality app owns everything about phases: the load signal, the
thresholds and the phase machine. It passes `PaintScope` a
`Record<ServicePhase, PaintOverrides>`. Rialto knows nothing about service.

`RialtoProvider` and its three adapters are unchanged. This is not a fourth
adapter, so ADR-022's pipeline trigger does not fire.

## Consequences

- A new public export from `@mattbutlerengineering/rialto/providers`.
  Removing it later is a breaking change.
- The geometry guarantee has three layers: the type, a static test over the
  token and module sheets, and a Playwright bounding-box spec on the covered
  screens. The first two run in `CI Gate`; the third runs in the advisory
  Hospitality E2E job.
- Two ways to override tokens now coexist: the app-wide vibe (which may
  carry geometry) and the scoped `PaintScope` (which may not). The
  difference is the point, and the type enforces it.
- framer-motion presets do not follow a `PaintScope`. Only the CSS duration
  tokens do. A scoped consumer that needs JS motion to change would need a
  new decision.

## Alternatives Considered

- **A `rush` preset in `vibes.ts`.** Rejected. It is app-wide, and nothing
  stops a preset from carrying geometry.
- **A fourth `RialtoProvider` adapter fed by the phase.** Rejected. It is
  app-wide, it fires ADR-022's lifecycle trigger, and it mixes a hospitality
  domain signal into the design system's root provider.
- **A nested `RialtoProvider` per page.** Rejected. Each provider writes
  `data-theme` to `<html>` and resets theme state, and its presets still
  allow geometry.
- **Inline styles written by the app, with no rialto primitive.** Rejected.
  The app would own the list of paint-safe tokens and re-derive the
  reduced-motion precedence, which is design-system knowledge.

## See Also

- [ADR-022](ADR-022-vibe-adapter-seam.md): the vibe seam and its pipeline
  triggers.
- [ADR-025](ADR-025-motion-presets-through-context.md): the no-throw
  contract.
- [ADR-033](ADR-033-expressive-motion-and-atmosphere-repo-wide.md): the
  limits on motion (only `transform` and `opacity`).
- `docs/features/rialto-signature-pass/architecture.md`: the run's design.
