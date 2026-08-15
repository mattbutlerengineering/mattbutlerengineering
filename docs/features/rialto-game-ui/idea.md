---
stage: idea
run: feature:rialto-game-ui
date: 2026-08-15
origin: github-issue #3978
---

# Idea: Game-UI vibe for Rialto

## Problem

A technical evaluator lands on mattbutlerengineering.com, spends about five
minutes, and leaves with nothing that sticks. The interface reads as
competent and completely generic — the same shadcn-shaped surfaces,
the same badges and spinners, the same dead-on-arrival feedback as every
other AI-assisted portfolio built in the last two years. Nothing in the
first screen signals that the craft behind it is different from the
default output of a coding agent, so the work behind it never gets
evaluated on its merits.

Game UI solves problems web UI mostly ducks: dense real-time state,
information density without clutter, immediate legible feedback on every
action, and a strong sense of responsiveness. Almost none of that craft
shows up in design-system work, which is exactly why it reads as
distinctive when it does.

## Who has it

**Primary: hiring managers and prospective clients evaluating the repo or
the site in five minutes.** They cope today by skimming — scroll the
landing page, maybe open one demo, form a snap judgment on visual
polish, and move on. They do not read the architecture docs, and they
never reach the parts of the repo where the actual engineering lives.

Secondary, not this run's target: hospitality operators running service
on dense operational screens. The density and state-legibility patterns
transfer to them, but they are a second wave — this run proves the
direction on the evaluator first.

## Why now

The portfolio is the funnel. The first-customers plan is
factory-as-a-service, sold through this site — so an evaluator bouncing
off generic-looking UI is a leaking funnel, not a cosmetic complaint.
That reframes visual differentiation from nice-to-have to a business
need.

Supporting: the scaffolding to try a distinct direction safely now
exists — `packages/rialto` has a vibe layer, `apps/rialto-web` is a live
showcase with visual-regression baselines, and the a11y gates are wired
into CI. Trying this a few months ago would have meant building the
harness first.

## Evidence

**Anecdote only, and labeled as such.** Two strands, neither validated:

1. Matt's own read that the site looks like every other AI-built
   portfolio. No analytics, no user interviews, no bounce data behind
   this — it is a practitioner's judgment about his own work.
2. The premise in issue #3978: game-UI craft (juice, HUD density, state
   legibility, diegetic placement) is largely absent from web
   design-system work. Observation from experience, not a survey.

No evidence has been gathered that evaluators specifically bounce for
this reason, or that a distinct visual direction would change their
behavior. That gap is real and should stay visible downstream.

## Solution hunch

An **opt-in Rialto vibe** carrying a game-UI design language, proven on a
dedicated demo route in `apps/rialto-web`.

Opt-in because it is additive and reversible: existing apps keep the
`default` vibe and cannot regress. A demo route because it is the
cheapest place to prove the direction — isolated from real product
surfaces, already covered by e2e and visual baselines.

Threads worth pulling (from #3978, unranked, no design decisions here):
feedback and juice on every action; HUD/inventory information density;
state legibility (health/status/progress conventions instead of generic
badges and spinners); focus and hierarchy through contrast and motion
rather than size and color alone; diegetic controls that live where the
thing they act on lives.

## Success in one sentence

A visitor lands on the demo route and immediately notices the interface
feels different and more alive than standard web UI.

## Unknowns & risks

- **The vibe layer may not be able to express this.** Verified during
  this interview: `packages/rialto/src/providers/vibes.ts` defines vibes
  as CSS custom-property override sets only — spacing, radii, font
  weight, across three vibes (`default`, `transacting`, `presenting`).
  Motion, easing, transient feedback, and "juice" have no channel in
  that mechanism at all. The chosen shape (a vibe) and the chosen
  substance (game feel) may not be compatible without extending the vibe
  system itself. This is the single largest unknown and the first thing
  Architect has to resolve.
- **Distracting in long use.** The issue's own framing: product UI is
  used for hours, game UI in short bursts. Feedback that delights in a
  five-minute demo could be unbearable during a dinner service — which
  also caps how far the hospitality second wave can go.
- **Dies as a demo.** Ships as a rialto-web route nobody adopts:
  impressive, isolated, slowly rotting against visual baselines while
  every real surface stays generic. Adoption by a real surface is the
  only proof it survived contact with use.
- **A11y is non-negotiable and may flatten it.** Reduced-motion,
  contrast ratios, and keyboard/screen-reader parity all gate this. A
  motion-dependent language has to degrade gracefully, and the degraded
  form may be indistinguishable from the default vibe — meaning the
  reduced-motion path needs its own answer, not a fallback.
- **No validation loop.** Success is currently a subjective reaction
  from a visitor we never hear from. PRD needs to decide whether that
  stays subjective or gets a proxy signal.
