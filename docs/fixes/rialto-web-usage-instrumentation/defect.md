---
stage: capture
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-03
re-entry: architect
origin: "docs/backlog.md seed (from: feature:rialto-game-ui), claimed in place as maintenance:rialto-web-usage-instrumentation"
assumptions:
  - "No live user input was available. The interview was answered entirely from docs/fixes/rialto-web-usage-instrumentation/autorun-brief.md. Every file:line citation below was re-verified with grep/sed in this worktree on 2026-09-03 (0 commits ahead of / 1 behind origin/main; none of the cited files differ from origin/main). Network, Sentry, and browser measurements were NOT re-run — they are carried from the brief and labelled with its date."
  - "Maintenance run, not a feature run — the user's decision (2026-09-03). The capture skill routes a missing capability to `idea`; the user chose `capture` because usage instrumentation for every static route already SHIPPED — `writeAnalytics` in `infrastructure/worker/edge-router.js` and the `[[analytics_engine_datasets]]` declaration in `infrastructure/worker/wrangler.toml`, both landed 2026-05-22 in `bd5dd7083` — and has never executed in production, because the Pulumi-managed `WorkersScript` that actually deploys the router carries no `analytics_engine` binding. That is a shipped≠run defect in an existing mechanism, the same shape as `docs/fixes/backend-observability-blackout/defect.md` (a condition brief, `re-entry: architect`), not a capability that was never built."
  - "re-entry: architect — the brief's recommended default, taken. Rationale in § Notes → Why architect."
  - "Condition brief, not defect brief. The brief frames the problem as 'what is degraded' plus 'target state' and names a condition brief as the precedent; nothing crashes — a question is unanswerable."
  - "No tracker interaction (brief § Tracker policy): no intake issue seeded this brief, so there is no `intake:` field, and nothing is filed or referenced."
  - "The brief's Evidence 2 (Web Analytics beacon probably refused by the edge CSP `connect-src`) is parked as a new unclaimed seed appended to docs/backlog.md, not investigated — per the brief's Scope. Appended (not inserted) because the protocol's seed-backlog section says producers append."
  - "Onset date derived from git history in this worktree (`git log -S`), not from the brief, which is silent on it. Recorded as a hypothesis with the commit SHA, per the capture skill's rule on hypotheses."
---

# Condition: rialto-web usage is uncountable — the edge counter shipped in May and has never written a row

## Condition

Asked a plain product question — "did anyone use `/rialto/<route>` last week?" — and it
is unanswerable for the deployed showcase. Not approximately answerable, not answerable
with effort: there is no data, and no place data could have accumulated.

Every feature run against rialto-web ends its retro the same way.
`docs/features/rialto-game-ui/retro.md:33-47` records "no first-party usage
instrumentation and no server-side route counter … Signal strength: **none**", and the
`hospitality-animations` run closed on 2026-09-03 with the same shape ("zero prod
evidence", `docs/backlog.md`). The pipeline's Operate stage has a standing hole exactly
where "did users touch this" should go.

Four separate things look like instrumentation, and none of them produces a usable count:

1. **The edge router's Analytics Engine writes never happen.** `writeAnalytics` exists,
   is called on every static-site and API response, and early-returns on
   `if (!env.ANALYTICS) return;`. The binding is declared in `wrangler.toml` — a file
   nothing in the deploy path reads — and absent from the Pulumi `WorkersScript` that is
   the production router. The unit suite mocks the binding and is green.
2. **The zone-level Cloudflare Web Analytics beacon is injected but its events probably
   never leave the browser.** The edge CSP `connect-src` does not list
   `cloudflareinsights.com`. Hypothesis only; parked (see Notes).
3. **Sentry emits no usage signal.** The React init ships `integrations: []`, replay off,
   no tracing. Errors only; 0 spans in 30 days.
4. **The rialto-web cookie banner's `analytics` toggle governs nothing.** No code path
   outside `CookieConsent/` reads the value.
5. **No consumer exists.** Nothing in the repo queries Analytics Engine or Web Analytics,
   so even if rows existed nobody could turn them into "N requests to `/rialto/x`".

**Target state that ends this run** (from the brief, 2026-09-03):

- `pulumi preview` (or the Pulumi unit test) shows the edge router `WorkersScript`
  carrying an `analytics_engine` binding named `ANALYTICS` on dataset `edge_requests`.
- `infrastructure/pulumi/index.test.ts` asserts that binding, and a drift guard (an
  extension of `scripts/check-service-bindings.js` or a sibling) fails when
  `wrangler.toml` declares an `analytics_engine_datasets` binding the Pulumi script lacks,
  or vice versa.
- The `writeAnalytics` field layout (blobs `[route, method, country, pathname]`, doubles
  `[status, elapsedMs]`, indexes `[route]`) is documented where the query script reads it,
  so positions cannot silently drift apart.
- The cookie banner has no `analytics` preference; tests updated; a stored
  `rialto-cookie-consent` value that still carries the old key parses.
- `node scripts/edge-usage.mjs` prints route/path request counts for the last 7 days, or
  exits non-zero with a clear message when `CLOUDFLARE_API_TOKEN` or
  `CLOUDFLARE_ACCOUNT_ID` is absent.
- A runbook under `docs/` tells a future retro exactly what to run and what "no rows"
  means in the first hours after deploy — and says plainly that edge counts undercount
  (SPA navigations never reach the edge).

## Reproduction / Evidence

Two classes. **Re-verified** means read from this worktree on 2026-09-03 with
`grep`/`sed -n`/`git log`, output quoted. **Carried** means measured by the brief's
author on the date given and not re-run here.

### 1. Edge Analytics Engine writes never happen in production — re-verified

The write path exists and is wired to every response:

```
$ grep -n "writeAnalytics\|env.ANALYTICS" infrastructure/worker/edge-router.js
60:function writeAnalytics(env, request, route, statusCode, startTime) {
61:  if (!env.ANALYTICS) return;
64:  env.ANALYTICS.writeDataPoint({
201:      writeAnalytics(env, request, "api", apiResponse.status, startTime);
282:    writeAnalytics(env, request, routeName, response.status, startTime);
```

`edge-router.js:60-69` writes blobs `[route, request.method, country, pathname]`,
doubles `[statusCode, elapsed]`, indexes `[route]`. `routeName` comes from
`infrastructure/worker/routes-config.json` — `hospitality`, `rialto`, `gen`, `marketing`.

The binding is declared where nothing deploys from:

```
$ sed -n '39,43p' infrastructure/worker/wrangler.toml
# Analytics Engine — custom request metrics (free tier, non-blocking writes)
# Query via SQL API: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "edge_requests"
```

The production script is the Pulumi resource at `infrastructure/pulumi/index.ts:306-320`,
`cloudflare.WorkersScript("mattbutlerengineering-edge-router")`, whose `bindings` array
is exactly six entries: `API_ORIGIN` (`plain_text`), `MARKETING` / `HOSPITALITY` /
`RIALTO` / `GEN` (`service`), `HEALTH_STATE` (`kv_namespace`). No `analytics_engine`
entry:

```
$ grep -n "analytics\|ANALYTICS" infrastructure/pulumi/index.ts infrastructure/pulumi/index.test.ts
(no output)
```

`pulumi-up.yml` is the only deploy path for the router. It triggers on
`infrastructure/pulumi/**`, `infrastructure/worker/**`, `apps/gen/**`
(`.github/workflows/pulumi-up.yml:7-9`) and bundles the worker itself with `esbuild`
(`:62-67`, `--outfile=infrastructure/worker/dist/edge-router.js`), which Pulumi then
reads via `readFileSync("../worker/dist/edge-router.js")` (`index.ts:309`). No workflow
runs `wrangler deploy` against `infrastructure/worker/wrangler.toml`; the only
`wrangler deploy` invocations in `.github/workflows/` target `apps/*/wrangler.toml`
(`deploy-static.yml:150,186,219`). The edge router's `wrangler.toml` is read by exactly
two things, neither of which deploys: `scripts/check-service-bindings.js:26` (parses
`[[services]]` only — its regex at `:28` is `/\[\[services\]\]\s*\nbinding\s*=\s*"(\w+)"/g`)
and `scripts/resource-audit.mjs:82` (reads worker names).

The tests are green because they supply what production lacks:

```
$ grep -n "ANALYTICS\|createMockAnalytics\|writeDataPoint" infrastructure/worker/edge-router.test.js
97:function createMockAnalytics() {
99:    writeDataPoint: vi.fn(),
111:    ANALYTICS: createMockAnalytics(),
803:      expect(env.ANALYTICS.writeDataPoint).toHaveBeenCalledTimes(1);
804:      const call = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
812:      const call = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
816:    it("does not fail when ANALYTICS binding is absent", async () => {
818:      delete envWithoutAnalytics.ANALYTICS;
```

```
$ pnpm --dir infrastructure/worker exec vitest run edge-router.test.js -t "Analytics Engine"
 ✓ edge-router.test.js (58 tests | 55 skipped) 20ms
      Tests  3 passed | 55 skipped (58)
```

```
$ pnpm --dir infrastructure/pulumi test
 ✓ ingress-coverage.test.ts (3 tests) 7ms
 ✓ index.test.ts (80 tests) 566ms
      Tests  83 passed (83)
```

`index.test.ts:571-612` asserts the four service bindings, `API_ORIGIN`, and the
`HEALTH_STATE` kv binding on the edge router. Nothing asserts an analytics binding, so
nothing could have caught the drift. Note `edge-router.test.js:816-822` goes further than
not catching it — it asserts that a missing `ANALYTICS` binding is _tolerated_, which is
the production state.

**Timeline, from git history:**

```
$ git log --format="%h %ad %s" --date=short -S "mattbutlerengineering-edge-router" -- infrastructure/pulumi/index.ts
7f2a3649c 2026-03-10 feat: CF Pages + Worker edge router cutover

$ git log --format="%h %ad %s" --date=short -S "analytics_engine_datasets" -- infrastructure/worker/wrangler.toml
bd5dd7083 2026-05-22 feat(infra): add Cloudflare Analytics Engine to edge router (#1574) (#1628)

$ git show --stat bd5dd7083
 infrastructure/worker/edge-router.js      | 19 ++++++++++++++++++
 infrastructure/worker/edge-router.test.js | 33 +++++++++++++++++++++++++++++++
 infrastructure/worker/wrangler.toml       |  6 ++++++
 3 files changed, 58 insertions(+)

$ git grep -n "infrastructure/worker" bd5dd7083 -- .github/workflows/pulumi-up.yml
bd5dd7083:.github/workflows/pulumi-up.yml:8:      - "infrastructure/worker/**"
bd5dd7083:.github/workflows/pulumi-up.yml:64:          pnpm exec esbuild infrastructure/worker/edge-router.js \
```

Pulumi owned the router ten weeks before the analytics feature landed, and the analytics
commit did not touch `infrastructure/pulumi/index.ts`.

### 2. Cloudflare Web Analytics beacon vs. CSP — re-verified header, carried hypothesis

Re-verified: `infrastructure/worker/csp.js:58`:

```
"connect-src": `'self' ${auth0Origin} https://api.mattbutlerengineering.com ${sentryIngestOrigin}`,
```

No `cloudflareinsights.com`. Note, however, that `csp.js:84-89` merges a KV policy
(`security/csp`) over these defaults, so the _live_ header can differ from the code
default; any probe must read the deployed response header, not this file.

Carried from the brief (2026-09-03): the zone-level injection adds a `beacon.min.js` tag
for browser user agents (token `0c3656fe25764d6b891842c8ceb2e718`, `spa:2`), which POSTs
to `https://cloudflareinsights.com/cdn-cgi/rum`. **Hypothesis, not confirmed:** that POST
is refused by `connect-src`. It cannot be confirmed from this LAN — the resolver
`192.168.4.40` sinkholes `cloudflareinsights.com` to `0.0.0.0` (measured 2026-08-21,
`docs/fixes/e2e-behind-edge-csp/defect.md:153-159`), so a local browser cannot
distinguish "CSP refused" from "DNS ate it". Verify only from CI/Linux or with
`curl --resolve`. Out of scope for this run; parked as a backlog seed.

### 3. Sentry emits no usage signal — re-verified init, carried measurement

```
$ grep -n "Sentry.init\|integrations: \[\]\|replaysSessionSampleRate" packages/sentry/src/react.ts
27:  Sentry.init({
31:    replaysSessionSampleRate: 0,
33:    integrations: [],
```

Carried (brief, 2026-09-03): Sentry org `mattbutlerengineering` (region
`https://us.sentry.io`), 30-day span search on rialto-web returns **0 spans**. Errors
only.

### 4. The cookie banner's `analytics` toggle governs nothing — re-verified

`apps/rialto-web/src/components/CookieConsent/useCookieConsent.ts` declares
`analytics: boolean` (`:7`), defaults it to `false` (`:21`), persists under
`STORAGE_KEY = "rialto-cookie-consent"` (`:17`). `CookieConsent.tsx:85` renders the
category (`key: "analytics"`, "Help us understand how visitors interact with the site.")
and `:124` writes the draft back on save. Every reader of the value in the app:

```
$ grep -rn "\.analytics" apps/rialto-web/src --include="*.ts" --include="*.tsx"
apps/rialto-web/src/components/CookieConsent/CookieConsent.tsx:124:      analytics: draft.analytics,
apps/rialto-web/src/components/CookieConsent/useCookieConsent.test.ts:44:    expect(stored.preferences.analytics).toBe(true);
apps/rialto-web/src/components/CookieConsent/useCookieConsent.test.ts:115:    expect(result.current.preferences.analytics).toBe(true);
```

Nothing outside `CookieConsent/` reads it; nothing is enabled or disabled by it. Tests
that touch the key: `CookieConsent.test.tsx` (9 lines), `useCookieConsent.test.ts`
(8 lines). This is `docs/backlog.md` line 13; the run resolves it for rialto-web by
removing the toggle (user decision — see Notes). `readStoredConsent` (`:35-56`) spreads
the parsed preferences over `DEFAULT_PREFERENCES`, so a stored blob carrying an extra
`analytics` key will keep parsing after the type drops it — the architect should decide
whether to strip it or ignore it.

### 5. No consumer exists — re-verified

```
$ grep -rln "analytics_engine\|edge_requests\|cloudflareinsights\|beacon.min.js" . \
    --include="*.js" --include="*.mjs" --include="*.ts" --include="*.tsx" --include="*.toml" --include="*.yml" --include="*.json" \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=.claude
infrastructure/worker/wrangler.toml
```

Every other hit is prose under `docs/`. `scripts/resource-audit.mjs` — the closest
existing Cloudflare-API script — contains no `analytics` reference at all. Even with rows
in the dataset, no script or runbook turns them into a number.

## Root-cause hypothesis

**Confirmed mechanism, for the edge counter (evidence 1).** The binding was declared in
`infrastructure/worker/wrangler.toml`, which is dead configuration for deploy purposes:
the production script has been a Pulumi `WorkersScript` since `7f2a3649c` (2026-03-10),
`pulumi-up.yml` was already the sole deploy path — triggering on `infrastructure/worker/**`
and bundling with `esbuild` — when `bd5dd7083` landed on 2026-05-22, and that commit
touched three worker files and not `infrastructure/pulumi/index.ts`. Pulumi is the state
owner for the script's bindings, so every `pulumi up` since has applied a bindings array
without `ANALYTICS`, `env.ANALYTICS` is `undefined` in production, and `writeAnalytics`
returns at its first line. This is verified from the repo, not hypothesised.

**By-construction inference, not a measurement:** "has never once written a row" follows
from the above — no Pulumi state has ever carried the binding — but the dataset itself was
not queried (that needs an Account Analytics Read token nobody has; see Notes). Treat
"zero rows" as strongly implied, and let the first real `scripts/edge-usage.mjs` run after
deploy be the measurement.

**Hypothesis for why it survived 3.5 months.** Silent by construction, in three layers:
`if (!env.ANALYTICS) return;` makes the missing binding a no-op instead of an error; the
unit suite both mocks the binding (`edge-router.test.js:111`) and explicitly asserts that
its absence is fine (`:816-822`); and no consumer existed, so nobody ever looked for rows
and found none. An unbound dataset and an unused site produce identical evidence — none.
This is the same shape as `docs/fixes/backend-observability-blackout/defect.md` (shipped
`initSentry`, absent `SENTRY_DSN`, five months) and
`docs/fixes/sentry-dsn-static-builds/` (shipped SDK, absent `VITE_SENTRY_DSN`, 4.5
months); the repo has now found this class three times.

**Hypothesis for onset.** 2026-05-22 (`bd5dd7083`). Before that date there was no counter
to be broken, so "no usage data" is as old as the site; the _defect_ — instrumentation
that shipped and does not run — is 3.5 months old.

**Why the origin seed mis-described it.** The seed (backlog line 12) says the deployed
document carries "exactly one script tag … no beacon and no edge injection". The
2026-08-21 correction (`docs/fixes/e2e-behind-edge-csp/defect.md:205-222`) established
that the Cloudflare Insights beacon _is_ injected for browser UAs and loads fine; the
original probe was defeated by the LAN DNS sinkhole. The seed's real content — that
first-party usage instrumentation does not exist in a working state — stands; its beacon
clause is stale, and `e2e-behind-edge-csp/verification.md:484-495` already flagged that
contradiction.

## Blast radius

- **Who:** the operator — one person — and every Operate stage of every run that ships to
  a static route. No end user is harmed; the harm is that product decisions about the
  showcase (and the hospitality dashboard, marketing site, and gen playground) are made
  with zero usage evidence.
- **What:** 100% of edge requests across all four static route names (`marketing`,
  `hospitality`, `rialto`, `gen`) and the `api` passthrough are uncounted. The fix is
  correspondingly wide: it changes the bindings of the production edge router, the
  single Worker that fronts every route on `mattbutlerengineering.com`. A bad binding
  would break every route, not just rialto-web — the Pulumi test and a
  `pulumi-preview.yml` dispatch (it is `workflow_dispatch`-only, `:30`; it does not run
  on PRs) are the pre-merge safety.
- **Since when:** 2026-05-22 (~3.5 months) for the shipped-not-running defect; forever,
  for the absence of usage data.
- **How badly:** two feature runs closed with "signal strength: none" on their central
  claim (`rialto-game-ui`, `hospitality-animations`). Nothing production-facing is
  broken, and that is the problem — the condition is indistinguishable from a site nobody
  visits.
- **Scope of the fix:** server-side, no cookies, no client identifier, no new script tag,
  no client change beyond removing a dead toggle. Hospitality, marketing, and gen get the
  binding for free and nothing else. Accepted limitation: blind to in-app SPA
  navigations — only document/asset/API requests that reach the edge are counted.
- **Cost:** Analytics Engine free tier is assumed sufficient (PRODUCT.md guardrails: no
  new paid infrastructure). If the architect finds a cost, stop and surface.

## Ruled out

- **Not a missing caller.** `writeAnalytics` is invoked at `edge-router.js:201` and
  `:282`. As in the backend-observability precedent, the unexercised thing is the
  configuration (binding), not the code path.
- **Not fixable by editing `wrangler.toml`.** Nothing deploys the edge router from it. The
  fix lives in `infrastructure/pulumi/index.ts`, and `pulumi-up.yml` triggers on
  `infrastructure/pulumi/**` (`:7`).
- **Not something `scripts/check-service-bindings.js` was ever going to catch.** Its
  parser matches `[[services]]` blocks only (`:28`). `[[analytics_engine_datasets]]` is
  exactly the binding class it ignores, which is why the drift guard is in scope.
- **Not something the existing test suites could catch.** 83 Pulumi tests and 58 worker
  tests pass today with the binding absent from production; `edge-router.test.js:816`
  asserts the absence is tolerated.
- **Not the Cloudflare Insights beacon failing to load.** Resolved 2026-08-21 as a LAN
  DNS sinkhole on the probing machine (`e2e-behind-edge-csp/defect.md:153-159`). Do not
  re-investigate the sinkhole; do not "fix" the beacon. Whether its events _land_ is a
  separate, open question (evidence 2) — parked, not resolved, here.
- **Not Sentry.** `integrations: []`, replay rates 0, no tracing, 0 spans. It was never
  configured to carry usage and this run does not ask it to.
- **Not the cookie toggle switching something off.** Nothing reads it; there is nothing
  to switch.
- **Not a `pulumi preview` gap you can close on a PR.** `pulumi-preview.yml` is
  `workflow_dispatch`-only. Verify must dispatch it deliberately (if `gh` auth allows) or
  rely on the unit test.

## Notes

- **Decisions the user has already taken (2026-09-03, brief § Decisions) — not open for
  the architect to relitigate:**
  1. _Sink:_ bind edge Analytics Engine — add an `analytics_engine` binding
     (`name: "ANALYTICS"`, `dataset: "edge_requests"`) to the Pulumi `WorkersScript` so the
     existing `writeAnalytics` path runs. No client change.
  2. _Consent:_ drop the toggle — remove the `analytics` preference from the rialto-web
     cookie banner (hook, dialog, tests). Edge request logging with no cookie and no
     client identifier needs no consent toggle, and a toggle that controls nothing is
     worse than none. Resolves backlog line 13 for rialto-web only.
  3. _Query path:_ a Node script (suggested `scripts/edge-usage.mjs`) POSTing SQL to
     `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`
     with `Authorization: Bearer $CLOUDFLARE_API_TOKEN`, defaulting to requests per `blob1`
     (route) and `blob4` (pathname) over the last 7 days and summing `_sample_interval`
     so sampled rows count correctly; plus a short runbook under `docs/` and a pointer in
     the retro checklist. Follow `scripts/resource-audit.mjs` for env handling
     (`requireEnv` at `:34`, the same two env var names, the same `fetch`-with-Bearer
     pattern at `:43-45`).

- **Why architect.** The sink is decided, but four design questions remain and each
  changes what the work items are:
  1. The exact `@pulumi/cloudflare` binding shape for `analytics_engine` in the installed
     version (`^6.19.0` declared in `infrastructure/pulumi/package.json:18`) — the brief
     flags `WorkersScriptBinding`'s `dataset` field as a known unknown to resolve from
     `node_modules` types, not memory.
  2. Where the drift guard lives — extend `check-service-bindings.js` to a second binding
     class, or a sibling script — and what "in sync" means when `wrangler.toml` is dead
     config (the honest target may be "Pulumi is the source of truth; wrangler.toml must
     not claim a binding Pulumi lacks").
  3. The field-layout contract between `edge-router.js:60-69` and the query script
     (`blob1`…`blob4`, `double1`, `double2`), and where it is documented so the two cannot
     drift.
  4. Analytics Engine free-tier limits (data points/day, retention) against the edge's
     real request volume — the architect checks current documented limits and records
     them; if volume could exceed a free limit, stop and surface.

- **⛔ Credential the run does not have.** Running the query script for real needs a
  Cloudflare API token with **Account Analytics Read**. `docs/SECRETS.md:18` documents
  `MBE_CLOUDFLARE_API_TOKEN` as "Pages deploys, KV, DNS, Pulumi" — that scope is not
  listed, and the token's value is not available to the run. Verify proves the request
  shape with a mocked `fetch` and stops with a clear note if no token is present;
  `release.md` lists provisioning the scope as the first human step.

- **Verify shape.** A condition whose symptom is silence cannot be verified by "no errors
  appear". Positive assertions only: the Pulumi test sees the binding; the drift guard is
  shown to _fail_ when the binding is removed from one side (a guard never proven to fail
  is a decoration — `docs/backlog.md` seed from `maintenance:e2e-behind-edge-csp`); the
  cookie hook still parses a stored blob carrying the old key; the script's request
  shape and env-var failure mode are asserted against a mocked `fetch`. The one thing
  Verify cannot do is see a row — that happens after merge, and `release.md` must say so
  and say what "no rows in the first hours" means.

- **Adjacent smells, flagged, not fixed.** (a) `infrastructure/worker/wrangler.toml` is
  dead config for deploy purposes — it exists for local `wrangler dev`, the bindings
  drift guard, and `resource-audit`; nothing warns a contributor that adding a binding
  there ships nothing. (b) `csp.js:84-89` lets the KV key `security/csp` override any
  directive at runtime, so a CSP claim read from source is only a claim about the
  default. (c) The `hospitality-animations` and `rialto-game-ui` retros both record
  "no usage evidence" as a per-run finding rather than a standing known gap; once the
  runbook exists, the retro checklist pointer (decision 3) closes that.

- **Backlog edits made by this stage (docs/backlog.md).** Line 12 claimed in place with
  `(claimed: maintenance:rialto-web-usage-instrumentation)`. Evidence 2 appended as a new
  unclaimed seed attributed `(from: maintenance:rialto-web-usage-instrumentation)`. Line
  13 (the cookie toggle) deliberately untouched — a later stage marks it resolved for
  rialto-web when the toggle is actually gone.

- **One brief detail corrected while re-verifying.** Evidence 1 in the brief lists
  `pulumi-up.yml`'s triggers as `infrastructure/worker/**`, `apps/gen/**`; the workflow
  also triggers on `infrastructure/pulumi/**` (`:7`), which is the trigger this fix
  actually rides. The brief's Release section already relies on that; only the evidence
  line was incomplete.
