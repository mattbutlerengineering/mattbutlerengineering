---
stage: prd
run: feature:rialto-game-ui
date: 2026-08-15
ux: required
---

# PRD: Game-UI vibe for Rialto

## Problem statement

A technical evaluator gives mattbutlerengineering.com about five minutes and
leaves with nothing that sticks. The interface reads as competent and
completely generic — the same surfaces, badges, and spinners as every other
AI-assisted portfolio — so the engineering behind it never gets evaluated on
its merits. Since the site is the funnel for factory-as-a-service, that is a
leaking funnel, not a cosmetic complaint.

## Solution

Rialto gains one new **opt-in vibe** carrying a game-UI design language:
immediate legible feedback on every interaction, denser information display,
and state that reads at a glance. A single dedicated route in
`apps/rialto-web` demonstrates it against Rialto's existing component
catalog, so there is one URL an evaluator can be pointed at.

Opt-in is load-bearing: every existing surface stays on its current vibe and
renders exactly as it does today. Nothing about this run is a migration.

## Actors

- **Evaluator** — a hiring manager or prospective client visiting the demo
  route for a few minutes, forming a snap judgment about craft.
- **Reduced-motion evaluator** — the same person with
  `prefers-reduced-motion` set, or navigating by keyboard or screen reader.
- **Design-system owner** — Matt, who owns `packages/rialto` and is the
  acceptance judge for this run.
- **Consumer-app developer** — anyone building on Rialto in
  `apps/marketing`, `apps/hospitality`, `apps/gen`, or `apps/rialto-web`,
  who must see no change unless they opt in.

## User stories

1. As an **evaluator**, I want every interaction on the demo route to answer
   me immediately and visibly, so that the interface feels alive rather than
   dead in the five minutes I give it.
2. As an **evaluator**, I want a lot of state legible at a glance rather than
   spread across clicks, so that the density itself reads as craft.
3. As a **reduced-motion evaluator**, I want the route to stay complete and
   legible with motion suppressed, so that the experience degrades in
   quality but never in function.
4. As the **design-system owner**, I want the game vibe to be selectable and
   entirely opt-in, so that trying a distinct direction cannot regress any
   shipping surface.
5. As a **consumer-app developer**, I want `default`, `transacting`, and
   `presenting` to behave exactly as before, so that this run costs me
   nothing.

## Success criteria

- [ ] Every interactive element on the demo route produces a visible state
      change within 100 ms of hover, focus, press, and result.
- [ ] The accessibility suite passes on the demo route with zero exceptions.
- [ ] Contrast ratios meet WCAG AA under the new vibe in both light and dark.
- [ ] Every action on the route is reachable by keyboard and announced to a
      screen reader, at parity with the same components under the default
      vibe.
- [ ] A defined `prefers-reduced-motion` presentation exists and is asserted
      by a test — not left to a blanket animation kill-switch.
- [ ] No surface that has not opted in changes visually: existing visual
      baselines across `apps/*` pass unmodified.
- [ ] The design-system owner reviews the demo route side-by-side against the
      default vibe and records a yes/no verdict. This is the acceptance gate
      for "feels different and more alive".

## Out of scope

- **Hospitality adoption.** The operator-facing second wave — applying
  density and state-legibility patterns to live operational screens — is not
  part of this run. It touches a shipping product surface and its E2E suite,
  and depends on this pilot's verdict.
- **Net-new components.** Scope is one vibe plus one route; the vibe must
  work against Rialto's existing catalog. If the pilot shows density patterns
  have nowhere to land, that becomes a follow-on run, not a scope expansion.
- **Migrating any existing surface** to the new vibe, including
  `apps/rialto-web`'s own existing showcase sections.

## Open questions

- **Can the vibe mechanism carry this at all?** `packages/rialto/src/providers/vibes.ts`
  defines vibes as CSS custom-property override sets only — spacing, radii,
  weight. Motion, easing, and transient feedback have no channel there. Does
  the vibe system get extended, or does the feedback layer live somewhere
  else? — **Architect**, and it is the first thing to resolve.
- **What is the reduced-motion form of "game feel"?** Does it shift to
  non-motion channels (contrast, weight, layout), or degrade to something
  indistinguishable from the default vibe? — **UX Design**.
- **Sound cues** — #3978 lists sound as a game-UI attention mechanism. In or
  out? Autoplay, consent, and a11y implications are unresolved. — **UX
  Design**.
- **Which existing components appear on the demo route**, and is that set
  chosen to flatter the vibe or to stress it? — **UX Design**.
- **Does the demo route join the existing visual-regression suite** or carry
  its own baselines? — **Architect**.
- **Is the route linked from anywhere** or unlisted until the verdict is
  in? — **Design-system owner**.
