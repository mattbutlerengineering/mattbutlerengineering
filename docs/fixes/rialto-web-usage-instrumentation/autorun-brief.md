# Autorun brief — rialto-web usage instrumentation

Collected 2026-09-03 in one interview. This file is the only interview the
run gets; every stage reads it instead of asking. It is not an artifact and
never counts toward orientation.

## Run

- **Scale:** maintenance run (`docs/fixes/rialto-web-usage-instrumentation/`).
  First stage is `capture` → `defect.md`.
- **Slug:** `rialto-web-usage-instrumentation`
- **Origin:** `docs/backlog.md` line 12 — "Give rialto-web any usage
  instrumentation at all — the deployed document carries exactly one script
  tag (the app bundle), no beacon and no edge injection, so 'did anyone use
  this route' is unanswerable for every feature run against this app, not
  just early (from: feature:rialto-game-ui)". Capture claims it with
  `(claimed: maintenance:rialto-web-usage-instrumentation)`.
- **Why maintenance, not idea:** the capture skill says a missing capability
  is a feature. The user chose maintenance anyway, on this reasoning: the
  repo already _shipped_ usage instrumentation for every static route (the
  edge worker's `writeAnalytics` and its `[[analytics_engine_datasets]]`
  declaration) and it has never once executed in production, because the
  binding is missing from the Pulumi-managed script. That is a shipped≠run
  defect in an existing mechanism, with a documented precedent for the
  shape: `docs/fixes/backend-observability-blackout/defect.md` (a condition
  brief with `re-entry: architect`). Record this decision in `defect.md`
  frontmatter under `assumptions:`; recommended `re-entry: architect`.
- **Branching:** this working tree is the worktree
  `.claude/worktrees/docs+readme-world-class` on branch
  `worktree-docs+readme-world-class`. It carries **uncommitted, unrelated**
  changes to `README.md` and `docs/autonomous-loop.svg` — never stage them.
  At the start of Implement: `git fetch origin`, then create
  `fix/rialto-web-usage-instrumentation` from `origin/main` and commit all
  run work there. The PR targets `main`.

## What is degraded

Nobody can answer "did anyone use `/rialto/<route>`" for the deployed
showcase. Every feature run against rialto-web (rialto-game-ui and later)
ends its retro with "no usage evidence" — see
`docs/features/rialto-game-ui/retro.md:33-45`. Four separate sources look
like instrumentation and none of them produces a usable count.

## Evidence (measured 2026-09-03 unless dated otherwise)

1. **Edge Analytics Engine writes never happen in production.**
   - `infrastructure/worker/edge-router.js:60-69` defines `writeAnalytics`
     (blobs `[route, method, country, pathname]`, doubles
     `[status, elapsedMs]`, indexes `[route]`) and calls it at `:201` (`"api"`)
     and `:282` (`routeName` from `routes-config.json` — `hospitality`,
     `rialto`, `gen`, `marketing`).
   - It early-returns on `if (!env.ANALYTICS) return;`.
   - `infrastructure/worker/wrangler.toml:39-43` declares
     `[[analytics_engine_datasets]] binding = "ANALYTICS" dataset = "edge_requests"`
     — but wrangler.toml is **not** what deploys the edge router.
   - The production script is the Pulumi `WorkersScript`
     `mattbutlerengineering-edge-router` at `infrastructure/pulumi/index.ts:306-320`
     whose bindings are exactly: `API_ORIGIN` (plain_text), `MARKETING` /
     `HOSPITALITY` / `RIALTO` / `GEN` (service), `HEALTH_STATE`
     (kv_namespace). **No `analytics_engine` binding.** `pulumi-up.yml` is the
     only deploy path (triggers on `infrastructure/worker/**`, `apps/gen/**`).
   - `infrastructure/worker/edge-router.test.js:111` mocks `ANALYTICS:
createMockAnalytics()` and `:803-812` asserts `writeDataPoint` calls, so
     the unit suite is green while production has never written a data point.
   - `infrastructure/pulumi/index.test.ts:571-612` asserts the service
     bindings, `API_ORIGIN`, and the `HEALTH_STATE` kv binding on the edge
     router — nothing asserts an analytics binding, so nothing could have
     caught the drift.
   - `scripts/check-service-bindings.js` syncs `[[services]]` binding names
     across wrangler.toml / routes-config.json / Pulumi. It ignores
     `[[analytics_engine_datasets]]`, which is exactly where the drift lives.
2. **Cloudflare Web Analytics beacon is injected but probably refused by
   CSP.** The zone-level edge injection adds a `beacon.min.js` tag for
   browser UAs (token `0c3656fe25764d6b891842c8ceb2e718`, `spa:2`). It
   POSTs to `https://cloudflareinsights.com/cdn-cgi/rum`, and
   `infrastructure/worker/csp.js:58` `connect-src` lists only `'self'`, the
   Auth0 origin, `https://api.mattbutlerengineering.com`, and the Sentry
   ingest origin. Hypothesis, **not confirmed**: the LAN resolver
   (192.168.4.40) sinkholes `cloudflareinsights.com` to `0.0.0.0`, so a local
   browser probe cannot distinguish "CSP refused" from "DNS ate it". Verify
   only from CI/Linux or with `curl --resolve`. Out of scope for this run
   (see Scope); Capture parks it as a backlog seed.
3. **Sentry emits no usage signal.** `packages/sentry/src/react.ts:27-33`
   initialises with `integrations: []`, replay sample rates 0, no tracing.
   Sentry org `mattbutlerengineering` (region `https://us.sentry.io`),
   30-day span search on rialto-web: **0 spans**. Errors only.
4. **The rialto-web cookie banner's `analytics` toggle governs nothing.**
   `apps/rialto-web/src/components/CookieConsent/useCookieConsent.ts`
   (`analytics: boolean`, default `false`, `STORAGE_KEY = "rialto-cookie-consent"`)
   and `CookieConsent.tsx:85` (`key: "analytics"`) — no code path reads the
   value to enable or disable anything. Tests: `CookieConsent.test.tsx`,
   `useCookieConsent.test.ts`. This is `docs/backlog.md` line 13 for
   rialto-web; the run resolves it by removing the toggle (decision below).
5. **No consumer exists.** Nothing in the repo queries Analytics Engine or
   Web Analytics; even if data existed, no script or runbook turns it into
   "N requests to /rialto/x in the last 7 days".

## Decisions already taken (user, 2026-09-03)

- **Sink: bind edge Analytics Engine.** Add an `analytics_engine` binding
  (`name: "ANALYTICS"`, `dataset: "edge_requests"`) to the Pulumi
  `WorkersScript` so the existing `writeAnalytics` path runs in production.
  Server-side, no cookies, no client change, no new script tag. Accepted
  limitation: blind to in-app SPA navigations (only document/asset requests
  reaching the edge are counted).
- **Consent: drop the toggle.** Remove the `analytics` preference from the
  rialto-web cookie banner (hook, dialog, tests). Edge request logging with
  no cookie and no client identifier does not need a consent toggle, and a
  toggle that controls nothing is worse than none. Resolves backlog line 13
  for rialto-web only.
- **Query path: script + docs.** A Node script (suggested
  `scripts/edge-usage.mjs`) that POSTs SQL to
  `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`
  with `Authorization: Bearer $CLOUDFLARE_API_TOKEN`, defaulting to
  requests per `blob1` (route) and `blob4` (pathname) over the last 7 days,
  summing `_sample_interval` so sampled rows count correctly. Plus a short
  runbook under `docs/` and a line in the rialto-game-ui-style retro
  checklist explaining how to read it. Follow `scripts/resource-audit.mjs`
  for env handling (`requireEnv`, same two env var names, same
  `fetch`-with-Bearer pattern).

## Target state

- `pulumi preview` (or the Pulumi unit test) shows the edge router
  `WorkersScript` carrying an `analytics_engine` binding named `ANALYTICS`
  on dataset `edge_requests`.
- `infrastructure/pulumi/index.test.ts` asserts that binding; a drift guard
  (extend `scripts/check-service-bindings.js` or a sibling) fails when
  wrangler.toml declares an `analytics_engine_datasets` binding the Pulumi
  script lacks (or vice versa).
- `writeAnalytics` field layout is documented where the query script reads
  it, so blob/double positions cannot silently drift apart.
- Cookie banner has no `analytics` preference; tests updated; existing
  stored `rialto-cookie-consent` values with the old key still parse.
- `node scripts/edge-usage.mjs` prints route/path request counts or exits
  non-zero with a clear message when the token or account id is absent.
- Runbook tells a future retro exactly what to run and what "no rows" means
  in the first hours after deploy.

## Useful starting points

- `infrastructure/pulumi/index.ts:306-320`, `index.test.ts:565-612`,
  `vitest.config.ts`; run with `pnpm --dir infrastructure/pulumi test`.
  Confirm the binding shape against the installed `@pulumi/cloudflare`
  types (`WorkersScriptBinding` — look for a `dataset` field) before
  writing it.
- `infrastructure/worker/wrangler.toml:39-43`, `edge-router.js:60-69`,
  `edge-router.test.js:803-812`; run with `pnpm --dir infrastructure/worker test`.
- `scripts/check-service-bindings.js` (`parseWranglerBindings(root)`) and its
  test, for the drift guard.
- `scripts/resource-audit.mjs` for the Cloudflare API + env-var pattern;
  `docs/SECRETS.md` lists `MBE_CLOUDFLARE_API_TOKEN` scopes ("Pages
  deploys, KV, DNS, Pulumi") — Account Analytics Read is **not** listed.
- `apps/rialto-web/src/components/CookieConsent/*` and tests; run with
  `pnpm --dir apps/rialto-web test`.
- `.github/workflows/pulumi-preview.yml` is `workflow_dispatch`-only; it
  does not run on PRs. Verify may dispatch it on the run branch and read the
  plan, or rely on the unit test plus a local `pulumi preview` if
  credentials are present. Never run `pulumi up` in this run.
- Precedents: `docs/fixes/backend-observability-blackout/` (condition
  brief), `docs/fixes/e2e-behind-edge-csp/` (brief format, CSP harness).

## Scope

**In**

- Pulumi binding + test + drift guard.
- Cookie banner `analytics` toggle removal (rialto-web only).
- Query script + runbook + retro-checklist pointer.
- Backlog edits: claim line 12; mark line 13 resolved for rialto-web; add
  the CSP/Web-Analytics seed from Evidence 2.

**Out**

- Any CSP `connect-src` change or Web Analytics work (park as seed).
- CSP `report-to` (backlog line 32).
- Client-side or SPA-navigation instrumentation, Sentry tracing, any new
  script tag in rialto-web.
- Changes to hospitality, marketing, or gen beyond what the shared edge
  binding gives them for free.
- New paid infrastructure or auth-model changes (PRODUCT.md guardrails).
  Analytics Engine free tier is assumed sufficient; if the architect finds
  a cost, stop and surface.

## Constraints

- Node 22 (`.nvmrc`); run `pnpm install --frozen-lockfile` first in this
  worktree, `pnpm typecheck` before declaring any stage done.
- Deploys happen only through GitHub Actions; no `wrangler deploy`, no
  `pulumi up`, no `doctl`.
- Never `git add -A`; stage explicit paths. The PostToolUse prettier hook
  leaves ~170 unrelated files dirty — ignore them. Do not stage `README.md`
  or `docs/autonomous-loop.svg`.
- Prettier-format every doc before the PR: `pnpm exec prettier --check
docs/fixes/rialto-web-usage-instrumentation/ docs/backlog.md` plus any
  runbook path (docs-only diffs skip CI's prettier check and poison later
  builds).
- TDD: failing test first for the Pulumi binding, the drift guard, the
  cookie-consent removal, and the script's argument/env handling.
- Surgical: touch only files this run needs; flag adjacent smells, do not
  fix them.
- Verify is never skippable and quotes real command output.

## Tracker policy

No tracker interaction. No issues created, edited, or referenced. The only
externally visible object is the PR opened at Ship.

## Release authorization

**Prepare and stop.** Ship opens the PR (base `main`), runs pre-flight
checks, and writes `release.md` recording readiness and the exact steps a
human takes (merge → `pulumi-up.yml` runs on the `infrastructure/pulumi/**`
change → first `edge_requests` rows appear → run `scripts/edge-usage.mjs`).
No merge, no deploy, no tag. Hard stops regardless of anything else:
unfixed critical review findings, a failed Verify, or any step that would
need a credential the run does not have.

## Known unknowns (stop-and-surface triggers are marked ⛔)

- ⛔ A Cloudflare API token with **Account Analytics Read** is needed to
  run the query script for real. `MBE_CLOUDFLARE_API_TOKEN` is documented
  without that scope and its value is not available to the run. Verify
  proves the script's request shape with a mocked `fetch` and stops with a
  clear note if no token is present locally; release.md lists provisioning
  the scope as the first human step.
- Analytics Engine free-tier limits (data points/day, retention) — the
  architect checks the current documented limits and records them; if the
  edge's request volume could exceed a free limit, stop and surface.
- The exact `@pulumi/cloudflare` binding field name for the dataset in the
  installed version — resolve from `node_modules` types, not memory.
- Whether `pulumi preview` can run in this environment (needs R2
  credentials). If not, Verify says so and relies on the unit test plus a
  dispatched `pulumi-preview.yml` run if `gh` auth allows.
- Evidence 2 (CSP refusing the Web Analytics beacon) stays a hypothesis
  until probed off the sinkholed LAN; it is parked, not resolved, here.
- Edge counts undercount real usage (SPA navigations invisible); the
  runbook must say so plainly so a future retro does not misread a low
  number.
