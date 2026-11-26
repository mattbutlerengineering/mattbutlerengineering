---
stage: idea
run: feature:rialto-signature-pass
date: 2026-11-25
origin: "direct — Matt, `/idea-to-prod:idea` interview 2026-11-25; not from a backlog seed"
in-flight-check: "ran 2026-11-25 (`git branch -a --no-merged origin/main`, `git worktree list`, `git diff --name-only origin/main...<branch> -- docs/features docs/fixes` on feat/rialto-ai-first, docs/gen-ui-batch-10, docs/ui-quality-batch-8, feat/3336-rialto-datepicker) — nothing matched; feat/rialto-ai-first carries only a gen-UI idea, and the completed ui-quality-loop and rialto-game-ui runs covered pages and one vibe, not a component-wide audit and restyle"
---

# Idea: a signature pass over every Rialto component, with color, personality, and a UI that reads the room

> "I want to audit all of the components in our design system and make improvements to make them look better, be accessible, and build a world class impressive ux. I don't want this ui to look like other apps, I want it to be unique."
>
> "The current ui lacks color and personality. its either very light or very dark"

## Problem

A host working a Friday service spends the shift in a UI that is either very
light or very dark, with almost no color and no personality. It could be any
SaaS dashboard. The same components still carry accessibility defects found
months ago and never re-checked. Rialto has a distinctive identity on paper
(speakeasy, departure hall, gold), but it lives in a handful of signature
pieces. The buttons, inputs, tables and dialogs staff touch all shift look stock.
Matt's words, sharpened: the UI must stop looking like other apps, be
accessible, and feel world-class at every layer: primitives, signature pieces
and the screens composed from them.

## Who has it

- **Venue staff first:** hosts and managers using the hospitality app, where
  every Rialto component lands. They cope today by living with stock-looking
  screens and whatever accessibility gaps those screens carry.
- **Prospects second:** people deciding to work with Matt who judge the craft
  from rialto-web and the demos. They cope by forming the "generic" impression
  and moving on.

## Why now

Rialto grew to 103 components. Its last component audit
(`packages/rialto/docs/ui-audit.md`) covered 63 of them, and nobody has
re-checked which of its findings are still open since 2026-11-07. The apps
built on Rialto still read as generic.

## Evidence

- **Measured:** `packages/rialto/docs/ui-audit.md` found problems in 48 of 63
  audited components: `<button>` nested in `<a>`/`<button>` (Navbar, Tag),
  Slider arrow keys moving two steps, color-only status in Timeline, async
  changes with no `aria-live`, height/padding animations (Alert, Banner, Tabs),
  click handlers on `role="presentation"` wrappers (Popover, DropdownMenu,
  Select). 40 components have never been audited.
- **Measured:** the ui-quality-loop taste rater's latest scores are hospitality
  0, marketing 1.25, rialto-web 0.83 (out of 5). All 43 rater records are
  `calibration.status: "stale"`, so these are signal, not a verdict
  (`docs/features/ui-quality-loop/retro.md`).
- **Measured:** the palette is warm neutrals plus one gold accent (`#b0841e`
  light, `#d4a23a` dark), reserved for focus, selected and primary states
  (`packages/rialto/src/tokens/`). That is the mechanism behind "very light or
  very dark".
- **Measured:** no component handles `forced-colors` or `prefers-contrast`.
- **Measured:** axe missed two shipped defects in the game-UI run (duplicate
  status announcement, meters reporting a false 0); backlog item #8883.
- **Anecdote:** Matt, 2026-11-25: "The current ui lacks color and personality.
  its either very light or very dark."

## What Rialto already does well (to learn from and keep)

- 125 component test files and 99 stories; a vitest-axe matrix plus
  per-component accessibility tests.
- A focus-return guard test that fails when a new overlay uses
  `useReturnFocus` without a matching test.
- Motion guard tests banning hover-scale and direct framer
  `useReducedMotion`; about 58 files honor reduced motion.
- Token contrast tests (`token-contrast.test.ts`).
- 53 Storybook visual baselines with a noise-floor tolerance harness.
- `packages/rialto-catalog` generated schemas with a drift check, and an
  agent-facing `registry.json` and `docs/ai-usage.md`.
- A CI changeset gate (`check-rialto-changeset.mjs`), localization through
  context (ADR-028), and RTL via logical CSS properties.
- The vibes presets (default/transacting/presenting/game) and
  `useMotionPreset()`, which already let the whole system change feel at once.

## Ambition rung

Chosen: Showstopper, in the user's words: "audit all of the components in our design system and make improvements to make them look better, be accessible, and build a world class impressive ux"
Not taken: Solid: audit all 103 components, fix every accessibility defect, one color-rich visual pass, add missing components; Moonshot: Rialto as a per-venue living identity with a custom typeface, sound and haptics, and a theme generated from each venue's own brand
Demo: pass — on a Friday rush the screen visibly tightens density, quiets motion and raises emphasis on its own
Removes a step: pass — no mode switch, setting or setup; the system reads service state itself
Only this product: pass — live reservation and cover data from the hospitality app, which no stock component kit can see
Achievable: pass — riskiest piece is mapping live load to vibe tokens without shifting layout; two-day spike below

## The demo

Before: a host's screen looks the same at 3pm on a quiet Tuesday as at 8pm on
a packed Friday, pale or dark with one gold accent. After: the same screen,
in a richer Rialto palette, shifts into a denser, calmer, higher-emphasis rush
mode as covers climb, and settles back as the room empties, with nobody
touching a setting.

## Riskiest piece + spike

Driving vibe tokens from live service load without moving controls under a
host's hands. Spike (about two days): feed a reservation-count signal into the
existing vibes mechanism on one hospitality screen, and verify that density
and motion change while every interactive element keeps its position and size.

## Cheapest kill test

Apply a candidate richer palette to five primitives (Button, Input, Select,
Card, Tabs) and show Matt the before and after side by side. If it does not
read as more Rialto and less generic, stop before touching the other 98.

## Solution hunch

1. A richer palette first, because every component inherits it: mid-tone
   surfaces between the current light and dark extremes, and more accent roles
   beyond gold, all passing the existing contrast tests.
2. A fresh audit of all 103 components across accessibility, visual quality
   and interaction, re-checking the 48 old findings.
3. Fixes in priority batches, never 103 half-restyled at once.
4. Missing components: RadioGroup, Switch, Spinner, Toolbar, Listbox,
   TagsInput, FileUpload/Dropzone, VisuallyHidden. Each one is confirmed absent
   (or covered by an existing component such as Toggle) before it is built.
5. `forced-colors` and `prefers-contrast` support.
6. Service-aware mode built on the vibes presets.

## Success in one sentence

Every Rialto component has a current audit row with zero open critical or
serious accessibility findings. The hospitality app shifts with live service
state on its own. And Matt, shown it beside two stock component kits, calls
it unmistakably Rialto. That verdict needs a named owner (Matt), a
notification and a deadline set at PRD time.

## Unknowns & risks

- **Scope sprawl (biggest risk):** "all of it" across 103 components, new
  components and service-aware mode can stall half-done. Mitigation hunch:
  palette first, then batches ranked by staff exposure.
- A bolder palette may fail WCAG contrast across many token pairs.
- Rush-mode shifts could distract a host mid-service and hurt more than help.
- A palette change flips visual baselines in three suites at once (rialto
  Storybook, rialto-web, hospitality). Baselines are Linux-only and must be
  regenerated through `visual-baseline-regen.yml`.
- The npm release is uncut: 22 pending changesets, two of them major. A
  restyle adds to that pile.
- Hospitality sits behind Auth0, so the live service-aware mode is hard to
  verify in production; the ui-quality-loop could not audit those 21 routes.
- Unknown: what "service state" signal exists today and how fresh it is.
- Unknown: whether the uncalibrated taste rater can ever serve as a gate, or
  whether Matt's verdict stays the only uniqueness check.
