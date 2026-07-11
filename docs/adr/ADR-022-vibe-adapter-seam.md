---
id: ADR-022
title: Earn the Vibe Seam with a Second (Reduced-Data) Adapter
status: active
date: 2026-07-11
---

# ADR-022: Earn the Vibe Seam with a Second (Reduced-Data) Adapter

## Context

Rialto's vibe system (`packages/rialto/src/providers/`) reads as a *seam* — a
swappable design language. `vibes.ts` holds three preset maps
(`default` / `transacting` / `presenting`), each a `VibeOverrides`
(`Record<string, string>`) map of `--rialto-*` CSS custom properties, and
`RialtoProvider` applies the active preset as inline styles on a wrapper
`<div>` so every child adapts through the CSS cascade.

But the "seam" had **one adapter and zero real consumers**: a single static
`VibeName → VibeOverrides` lookup, and no app opted into a non-default vibe.
A seam with one implementation is speculative abstraction — nothing yet proves
the interface generalises. Issue #3189 framed the direction as a HITL call:

- **Option A — earn the seam:** add a genuine *second* adapter/consumer behind
  the existing `VibeOverrides` interface (the issue's primary example: a
  density / reduced-data adapter driven by `useUIEnvironment().device.saveData`)
  so two real implementations justify the seam.
- **Option B — demote:** accept vibes as a configuration point (preset maps of
  CSS-var overrides) and stop describing them as a swappable seam. Promote to a
  seam only if a real second adapter ever appears.

An earlier decision comment (2026-07-10) chose Option B. It was **overridden**
the same day by a later comment selecting **Option A**, which this ADR records.

## Decision

**Option A — commit a real second adapter behind the existing interface.**

We add a **reduced-data adapter**: a runtime-derived source of `VibeOverrides`
keyed on `device.saveData` (the `prefers-reduced-data: reduce` signal already
detected by `useDeviceContext`). When Save-Data is on it tightens the spacing
scale by roughly one step, trading whitespace for density. It is composed
behind the *same* CSS-var-override path `RialtoProvider` already uses — not a
bespoke second mechanism — so the seam now carries two genuinely different
adapter shapes:

| Adapter          | Input                    | Nature              |
| ---------------- | ------------------------ | ------------------- |
| Preset (`vibes`) | a static `VibeName`      | build-time constant |
| Reduced-data     | `device.saveData` signal | derived at runtime  |

Both emit a `VibeOverrides` map; `RialtoProvider` merges them into one inline
`style`. That shared output type *is* the seam, and it is now exercised by two
real producers — the abstraction is earned rather than hypothetical.

### Implementation

- New module `packages/rialto/src/providers/reduced-data.ts` exports
  `reducedDataOverrides` (the compact spacing map) and
  `deriveReducedDataOverrides(device)` (returns that map when
  `device.saveData` is `true`, otherwise an empty no-op map).
- `RialtoProvider` composes the two adapters plus the caller's explicit
  overrides in a documented **low → high precedence** (later wins):
  1. `vibe` preset — the static design-language adapter;
  2. reduced-data overrides — the device-driven adapter;
  3. explicit `vibeOverrides` — the caller's fine-tuning, always final say.

  Reduced-data sits **above** the preset so a user's Save-Data preference
  tightens even a loose preset like `presenting`, but **below** explicit
  `vibeOverrides` so a caller can always override any single token per-var.
- The change is **additive and backward compatible**: no props change, the
  preset maps and CSS-var override path are untouched, and behaviour is
  byte-identical for callers when `device.saveData` is `false`.
- The adapter is exercised by unit tests (`reduced-data.test.tsx`): the pure
  derivation (`saveData → overrides`) and the RialtoProvider composition
  (preset precedence, explicit-override precedence, no-op when off). The real
  `matchMedia → saveData` detection remains covered by `useDeviceContext.test.ts`.

## Consequences

### Benefits

- The seam is now real: two adapters of genuinely different shape (static
  lookup vs. runtime derivation) share one `VibeOverrides` interface, so the
  abstraction is validated by use instead of asserted on faith.
- Rialto apps automatically honour the user's Save-Data preference with a
  denser layout — an accessibility/performance win — with no per-app wiring.
- A clear, documented composition/precedence rule for future adapters to
  slot into (device-driven signals below explicit caller overrides).

### Trade-offs

- `RialtoProvider`'s `style` memo now depends on `device`, so a Save-Data
  change re-computes the inline overrides (negligible — the same object
  identity is stable between media-query threshold crossings).
- A third+ adapter would justify extracting an explicit adapter list /
  pipeline; for two, direct composition in the provider is the simplest thing
  that is honest about the seam. That generalisation is intentionally deferred.

## Alternatives Considered

### Option B — demote vibes to configuration

**Rejected (override of the 2026-07-10 comment).** Demoting would have reframed
vibes as a config point and dropped seam/adapter language until a second adapter
appeared. The later decision is that the reduced-data adapter is exactly that
second implementation, and building it now — rather than documenting the seam
away and rebuilding later — earns the abstraction with two real consumers to
generalise from. The preset maps and CSS-var path are kept regardless.

### A bespoke reduced-data mechanism (new prop / separate style path)

**Rejected.** Wiring Save-Data through a parallel mechanism would *not* prove
the vibe seam — it would add a second, competing abstraction. Routing it
through the existing `VibeOverrides` interface is the whole point: it
demonstrates the seam carries more than one adapter.

### An opt-in `reducedData` prop

**Rejected for now.** The signal is device-driven by design; callers who need
to override the effect already can, per-token, via the higher-precedence
`vibeOverrides`. Adding a boolean prop would edge the feature back toward the
"configuration point" framing Option B represents. Left as future work if a
concrete need for a hard opt-out surfaces.

## See Also

- **ADR-001**: Design System Unification (Rialto over Tailwind) — establishes
  the token/CSS-var foundation the vibe seam rides on.
- **`packages/rialto/docs/vibes.md`**: user-facing documentation of the preset
  and reduced-data adapters and their composition.
- **Issue #3189**: the recorded seam-vs-config decision this ADR captures,
  including the Option B → Option A override.
