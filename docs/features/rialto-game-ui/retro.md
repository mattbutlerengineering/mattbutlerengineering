---
stage: operate
run: feature:rialto-game-ui
date: 2026-08-17
---

# Retro: Game-feel vibe for Rialto

Shipped `a3822cb58` at 2026-08-16T02:28:13Z (PR #4252). This retro was written
~28 hours later, against a live probe of
`https://mattbutlerengineering.com/rialto/demos/telemetry`.

The headline is not the feature. It is that this run had **no channel through
which its own success could reach anyone**, and that the same class of gap —
a client-side capability silently killed with no server-side signal — turns out
to be breaking the showcase's typography in production right now.

## Outcomes vs. intent

### Success in one sentence: "a visitor lands on the demo route and immediately notices the interface feels different and more alive"

- What happened: **Unknown, and unknowable as built.** Three independent gaps
  stack, any one of which is sufficient:
  1. `deploy-static.yml`'s `deploy-rialto-web` job has no `env:` block at all,
     so `VITE_SENTRY_DSN` is never passed — the hospitality job passes it at
     line 167, rialto-web does not.
  2. The live bundle contains no Sentry ingest string, confirming (1) reached
     production.
  3. Even with a DSN, the worker's CSP omitted the Sentry ingest origin from
     `connect-src` until PR #4315 deployed on 2026-08-17 — every envelope from
     every app would have been refused by the browser anyway.

  There is also no analytics, no beacon, and no server-side route counter. The
  Cloudflare Insights beacon that _is_ injected fails to load
  (`static.cloudflareinsights.com/beacon.min.js` → `ERR_CONNECTION_REFUSED`).
  So "no errors in 28 hours" is not evidence of health — it is the sound of a
  disconnected microphone.

- Signal strength: **none**. `idea.md` named this exact risk ("No validation
  loop") and the run shipped anyway without closing it.

### PRD-1 — every interactive element produces a visible state change within 100 ms

- What happened: **Met, and holding in production.** Failed first at Verify
  (`SegmentedControl` at an untokenized 150 ms), fixed in-stage at `b9473cdf6`.
  Live probe reads the scoped custom properties on the route as
  `0.06s / 0.09s / 0.12s` against document-root defaults of `0.1s / 0.15s /
0.2s` — the game preset is genuinely resolving in production, not just in
  the test harness.
- Signal strength: **measured** (live, 2026-08-17).

### PRD-2 — accessibility suite passes on the demo route with zero exceptions

- What happened: Met at Verify. **No signal since.** `rialto-web-e2e.yml` is
  paths-filtered and has not run once since the merge, because no rialto file
  has changed. The suite is green as of ship and silent thereafter.
- Signal strength: **measured at ship, none since.**

### PRD-3 — contrast meets WCAG AA under the new vibe, light and dark

- What happened: Met at Verify. Contrast is a colour property and the tokens
  did not change, so the result stands. But note the premise wobble found
  below: the ratios were reviewed against a page rendering DM Sans locally,
  and production serves `system-ui`. Different glyph weights and stem widths
  change _perceived_ contrast even when the computed ratio does not.
- Signal strength: **measured** (ratios), **anecdote** (perceptual review).

### PRD-4 — keyboard reachable and screen-reader announced at parity with the default vibe

- What happened: Met at Verify. No post-ship signal. One known residual: the
  `Meter` false `aria-valuenow="0"` major was **deferred**, not fixed, and the
  live probe shows six meters all reporting definite values (`100/40/26/100/
100/100`) — so the determinate path is fine and the defect is confined to
  the no-data case, as the review said.
- Signal strength: **measured at ship, none since.**

### PRD-5 — a defined `prefers-reduced-motion` presentation asserted by a test

- What happened: Met. This is the criterion the pipeline most clearly earned:
  the PRD wrote it as "asserted by a test — not left to a blanket animation
  kill-switch", and that phrasing is what forced a real adapter instead of a
  `motion: none` escape hatch.
- Signal strength: **measured.**

### PRD-6 — no un-opted surface changes; existing visual baselines pass unmodified

- What happened: Met at ship and still true — no visual baseline failure has
  appeared on `main` since the merge.
- Signal strength: **measured.**

### PRD-7 — the design-system owner records a yes/no verdict side-by-side against the default vibe

- What happened: **Unmet.** This was the run's declared acceptance gate for
  the entire "feels different and more alive" claim, and 28 hours after ship
  it is unanswered. GitHub issue #3978 — the issue that _seeded_ this run —
  shows `state=OPEN`, `comments=0`, last updated 2026-08-08: eight days before
  the feature shipped. The pipeline consumed #3978 as an input and never
  wrote a single word back to it.
- Signal strength: **none.** A human gate with no owner, no notification, and
  no deadline is not a gate; it is a wish.

### New in production: the showcase serves no web fonts at all

Not a PRD criterion — found by probing the live route for this retro, and the
most valuable thing Operate produced.

- What happened: `apps/rialto-web/index.html:12` uses the async-font idiom
  `<link rel="preload" as="style" onload="this.rel='stylesheet'">`. The
  worker's CSP sets `script-src 'nonce-…' 'self' https://js.stripe.com` with
  no `'unsafe-inline'` — correctly — so **the inline `onload` is blocked on
  every page load**, the preload is never promoted to a stylesheet, and the
  browser then warns that the resource was "preloaded but not used".

  Measured consequence: `document.fonts.size === 0` in production, and the
  Google Fonts stylesheet is absent from `document.styleSheets` (only the
  three local bundles are present). Computed `body` font-family is still
  `"DM Sans", "Untitled Sans", system-ui, …` — the CSS asks for DM Sans, gets
  nothing, and silently falls back to `system-ui`.

  So every visitor to the Rialto design system's own showcase site is seeing
  **neither DM Sans nor Bricolage Grotesque** — the two typefaces
  `packages/rialto/CLAUDE.md` names as the system's typographic foundation.
  On the one site whose entire job is to demonstrate the design system. Scoped
  to `apps/rialto-web` only; `gen`, `hospitality`, and `marketing` do not use
  this idiom.

- Signal strength: **measured** (live, 2026-08-17).
- Why nobody knew: identical mechanism to the Sentry bug fixed hours earlier
  in #4315 — a CSP refusal is client-side, so it produces console output and
  nothing else. No server-side signal, no alert, no failing test. Absence
  renders identically to fine.

## Run retrospective

- **Keep — the PRD criterion that specified its own evidence.** PRD-5's
  "asserted by a test — not left to a blanket animation kill-switch" is the
  only criterion phrased so that a weak implementation could not satisfy it.
  It is the criterion that shaped the code. Criteria that name their evidence
  outperform criteria that name their outcome.
- **Keep — fixing PRD-1 inside Verify rather than deferring it.** The 150 ms
  `SegmentedControl` miss was a real failure of a real budget, caught because
  one route measured computed style rather than trusting the token. Fixed at
  `b9473cdf6` before Review. That is the loop working.
- **Keep — the honest release log.** `release.md` records four CI cycles
  rather than one clean merge. That is worth more to the next release than a
  tidy fiction.
- **Change — the run must write back to its own tracker.** `idea.md` records
  `origin: github-issue #3978` in one direction only. Nothing in the pipeline
  closes that link, so the shipped feature is invisible from the issue that
  asked for it, and PRD-7's reviewer was never told there was anything to
  review. Every stage artifact should cost one comment on the origin issue.
- **Change — deferred findings must leave the run directory.** `review.md`
  deferred two majors and three minors; `release.md` lists three items under
  "## Open". **None of them exist as GitHub issues.** Two are real defects in
  shipped design-system components (`Meter`'s false zero, `SegmentedControl`
  dropping a caller's `aria-label`) that affect _every_ consumer, not just
  this route — and they are recorded only inside
  `docs/features/rialto-game-ui/`. This is the same failure mechanism as
  #3547: a real finding absorbed by a document nobody re-reads.
- **Change — verify the shipped surface, not just the shipped code.** Verify
  and Review both passed against a local build. Fifteen minutes of probing
  the _deployed_ page found a CSP violation, a dead analytics beacon, and zero
  loaded web fonts — none of which any local gate can see, all of which affect
  every visitor. A live probe belongs in Ship's post-release step, not in
  Operate as an accident.
- **Stop — treating a demo route in an uninstrumented app as shipped.**
  `idea.md` named "Dies as a demo" as a top risk and the run proceeded to ship
  into the one app in the monorepo with no DSN, no beacon, and no route
  counter. The risk was identified, recorded, and then not acted on. Naming a
  risk in `idea.md` is not mitigating it; the PRD should have carried an
  instrumentation criterion or the run should have picked a different host.

## Idea seeds

Appended to `docs/backlog.md`. Twelve seeds from this run's earlier stages
were already there (commit `38f85039b`); these are the additions Operate
produced and do not duplicate them.

- Fix the CSP-blocked font preload in `apps/rialto-web/index.html` — production
  loads zero web fonts and falls back to `system-ui`
- Close the tracker loop: a run must comment on its origin issue, and deferred
  findings must become issues before the run completes
- Fix or remove the failing Cloudflare Insights beacon
- Extend post-deploy smoke to the routes features actually ship — it hits
  `/rialto` but not `/rialto/demos/*`
- Give a human-verdict acceptance criterion an owner, a notification, and a
  deadline
- Add a live-surface probe to Ship's post-release step

## Run complete

Closed 2026-08-17. Six PRD criteria met and holding; PRD-7 unmet and
unanswered; the run's own success sentence unmeasured and, as built,
unmeasurable. Seeds above are the input to the next Idea-stage run.
