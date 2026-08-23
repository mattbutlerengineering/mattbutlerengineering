---
stage: capture
run: maintenance:e2e-behind-edge-csp
date: 2026-08-21
re-entry: architect
assumptions:
  - "re-entry depth was not specified by the user — capture chose `architect`. Reasoning is in the Re-entry depth section below: the three candidate mechanisms differ in what they can catch (not just in cost), 'reuse the real CSP' hides a second fork between the pure header builder and the workerd-only nonce injector, and the change replaces the server both CI jobs run against rather than adding to it. Every work item honestly writable today reduces to 'decide the mechanism', which is the architect stage wearing a checkbox."
  - "The backlog seed claim was deferred, deviating from the capture skill's step 2. The skill has capture append `(claimed: maintenance:e2e-behind-edge-csp)` to the seed line in `docs/backlog.md` now; this stage was scoped read-only on every file but `defect.md`, so the claim is recorded here as an outstanding action for whichever stage opens the run's branch. See Notes."
---

# Condition: rialto-web E2E never runs under the production CSP

Origin: `docs/backlog.md` seed (line 28, `from: maintenance:rialto-web-fonts`) —
"Run at least one E2E pass behind the real edge CSP". Not yet claimed in place; see Notes.

Variant: **condition brief** (something is degraded), not a defect brief. There is no
single broken behavior to reproduce — the degradation is a hole in the test harness, and
the run ends when the hole is closed.

## Condition

**Degraded:** `apps/rialto-web`'s Playwright suite is served by `vite dev`, which sets no
`Content-Security-Policy` header. Production serves the same app through
`infrastructure/worker`, which attaches a strict nonce-based CSP to every HTML response
and nonces every `<script>` tag on the way out. The harness therefore cannot observe the
policy production enforces, so **every CSP-caused defect in this app is invisible to E2E
by construction, not by oversight**. Eight spec files and two CI jobs all run against a
document that can never be refused.

**Target state that ends the run:** at least one E2E pass over `apps/rialto-web` executes
against a served document carrying the real production CSP — the same directive set the
edge emits, with the same per-request nonce injection — such that a CSP refusal fails the
run. Concretely: reintroducing the `rialto-web-fonts` defect (an inline `on*=` handler, or
an un-nonced inline script) must turn that pass red.

## Reproduction / Evidence

Verified against `origin/main` at `4aa48f562` on 2026-08-21 unless attributed otherwise.

**The harness applies no policy.** `apps/rialto-web/playwright.config.ts` sets
`webServer.command` to `pnpm --filter @mbe/rialto-web dev -- --port 5173 --strictPort` and
`use.baseURL` to `http://localhost:5173/rialto/`. There is no CSP anywhere in the config,
and `vite dev` sets none. This has been true since the config landed (`2c5d5797b`,
2026-02-25) — the `webServer` block has never pointed anywhere but the dev server.

**Nothing else in the repo covers the gap.** No Playwright config and no spec in any app
references `Content-Security-Policy`. The only CSP guard in the repo is
`scripts/cors-audit.mjs`, which string-scans the edge router's _source text_ for required
header names — it never loads a page, so it cannot see a refusal.

**The app itself emits no CSP.** `apps/rialto-web/wrangler.toml` is a Workers Static Assets
config whose only `[[headers]]` block sets `Cache-Control` on `/assets/*`. The policy is
the edge router's alone.

**Production's policy, and where it comes from.**
`infrastructure/worker/response-formatter.js` builds security headers per request
(`buildSecurityHeaders`, line 19) with
`"Content-Security-Policy": buildCspDirectives(nonce, { kvPolicy })`, and for any
`text/html` response pipes the body through
`new HTMLRewriter().on("script", new NonceInjector(nonce))` (line 100). The nonce is
`crypto.randomUUID().replace(/-/g, "")`, generated per request in `edge-router.js`.
`infrastructure/worker/csp.js`'s hardcoded defaults are:

```
default-src 'self'; script-src 'nonce-<n>' 'self' https://js.stripe.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' <auth0-origin> https://api.mattbutlerengineering.com <sentry-ingest>;
frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none';
base-uri 'self'; form-action 'self'
```

`infrastructure/worker/csp.test.js` locks that string byte-for-byte ("is byte-identical to
current hardcoded policy when using defaults"), with the nonce as the only permitted
per-request delta. The header measured live against `https://mattbutlerengineering.com/rialto/`
on 2026-08-21 (per the run brief; not re-measured here) matches these defaults
directive-for-directive, which is consistent with no KV override (`security/csp`) being
active. Confirming the KV key's actual state needs Cloudflare access and was not done.

**What that policy would be applied to.** `apps/rialto-web/index.html` carries three inline
`<script>` blocks with no `nonce` attribute in source — the font-stylesheet swap IIFE, an
`application/ld+json` block, and a service-worker unregister block — plus
`<script type="module" src="/src/main.tsx">`. In production all four are nonced by
`NonceInjector` at the edge. No local vite server performs that step.

**Two realized defects this hole hid** (both from prior runs' retros, cited in the brief):

- `docs/fixes/rialto-web-fonts/` — an inline `onload="this.rel='stylesheet'"` violated
  `script-src`, so the Google Fonts stylesheet was never promoted and the design system's
  own showcase rendered in `system-ui` for nine weeks. Every gate stayed green throughout.
- `docs/features/rialto-game-ui/` — the Sentry ingest origin was missing from `connect-src`
  until PR #4315, so every browser error envelope from every app was refused, with no
  server-side signal.

The same class crossed apps: #3149 fixed the inline-`onload`-under-nonce-CSP defect in
`apps/marketing` on 2026-07-04 while `apps/rialto-web` carried the identical bug from
2026-06-14.

Per the protocol, Verify is never skippable in a maintenance run: the "reintroduce the
`rialto-web-fonts` defect and watch the run go red" case above is this run's regression
test.

## Root-cause hypothesis

Not a bug with a cause — a harness that was never asked to model the edge. The dev server
was chosen for iteration speed when the config was imported wholesale in February
(`2c5d5797b`), before the nonce-based CSP existed as a thing E2E could contradict, and
nothing since has revisited it.

The design question the run has to answer, stated as a **hypothesis, not a finding**: the
cheap mechanisms may not be able to run against `vite dev` at all. The dev server injects
its own client and React-refresh preamble as inline scripts that no edge nonce-injector
touches, so a strict `script-src 'nonce-…'` would plausibly refuse the dev server's own
machinery before it ever reaches app code — pushing the answer toward serving built output
(`vite preview`, which `apps/marketing/playwright.config.ts` already does under CI) or
workerd. This was reasoned from the config, **not measured**; measuring it is early
architect work, and if it is false the cheap mechanisms come back into play.

## Blast radius

- **Scope of the blind spot:** all 8 `e2e/*.spec.ts` files in `apps/rialto-web` and both
  jobs of `.github/workflows/rialto-web-e2e.yml` (`visual`, `functional`). None of them can
  fail for a CSP reason today.
- **Who is affected:** every visitor to `https://mattbutlerengineering.com/rialto/` — the
  design system's public showcase — plus anyone relying on its error telemetry. Both
  realized instances above were user-visible or observability-destroying and both survived
  a full green board.
- **How badly:** silently. A CSP refusal produces no 4xx, no server log, and no Sentry
  event (Sentry's own envelope is CSP-blocked in the failure mode that matters). Detection
  to date has been a human opening devtools against the deployed page.
- **Since when:** 2026-02-25, the day the harness landed.
- **Not in scope but same hole:** `apps/hospitality` (dev server) and `apps/marketing`
  (`vite preview`, still no CSP) have the identical gap. Only rialto-web is in this run;
  the brief asks that any trivially shared mechanism be named rather than silently widened.
- **Downstream scale:** the expected change is test harness + CI wiring, touching no
  production runtime path — Review and Ship scale accordingly. The one thing that would
  widen it: turning the real policy on may surface _existing_ violations beyond the guarded
  one. Per the brief that is a success, not a failure, and it must be surfaced rather than
  silently fixed.

## Ruled out

- **Changing the production CSP.** Out of scope by the brief, and the policy is correct —
  `csp.test.js` locks it byte-for-byte precisely so it cannot drift. The harness is what is
  wrong.
- **Adding a CSP header in `apps/rialto-web/wrangler.toml`.** Measured: that config emits
  no CSP today, and the edge router is the single source of the policy. A header there
  would create a second copy to drift — the exact outcome the brief's "reuse
  `infrastructure/worker/csp.js`" note exists to prevent.
- **Treating `scripts/cors-audit.mjs` as existing coverage.** It is a static scan of the
  edge router's source text for header names; it never renders a page. A defect where the
  policy is perfect and the _app_ violates it is invisible to it by design.
- **The Cloudflare Insights beacon as a CSP or production fault.** Measured during brief
  collection (2026-08-21) and recorded in the brief: the injected tag is correctly nonced
  and CSP does not block it; `dig +short static.cloudflareinsights.com` returns `0.0.0.0`
  through the LAN resolver `192.168.4.40` but real Cloudflare addresses through `@1.1.1.1`,
  and `curl --resolve …:443:104.16.80.73` returns HTTP 200 with real JavaScript. It is a
  LAN-level DNS sinkhole on the probing machine. Do not re-investigate, and do not "fix"
  the beacon. See the record correction in Notes.

## Re-entry depth

`re-entry: architect`. The user did not specify; this is capture's call, logged under
`assumptions:`. Three reasons:

1. **The mechanism choice _is_ the run.** Playwright route interception, a preview-server
   middleware, and running the real worker under `wrangler dev` are not three costs for one
   outcome — they differ in what a passing run proves. Route interception asserts against a
   re-implementation of the edge; workerd asserts against the edge. Picking one without a
   written rationale is the decision this pipeline has an architect stage to prevent.
2. **"Reuse the real CSP" hides a second fork.** `buildCspDirectives` genuinely reproduces
   the production header. But the nonce _injection_ production performs is
   `HTMLRewriter` + `NonceInjector` in `response-formatter.js` — a workerd API.
   `csp.js`'s own docstring describes `injectNonceIntoHtml` as a plain-string **mirror** of
   it, existing so the behavior can be unit-tested in Node. A harness built on the mirror
   reuses a copy, not the path. How much of that fidelity gap is acceptable — and what
   class of defect the guard consequently cannot catch — is a design decision with
   consequences, and it belongs in `architecture.md` where it can be read later.
3. **The change is substitutive, not additive.** If the policy cannot be applied over
   `vite dev` (the hypothesis above), the fix replaces the server _both_ CI jobs run
   against — including `visual`, whose baselines are Linux-CI-runner-specific and would
   need regeneration from a CI artifact. Add the open scope question about
   `marketing`/`hospitality`, and there is more sequencing here than a checkbox list.

Counter-argument, acknowledged: if the answer turns out to be route interception, the diff
is perhaps thirty lines, and `architect` looks like ceremony. It is worth it anyway — the
brief calls this "the run's central design call", and a small diff arrived at by an
unrecorded choice between three unlike options is how the repo got the condition it is now
fixing. The protocol's run-scale section allows a maintenance architecture note to be a
paragraph; it does not allow the choice to go unrecorded.

Work items are therefore deliberately absent from this brief: `architecture.md` +
`breakdown.md` own them.

## Notes

**Outstanding: claim the backlog seed.** Per the protocol's seed-backlog section, this run
starts from `docs/backlog.md` line 28 ("Run at least one E2E pass behind the real edge CSP
… (from: maintenance:rialto-web-fonts)") and that line must get
`(claimed: maintenance:e2e-behind-edge-csp)` appended in place — never rewriting the
existing `(from: …)` marker. Capture was scoped read-only on every file but this one, so
the claim is deferred to whichever stage first opens the run's branch. Logged under
`assumptions:`.

**Folded-in record correction — ride this run's PR, do not open a separate one.** Two
committed claims were proven false during brief collection on 2026-08-21 (evidence in
Ruled out, above):

1. `docs/backlog.md` — the seed on line 23 ("Fix or remove the failing Cloudflare Insights
   beacon — `static.cloudflareinsights.com/beacon.min.js` returns `ERR_CONNECTION_REFUSED`
   on every page load") is wrong. Remove it, or rewrite it as resolved-not-a-defect, so it
   stops being re-picked.
2. `docs/features/rialto-game-ui/retro.md` lines 33-35 — "There is also no analytics, no
   beacon … The Cloudflare Insights beacon that _is_ injected fails to load" is wrong on
   the beacon specifically.

Keep the correction factual and short. The broader claim in that retro — that rialto-web
has no _first-party_ usage instrumentation — still stands and is a separate open seed
(line 10); only the beacon sentence is wrong. Whether events actually land in the
Cloudflare Web Analytics dashboard was **not** verified (needs dashboard access) — do not
assert that they do.

**Tracker policy.** Mirror **out** only (ADR-0026); nothing in the tracker seeds this run.
Because re-entry is `architect`, the normal path applies: work items are published as
GitHub issues at Decompose, with the mapping recorded in `breakdown.md`, each closing as
its item completes. The brief's alternate instruction — publish inline in `defect.md` when
there is no `breakdown.md` — does not apply here.

**Wiring constraint for any new spec.** `apps/rialto-web/e2e/workflow-coverage.test.ts`
fails if an `e2e/*.spec.ts` file is not referenced by full path in
`.github/workflows/rialto-web-e2e.yml`. Per #3955 the workflow uses an explicit file list,
never a glob; a new spec must be added to that list or `pnpm --dir apps/rialto-web test`
goes red. Note the gate only covers `*.spec.ts` — `a11y.test.ts` and
`workflow-coverage.test.ts` sit in the same directory and are outside it.

**Reuse target is a real workspace package.** `infrastructure/worker` is `@mbe/edge-worker`
(private, `type: module`) with its own vitest config since #3911, so importing `csp.js`
from a harness is supported rather than a reach across a boundary.

**Flagged, not fixed (pre-existing, outside this run's scope).**
`scripts/cors-audit.mjs`'s CSP-specific branch matches on
`/Content-Security-Policy['"]\s*:\s*\[([\s\S]*?)\]\.join/` — an array-`.join` form the
worker no longer uses. Measured today: that regex matches none of `response-formatter.js`,
`edge-router.js`, or `csp.js`, so the `unsafe-inline`-without-nonce and `unsafe-eval`
findings cannot fire. The required-header-presence check still works (plain
`content.includes`). Someone should decide whether to repair or delete the dead branch;
it is not this run's job.

**Constraints carried from the brief.** Node 22 (`.nvmrc`, `nvm use`). Deploys go through
GitHub Actions only — never manual `wrangler` or `doctl`. Worktree agents run
`pnpm install --frozen-lockfile` first and `pnpm typecheck` before declaring done
(`.husky/pre-push` runs neither). The PostToolUse prettier hook leaves ~171 files
permanently dirty — never `git add -A`, stage explicit paths only. Files written via Bash
heredoc skip all formatting hooks; run prettier on them with an explicitly resolved
`--config` or CI's Build job fails repo-wide. Visual baselines are Linux-CI-specific:
regenerate from the CI artifact, never from macOS.

**Release authorization (from the brief).** Authorized through merge — open the PR, run the
gates, merge on green (squash, delete branch); deployment follows through GitHub Actions.
Hard stops that override it: unfixed critical review findings, a non-green `CI Gate` (the
only required check; `codecov/patch` and `Hospitality E2E` are advisory), and green-main
policy — if `main` breaks, fixing it outranks this run.
