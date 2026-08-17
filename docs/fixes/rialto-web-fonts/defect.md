---
stage: capture
run: maintenance:rialto-web-fonts
date: 2026-08-17
re-entry: implement
---

# Defect: rialto-web serves zero web fonts — CSP blocks the font preload's inline `onload`

Origin: `docs/backlog.md` seed 1 (`from: feature:rialto-game-ui`), tracker #4330.
Found by probing the deployed page while writing the `rialto-game-ui` Operate
retro (#4329) — no local gate can see this, by construction.

## Defect

**Expected:** `apps/rialto-web` serves DM Sans (body/UI) and Bricolage Grotesque
(display) — the two typefaces `packages/rialto/CLAUDE.md` names as the design
system's typographic foundation.

**Observed:** it serves neither. `document.fonts.size === 0` in production. The
CSS still _asks_ for them and silently falls back to `system-ui`, so the page
looks intentional rather than broken.

`apps/rialto-web/index.html:8-16` uses the async-font idiom:

```html
<link
  rel="preload"
  as="style"
  href="https://fonts.googleapis.com/css2?…"
  onload="this.onload = null; this.rel = 'stylesheet';"
/>
```

`infrastructure/worker/csp.js:54` sets `script-src 'nonce-${nonce}' 'self'
https://js.stripe.com` — correctly, with no `'unsafe-inline'`. The edge's
`injectNonceIntoHtml` (csp.js:112-114) nonces `<script>` **tags**; an inline
event-handler **attribute** cannot be nonced at all. So the handler is refused
on every page load, the preload is never promoted to a stylesheet, and the
stylesheet never loads.

## Reproduction / Evidence

Headless Chromium against production, 2026-08-17. Marketing is the control — it
carries the identical font block with the fix already applied:

|                                                    | marketing `/`                         | rialto-web `/rialto/`          |
| -------------------------------------------------- | ------------------------------------- | ------------------------------ |
| `document.fonts.size`                              | 23                                    | **0**                          |
| loaded families                                    | Bricolage Grotesque, DM Mono, DM Sans | **(none)**                     |
| `fonts.googleapis` sheet in `document.styleSheets` | yes                                   | **no**                         |
| `link[as=style].rel`                               | `stylesheet` (promoted)               | **`preload`** (never promoted) |
| CSP violations in console                          | 0                                     | **1**                          |

rialto-web console, every load:

```
error:   Executing inline event handler violates the following Content Security
         Policy directive 'script-src 'nonce-…' 'self' https://js.stripe.com'.
warning: The resource https://fonts.googleapis.com/css2?family=DM+Sans… was
         preloaded using link preload but not used
```

`getComputedStyle(document.body).fontFamily` on rialto-web is still
`"DM Sans", "Untitled Sans", system-ui, "Segoe UI", sans-serif` — the request is
made, nothing answers it, the fallback renders.

## Root-cause hypothesis

Not a hypothesis — a **finding**, confirmed in git. This is an incomplete
rollout of a fix that already exists in this repo:

| date               | event                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-02 (#167)  | `apps/rialto-web/index.html` gets the inline `onload` idiom                                                                    |
| 2026-06-14 (#2279) | nonce-based `script-src` ships — **rialto-web's fonts break here**                                                             |
| 2026-07-04 (#3149) | `apps/marketing` hits the identical bug and is fixed: `fix(marketing): replace inline font onload handler with nonce'd script` |
| 2026-08-17         | found by probe                                                                                                                 |

#3149 replaced the attribute with a `data-font-stylesheet` marker plus a plain
`<script>` block the edge nonces, and left a comment naming this exact failure
mode. It was applied to one app and stopped. rialto-web's `onload` has not been
touched since #167.

The proximate cause is the inline handler. The cause worth fixing is that
nothing made the incomplete rollout visible.

## Blast radius

- **Who:** every visitor to `mattbutlerengineering.com/rialto/*` — the design
  system's own public showcase, and the surface used to evaluate the system.
- **How badly:** cosmetic but total and self-undermining. All typography renders
  in `system-ui`. The one site whose job is to demonstrate Rialto demonstrates it
  in the wrong typeface. It also invalidates visual judgement made against the
  live site — including the still-open PRD-7 verdict on #3978, where the reviewer
  would otherwise assess both vibes in a typeface the system does not use.
- **Since when:** 2026-06-14 (#2279) — roughly nine weeks. Six of those weeks
  are since a fix for the identical bug landed in a sibling app.
- **Scope:** `apps/rialto-web` only. Verified all four apps — `gen` and
  `hospitality` reference no web fonts at all; `marketing` carries the fixed
  pattern and is confirmed healthy in production.
- **Not affected:** functionality, accessibility semantics, layout correctness,
  any API or service surface. No data, no security exposure.

## Ruled out

- **A CSP misconfiguration.** `script-src` correctly omits `'unsafe-inline'`.
  Widening it would fix the symptom by removing the protection; marketing proves
  the policy is satisfiable as written.
- **A nonce-injection bug.** `injectNonceIntoHtml` works — marketing's `<script>`
  block is nonced and runs. It only ever targets `<script` opening tags, and an
  `onload=` attribute is not one; this is a limitation by design, not a defect.
- **A Google Fonts outage or network failure.** Marketing loads 23 faces from the
  same origin, same URL, in the same probe run.
- **A build/bundling problem.** The three local CSS bundles resolve fine; the
  fonts sheet is absent because it was never requested as a stylesheet, not
  because it failed to fetch.
- **`?frozen=1` on the telemetry route.** Initially looked suspicious in the
  probe (`data-feed-state` stayed `live`), but `Telemetry.test.tsx:68-72` asserts
  exactly that — frozen means "live immediately and never advances". Correct
  behavior, unrelated.
- **The `ERR_CONNECTION_REFUSED` on `static.cloudflareinsights.com/beacon.min.js`.**
  Real, and present on the same page, but a separate defect with its own seed in
  `docs/backlog.md`. Not in scope here.

## Work items

- [ ] **Port the nonce'd-script pattern to rialto-web** — replace the inline
      `onload` attribute in `apps/rialto-web/index.html` with the
      `data-font-stylesheet` marker plus the `<script>` block from
      `apps/marketing/index.html`, keeping the `<noscript>` fallback and the
      `preconnect` hints as they are.
  - Accept: the served `apps/rialto-web` document contains no `on*=` attribute,
    and the font promotion is driven by a `<script>` tag the edge can nonce.
- [ ] **Add a static guard over every app's HTML entry** — a test that reads the
      real `apps/*/index.html` files and fails if any carries an inline
      event-handler attribute, so a fourth app cannot repeat this and neither
      fixed app can regress. Home: `scripts/__tests__/`, matching the existing
      convention for tests that assert properties of real repo files
      (`pulumi-cli-pin.test.mjs`, `ci-gate-commit-status.test.mjs`).
  - Accept: the test fails against the current `apps/rialto-web/index.html`
    before the fix (RED) and passes after (GREEN); it enumerates `apps/*` by
    glob rather than a hardcoded list, so a new app is covered on creation.
  - Accept: the failure message names the offending file, attribute, and why
    a nonce cannot rescue it — the next person hits the explanation, not a
    bare assertion diff.
- [ ] **Confirm the fix on the deployed surface** — after release, re-run the
      production probe.
  - Accept: `document.fonts.size > 0` on `/rialto/` with DM Sans and Bricolage
    Grotesque among the loaded families, `link[as=style].rel === "stylesheet"`,
    and zero CSP violations in the console.

## Notes

- **Scope decision (2026-08-17):** fix plus static guard. The live-surface check
  — asserting `document.fonts.size > 0` against the deployed page — was
  considered and deliberately deferred to its own run. It catches a strictly
  wider class (any CSP refusal that kills fonts, not just the inline-handler
  shape) and is the `rialto-game-ui` retro's own "verify the shipped surface"
  lesson, but it needs a real browser against a real deploy and fails for
  network reasons the static guard never will. Work item 3 covers this run's
  own verification manually; the standing automated version stays a backlog
  seed.
- The static guard does **not** catch CSP breakage that isn't an inline handler.
  That gap is known and accepted here, not overlooked.
- Verify is not skippable in a maintenance run: the RED state in work item 2
  (the guard failing against today's `apps/rialto-web/index.html`) is this run's
  regression test, and must be demonstrated before the fix lands.
