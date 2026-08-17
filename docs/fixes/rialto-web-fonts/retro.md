---
stage: operate
run: maintenance:rialto-web-fonts
date: 2026-08-17
---

# Retro: rialto-web web fonts restored

## On letting it breathe

Operate normally waits for real usage before judging outcomes. This run doesn't
need to. Its success condition is binary and directly observable — either the
browser loads the typefaces or it doesn't — so the outcome was fully measured
in the post-release probe minutes after deploy. There is no adoption curve to
wait for and no user verdict to solicit. What follows is a real retro, not a
retro written too early.

The one thing time could still tell us is whether the guard holds. That's a
question for whichever run next adds an app to `apps/`.

## Outcomes vs. intent

### The showcase serves its own typefaces again

- **What happened:** `/rialto/` and `/rialto/demos/telemetry` load 23 font
  faces across DM Sans, Bricolage Grotesque, and DM Mono, with the preload link
  promoted to `rel="stylesheet"`, computed `body` font resolving to
  `"DM Sans"`, and zero CSP violations. The pre-fix baseline captured in the
  brief was `fontCount: 0`, `families: []`, `preloadRel: "preload"`, and one
  CSP violation per load.
- **Signal strength: measured.** Real browser, production URLs, after the
  deploy completed — the same instrument that captured the baseline, so the
  before/after is a like-for-like comparison rather than two different checks.

### No app's HTML entry can carry an inline event handler again

- **What happened:** `scripts/__tests__/app-html-inline-handlers.test.mjs`
  passes across all four `apps/*/index.html` entries, and fails when the old
  `onload=` is restored — verified by actually restoring it, not by assuming.
- **Signal strength: measured**, with a scoped claim. The guard catches
  _this defect's shape_ — an inline handler in a static HTML entry. It does not
  catch CSP breakage generally, which is what the E2E-behind-real-CSP seed
  exists to address.

### The two apps stop diverging

- **What happened:** marketing and rialto-web now carry byte-identical font
  blocks, and the production font figures for the two apps match.
- **Signal strength: measured today, unguarded tomorrow.** Nothing detects
  drift between the two copies — Vite HTML entries have no include mechanism.
  Review raised this as a major and it was deliberately deferred rather than
  solved under a fix run's scope; it left the run as a backlog seed.

### The preventive question this run owes itself

Operate's rule for maintenance runs is to ask what _should_ have caught the
defect earlier. This one has an unusually clean answer, because the bug was not
novel: #3149 fixed the identical inline-`onload`-under-nonce-CSP defect in
`apps/marketing` on 2026-07-04, and rialto-web had already been broken since
#2279 on 2026-06-14.

So the guard added by this run would not merely have caught the _next_
occurrence. Added at #3149 time, it would have gone red immediately, on a
defect that was already live — turning a nine-week outage into a same-day fix
six weeks earlier. The missing step wasn't a test that didn't exist; it was
nobody asking "does this bug exist anywhere else?" while fixing it the first
time.

**The cheapest moment to write the guard is the first time you fix the bug,
not the second.** By the second time you already know it recurs, which means
the guard is provably late.

## Run retrospective

- **Keep — git archaeology at Capture.** The brief could have shipped with
  "hypothesis: CSP blocks the inline handler." Ten minutes of `git log` turned
  it into a finding with two commit SHAs, a known-good control (marketing), and
  a precise nine-week blast radius. Every later stage was cheaper for it: the
  fix was a port of a known-working block rather than a design, and Review had
  a reference implementation to diff against.
- **Keep — the "Ruled out" section.** `?frozen=1` looked like a second defect
  during the previous run's probing. Reading `Telemetry.test.tsx:68-72` showed
  the behavior was asserted-correct. Recording the dead end cost two lines and
  saved the next reader from re-walking it.
- **Keep — building a local CSP shim before shipping.** Running the real
  `buildCspDirectives` and real `injectNonceIntoHtml` over the built `dist/`
  proved the fix end-to-end pre-merge. This is precisely the gap the previous
  run's retro identified, addressed one run later, and it worked.
- **Keep — Verify's "note what was NOT verified" rule.** It's what turned the
  deployed-surface check into work item 3 instead of an assumption. Without it
  this run would have merged, deployed, and declared success without anyone
  loading the page.
- **Change — check a prediction against config before writing it down.**
  `verification.md` predicted 48 visual baselines would shift. Thirty seconds
  in `apps/rialto-web/playwright.config.ts` would have shown the suite runs on
  `vite dev` with no CSP, where the old code always worked. The prediction was
  stated with more confidence than its evidence supported. A prediction about a
  test suite is nearly always checkable against that suite's own config.
- **Change — treat "N holes found in my own parser" as a design signal
  sooner.** Review caught one regex hole; CodeQL caught two more. Three strikes
  in one small function was the signal that regex was the wrong tool for HTML
  structure, and I only acted on it at the third.
- **Stop — using regex to parse markup structure, at any size.** "It's only a
  test helper" was the reasoning, and it produced a guard that reported a false
  positive on a clean file. The scanner that replaced it is barely longer and
  has no such class of failure.

## The shape of this run

The fix was three lines of HTML plus a copied script block, right on the first
attempt, unchanged through Review and Ship. Every hiccup — one Review finding,
two CodeQL alerts, one wrong prediction — was in the _guard_, or in the claims
made _about_ the fix. That asymmetry is worth remembering: when the defect is
well-understood, the risk moves out of the change and into the machinery built
around it.

## Idea seeds

Appended to `docs/backlog.md`:

- Sweep siblings when fixing a bug in one app, and write the guard at the first
  fix rather than the second.
- Give CSP refusals a server-side trace — they are currently client-side-only
  and invisible to Sentry, which CSP also blocks.

Two seeds from earlier stages of this run are already on the backlog: guarding
the duplicated font block, and running at least one E2E pass behind the real
edge CSP.

## Run complete

Closed 2026-08-17. Tracker #4330 closed against the production evidence, with
the run's four artifacts under `docs/fixes/rialto-web-fonts/`. Seeds above are
input to the next run.
