---
stage: verify
run: maintenance:rialto-web-fonts
date: 2026-08-17
---

# Verification: rialto-web zero-web-fonts fix

## Summary

**4 of 5 criteria PASS; 1 NOT VERIFIED by construction** (it asserts against the
deployed surface, which does not exist until Ship). No failures.

The regression test — the centerpiece of a maintenance run — is demonstrated in
both directions: RED against the unfixed file, GREEN after. The fix is
additionally proven end-to-end against the **built** artifact under the **real**
production CSP, which is the check the `rialto-game-ui` run's retro said was
missing.

## Criteria & evidence

### Item 1 — the served document contains no `on*=` attribute, and font promotion is driven by a `<script>` tag the edge can nonce

- Check: ran the **built** `apps/rialto-web/dist/index.html` (not the source —
  the criterion says _served_, and Vite processes `index.html`) through the real
  `injectNonceIntoHtml` and `buildCspDirectives` from
  `infrastructure/worker/csp.js`. Confirmed first that the pattern survives the
  Vite build verbatim.
- Evidence:

  ```
  ########## built dist/index.html — head font block ##########
        rel="preload"
        as="style"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:…&display=swap"
        data-font-stylesheet
      />
      <script>
        // Swap the preloaded font stylesheet to rel="stylesheet" once it loads.
        …
        (function () {
          var link = document.querySelector("link[data-font-stylesheet]");
          if (link) {
            link.addEventListener("load", function () {
              link.rel = "stylesheet";
            });
          }
        })();
      </script>

  ########## built output through the real edge function ##########
  script tags        : 5
  all nonced         : true
  inline on*= in dist: []
  data-font-stylesheet: true
  promotion script kept inline: true
  ```

  On the source file, the same function produces the font-promotion tag
  directly, with the nonce matching the emitted directive:

  ```
  font-promotion script     : <script nonce="deadbeefcafe0123">
  carries nonce             : true
  inline on*= handlers      : []
  script-src                : script-src 'nonce-deadbeefcafe0123' 'self' https://js.stripe.com
  ```

- Result: **PASS**

### Item 1 (behavioural) — fonts actually load under the real CSP

Not a written acceptance criterion, but the behaviour the whole run exists to
restore, and verifiable before deploy. Recorded because a criterion met on
structure while the behaviour stayed broken is exactly how this defect survived.

- Check: served `apps/rialto-web/dist/` over local HTTP through a shim that
  mirrors the edge worker — per-request nonce, `Content-Security-Policy` header
  from the real `buildCspDirectives`, HTML passed through the real
  `injectNonceIntoHtml` — then loaded it in headless Chromium and read
  `document.fonts` after `document.fonts.ready`.
- Evidence:

  ```
  {
    "fontCount": 23,
    "families": [
      "Bricolage Grotesque",
      "DM Mono",
      "DM Sans"
    ],
    "googleSheetLoaded": true,
    "preloadRel": "stylesheet",
    "bodyFamily": "\"DM Sans\"",
    "cspViolations": []
  }
  ```

  Against the defect brief's measured baseline for the same page in production
  today — `fontCount: 0`, `families: []`, `googleSheetLoaded: false`,
  `preloadRel: "preload"`, 1 CSP violation. The post-fix numbers match
  `apps/marketing`'s live production figures exactly (23 faces, same three
  families, promoted, zero violations), which is the expected result of the two
  apps now carrying byte-identical font blocks.

- Result: **PASS**

### Item 2 — the guard fails against the unfixed file (RED) and passes after (GREEN)

- Check: `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/app-html-inline-handlers.test.mjs`, run before and after the fix.
- Evidence — RED, against the unfixed `apps/rialto-web/index.html`:

  ```
  apps/rialto-web/index.html carries 1 inline event-handler attribute(s): onload.
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=DM+Sans…
  expected [ { attribute: 'onload', …(1) } ] to deeply equal []

   Test Files  1 failed (1)
        Tests  1 failed | 4 passed (5)
  ```

  The failure is on `rialto-web` and on `onload` — the right reason, not an
  incidental one. The other three apps pass in the same run, including
  `marketing`, whose nonce'd `addEventListener` and explanatory comment are the
  fix rather than an instance of the defect and must not trip the guard.

  GREEN, after:

  ```
   ✓ scripts/__tests__/app-html-inline-handlers.test.mjs (5 tests) 3ms

   Test Files  1 passed (1)
        Tests  5 passed (5)
  ```

- Result: **PASS**

### Item 2 — the guard enumerates `apps/*` rather than a hardcoded list

- Check: read the implementation and counted the generated cases. Five tests run
  from four app directories — one discovery assertion plus one case per app
  (`gen`, `hospitality`, `marketing`, `rialto-web`) — produced by
  `readdirSync(APPS_DIR)` filtered to directories containing an `index.html`,
  with no app named in the file.
- Evidence:

  ```
  Tests  5 passed (5)        # 1 discovery + 4 discovered apps
  ```

  The discovery assertion (`expect(appHtmlEntries().length).toBeGreaterThan(0)`)
  exists because a guard that silently scans nothing passes vacuously and reads
  identically to one that found nothing wrong — the failure mode from #3955.

- Result: **PASS**

### Item 2 — the failure message names the file, the attribute, and why a nonce cannot rescue it

- Check: read the full assertion message emitted in the RED run above.
- Evidence:

  ```
  apps/rialto-web/index.html carries 1 inline event-handler attribute(s): onload.

    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?…

  The edge CSP sets script-src 'nonce-<nonce>' 'self' with no 'unsafe-inline'
  (infrastructure/worker/csp.js), and injectNonceIntoHtml only adds a nonce to
  <script> *tags* — an event-handler *attribute* cannot carry one, so the browser
  refuses it on every page load with no server-side signal that it happened.

  Move the behaviour into a <script> block the edge can nonce. See the
  data-font-stylesheet pattern in apps/marketing/index.html (#3149), and
  docs/fixes/rialto-web-fonts/defect.md for what this cost when it was missed.
  ```

  File, attribute, offending tag, mechanism, and the fix to copy — the next
  person hits an explanation, not a bare assertion diff.

- Result: **PASS**

### No regression in sibling checks

- Check: full `scripts/` suite.
- Evidence:

  ```
   Test Files  119 passed (119)
        Tests  2169 passed (2169)
     Duration  10.57s
  ```

- Result: **PASS**

### Item 3 — `document.fonts.size > 0` on the deployed `/rialto/`

- Check: **not run.** Requires the change to be deployed.
- Result: **NOT VERIFIED** — executes as Ship's post-release step. The
  local-CSP probe above is the closest available proxy and is strong (real CSP,
  real nonce injection, real built artifact), but it is not the deployed
  surface: it does not exercise the Cloudflare Worker itself, the CDN, or the
  real per-request nonce path.

## Failures

None. Nothing routes back to Implement.

## Not verified

- **The deployed surface** (item 3) — deferred to Ship by a deviation logged in
  `defect.md`. This is the run's one real gap and it is intentional, not
  overlooked.
- **Visual/typographic quality.** That DM Sans and Bricolage Grotesque now load
  is verified; that the pages _look_ right with them is not. No visual baselines
  were regenerated — see below.
- **Visual baseline impact — PREDICTED RED, DID NOT HAPPEN. Correction, 2026-08-17.**
  This section originally predicted that all 48 committed baselines in
  `apps/rialto-web/e2e/screenshots/` would shift, on the reasoning that they were
  captured against a fontless page. CI disagreed: `Visual Regression
(rialto-web)` passed on the first run.

  The prediction was wrong because the premise was.
  `apps/rialto-web/playwright.config.ts` serves the suite with `vite dev` on
  `localhost:5173` — no edge worker, and no `Content-Security-Policy` header
  anywhere in the serving path. With no CSP there is nothing to refuse the
  inline `onload`, so the old code loaded fonts perfectly well in E2E and the
  baselines already had DM Sans and Bricolage Grotesque applied. This change is
  a visual no-op in that environment.

  The correction is worth more than the prediction was: it means **the visual
  and functional E2E suites are structurally incapable of catching this class of
  defect**, because they never execute behind the CSP that causes it. "Local
  gates cannot see this" was asserted at Capture on general grounds; this is the
  concrete mechanism. Seeded to `docs/backlog.md`.

- **The other three apps' fonts.** `gen` and `hospitality` reference no web
  fonts at all (verified — no font links in their `index.html`); `marketing` was
  confirmed healthy in production while capturing the defect brief. Neither is
  changed by this run.
- **CSP breakage that is not an inline handler.** The guard catches the shape,
  not the class. Known and accepted at Capture; the live-surface check that
  would cover the class remains a backlog seed.
