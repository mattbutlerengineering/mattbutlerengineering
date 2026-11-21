---
id: ADR-033
title: Expressive Motion and Atmosphere Are Allowed Repo-Wide
status: active
date: 2026-11-20
---

# ADR-033: Expressive Motion and Atmosphere Are Allowed Repo-Wide

## Context

The UI rules kept every surface flat and nearly still. `.claude/rules/ui-quality.md`, `docs/ui-quality/rubric.md` and `packages/rialto/docs/motion.md` said: one expressive animation per view, no looping motion outside status, no decorative gradients, the gold accent only on controls, no permanent dark canvas, and CSS timing only from three duration tokens whose longest is 0.2s. `apps/hospitality/src/no-decorative-gradient.test.ts` failed on any `linear-gradient(`.

Those rules were written to stop generated-looking pages. They also ruled out work the Owner wants: staged scenes, ambient light, a venue shown at night. The motion policy had deferred a longer duration token ("write an ADR when a CSS-driven expressive entrance needs one"); that need has arrived.

## Decision

Expressive motion and atmosphere are allowed on every surface in the repo. The Owner approved this scope on 2026-11-20.

| Rule before                                | Rule now                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One expressive animation per view          | Removed. Several may run together.                                                                                                                          |
| No looping motion outside status           | Ambient loops are allowed anywhere except beside a field someone is filling in.                                                                             |
| No decorative gradients                    | Gradients, glow and atmosphere are allowed when built from rialto tokens.                                                                                   |
| Gold accent only on controls               | The accent may also be used as light, through the existing `--rialto-accent-glow`, `--rialto-shadow-ambient` and `--rialto-shadow-luminous` tokens.         |
| Timing from tokens, the longest being 0.2s | Still tokens only. Three longer tokens are added: `--rialto-duration-scene` (0.6s), `--rialto-duration-cinematic` (1.2s), `--rialto-duration-ambient` (8s). |
| No permanent dark canvas                   | A deliberate dark scene is fine if it uses theme tokens and keeps contrast.                                                                                 |

### Limits that are not relaxed

1. **Zero axe violations**, `color-contrast` included, on every page, dark scenes and gradients included.
2. **Reduced motion** goes through `useMotionPreset()` and the duration tokens. The reduced-motion adapter zeroes the three new tokens with the old ones (ADR-025).
3. **WCAG 2.2.2:** a loop that runs longer than 5 seconds needs a way to pause it, and decorative loops pause when offscreen.
4. **WCAG 2.3.1:** nothing flashes more than three times a second.
5. **Colours stay rialto tokens.** No raw hex, in a gradient or anywhere else (ADR-001).
6. **The 100+/day rule:** no travel or scale on shortcuts, typing, tab switches and filter switches.
7. **Never scale from below 0.9.**
8. **Animate only `transform` and `opacity`.**
9. **Bundle budgets:** a heavy effect gets its own lazy chunk with a measured budget.

## Consequences

- **The daily ui-quality judge loosens for every page.** It reads `docs/ui-quality/rubric.md`, so the reworded `agent-built/unrequested-dark-theme` and `agent-built/gradient-background` prose applies to all routes, not only to new showcase work. A token-built gradient or a deliberate dark scene is no longer filed.
- **Calibration agreement may drift.** `rubric.json` is unchanged (ids, detection, severity, `tells_hash`, `rubric_version`), but the calibration set was rated under the old prose. If agreement falls below the pass mark, re-rate the affected references; do not tighten the prose back.
- **The gradient guard changes meaning.** `no-decorative-gradient.test.ts` now passes a gradient whose every colour stop is a `var(--rialto-*)` reference, `transparent` or `currentColor`, and fails a raw colour. It covers linear, radial and conic gradients.
- **Three more tokens to maintain.** Each is a surface the reduced-motion adapter must collapse; a test compares the adapter's keys with the tokens declared in `tokens/shadows.css`. The `game` vibe does not retime them: its budget is about feedback, and these are not feedback durations.
- **Restraint becomes judgement.** With the one-per-view cap gone, nothing mechanical stops a busy view. The purpose test and frequency budget in `motion.md` still apply and are what review holds a change to.
- **Existing surfaces are unchanged.** This ADR permits; it does not restyle anything.

## Alternatives Considered

- **A scoped "showcase surface" exemption.** Keep the rules everywhere and exempt named showcase routes. Rejected by the Owner in favour of everywhere: an exemption list needs a definition of "showcase", a way for the judge to know which route it is on, and upkeep each time a surface is added.
- **A one-off.** Ship one expressive page against the rules and leave them as written. Rejected: the daily judge would file the page's gradient and dark canvas as tells every day, and the next expressive page would need the same argument again.
- **Longer animations with literal durations.** Rejected: a literal is invisible to the vibe and reduced-motion adapters, which is the reason the duration tokens exist (ADR-025).

## See Also

- [ADR-001](ADR-001-rialto-over-tailwind.md): the token foundation the colour limit rests on.
- [ADR-022](ADR-022-vibe-adapter-seam.md) and [ADR-025](ADR-025-motion-presets-through-context.md): the adapters that collapse the duration tokens and motion presets under reduced motion.
- [`packages/rialto/docs/motion.md`](../../packages/rialto/docs/motion.md): the motion policy this decision amends.
- [`docs/ui-quality/rubric.md`](../ui-quality/rubric.md) and [`.claude/rules/ui-quality.md`](../../.claude/rules/ui-quality.md): the two tells reworded by this decision.
