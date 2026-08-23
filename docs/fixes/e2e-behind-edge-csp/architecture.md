---
stage: architect
run: maintenance:e2e-behind-edge-csp
date: 2026-08-21
assumptions:
  - "No live interview was available (autorun). Every trade-off below was decided by taking this stage's own recommendation; each is recorded here and in *Decisions & alternatives*."
  - "Mechanism: serve the **built** `dist/` via `vite preview` and apply the real policy at the Playwright layer, rather than running the real worker under `wrangler dev`/workerd. Rationale and the fidelity cost are in *What a green run proves*."
  - "Delivery: `BrowserContext.route` interception applies the header and the nonce, rather than a hand-rolled static server or a `configurePreviewServer` middleware in the app's own vite config."
  - "Shape: an **additive** spec with its own Playwright config, rather than converting the existing `webServer` from `vite dev` to `vite preview`. Keeps the visual job's Linux-CI baselines untouched."
  - "CI placement: an extra step in the existing `functional` job, not a third job — measured-cheaper by roughly 2 minutes of billed runner time per run."
  - "Import form: add `@mbe/edge-worker` as a devDependency of `@mbe/rialto-web` and import `csp.js` by package specifier, accepting the one-time `pnpm-lock.yaml` / dep-graph regeneration cost, rather than a relative deep import that hides the edge from the dependency graph."
  - "Route coverage: five representative routes, not all 26 that `a11y-pages.spec.ts` audits. Named in *Interfaces & contracts*."
  - "A negative self-test (the mutation case) ships in the same spec. Nobody asked for it; taken because a guard that has never been observed failing is indistinguishable from one that cannot fail."
  - "Scope stays rialto-web. The fixture is app-agnostic and transfers unchanged to `marketing`/`hospitality`, but promotion is named, not taken (see *Carried forward*)."
  - "No ADR. The decision fails the ADR bar on reversibility — see *ADRs*."
---

# Architecture: rialto-web E2E behind the real edge CSP

## Approach

Serve the **built** `dist/` under the **real** production CSP, apply the policy
from `infrastructure/worker/csp.js` rather than a copy of it, and assert on the
browser's own `securitypolicyviolation` events. Concretely: a new
`apps/rialto-web/e2e/csp.spec.ts`, run by a second Playwright config whose
`webServer` is `vite preview`, with a fixture that intercepts every document
response, injects a fresh nonce with `injectNonceIntoHtml`, and sets
`Content-Security-Policy: buildCspDirectives(nonce)`. The existing eight specs
and both existing CI jobs are left exactly as they are.

The shape that lost is the obvious one: convert the whole harness to run behind
the real edge. That is a substitutive change to the server both existing jobs
use — it would force regeneration of every Linux-CI-specific visual baseline, and
it puts the run's success criterion ("at least one E2E pass under the real CSP")
behind a much larger blast radius than the criterion needs. An additive spec
buys the same guarantee for a diff that cannot make an existing job red for a
reason unrelated to CSP.

**Capture's hypothesis is refuted, and it does not change the answer.** Capture
reasoned — explicitly flagging it as unmeasured — that a strict
`script-src 'nonce-…'` would refuse `vite dev`'s injected client and
react-refresh preamble. Measured on 2026-08-21 against `origin/main` at
`4aa48f562`: applying the real policy over `vite dev` produced **0 CSP
violations**. The nonce injection covers vite's injected inline preamble, and
`'self'` (present in `script-src`) covers the same-origin `/@vite/client` and
`/src/main.tsx` module requests:

```
--- served document (script tags as delivered) ---
<script nonce="746670a0741f4ab399e22e5c0d4dfa6d" type="module">
<script nonce="746670a0741f4ab399e22e5c0d4dfa6d" type="module" src="/rialto/@vite/client">
<script nonce="746670a0741f4ab399e22e5c0d4dfa6d">
...
--- CSP violations (0) ---
```

The HMR WebSocket did fail in that run, but a control run with the CSP header
removed produced the byte-identical console output — the failure is
`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` on the probing machine, not a CSP
refusal. So the cheap mechanism is genuinely back on the table, and it is still
not the right one: `vite dev` serves a module graph that never ships. Built
output is what the static-asset Worker serves, so built output is what the guard
must observe.

## What a green run proves — and what it does not

**Proves.** On the covered routes, the exact directive string production emits —
produced by the same `buildCspDirectives` that `csp.test.js` locks byte-for-byte —
refuses nothing the **shipped bundle** does: no inline `on*=` handler, no
un-nonced inline script, no `eval`, no `connect-src` destination outside the
allowed origins, no font/img/frame outside their directives. And it proves the
guard can fail. Measured on the recommended mechanism (`vite preview` + route-level
policy), clean versus the `rialto-web-fonts` defect reintroduced:

```
===== CLEAN =====
/                    http=200 cspHeaderPresent=true violations=0 pageErrors=0
/components/button   http=200 cspHeaderPresent=true violations=0 pageErrors=0
/demos/login         http=200 cspHeaderPresent=true violations=0 pageErrors=0
/demos/telemetry     http=200 cspHeaderPresent=true violations=0 pageErrors=0
/visual-test         http=200 cspHeaderPresent=true violations=0 pageErrors=0
MUTATE_DEFECT=0 → TOTAL VIOLATIONS = 0

===== MUTATED (rialto-web-fonts defect reintroduced) =====
/                    ... violations=1  [{"d":"script-src-attr","b":"inline"}]
/components/button   ... violations=1  [{"d":"script-src-attr","b":"inline"}]
/demos/login         ... violations=1  [{"d":"script-src-attr","b":"inline"}]
/demos/telemetry     ... violations=1  [{"d":"script-src-attr","b":"inline"}]
/visual-test         ... violations=1  [{"d":"script-src-attr","b":"inline"}]
MUTATE_DEFECT=1 → TOTAL VIOLATIONS = 5
```

Note what the mutated run did **not** change: the page still rendered, the font
link still reached `rel="stylesheet"`, and there were zero page errors. A
rendering-based or console-based assertion would have missed it. The
`securitypolicyviolation` event is the signal.

**Does not prove: that production's nonce injection works.** This is the
fidelity gap capture demanded be stated honestly, and it is real and already
measurable. Production injects nonces with `HTMLRewriter` + `NonceInjector` —
a workerd parser. The harness uses `injectNonceIntoHtml`, which `csp.js`'s own
docstring calls a plain-string **mirror**. On today's shipped
`apps/rialto-web/dist/index.html` the two already diverge: the document has
**4** `<script>` elements, and the mirror performs **5** substitutions, because
the font-swap IIFE's own source comment contains the literal text `<script>`:

```
    <script nonce="NONCEVALUE">
      // Swap the preloaded font stylesheet to rel="stylesheet" once it loads.
      // Uses a nonce'd script (the edge injects the CSP nonce into <script nonce="NONCEVALUE">
      // tags) instead of an inline event-handler attribute, which would violate
```

Harmless today — it lands inside a JavaScript line comment — but it proves the
mirror is a text transform, not a parser.

The direction of that risk is what makes the mirror acceptable. On **real script
elements** the mirror is a subset-or-equal of the parser: it is case-sensitive
(`/<script(?=[ >])/`), so it can miss a tag HTMLRewriter would catch, which makes
the harness _stricter_ than production — a false red, never a false green. On
**non-elements** (comments, `<noscript>` bodies, text lookalikes) it is a
harmless superset, since nothing there executes. Measured on the shipped
document: 0 uppercase `<SCRIPT`, 0 scripts inside comments, 0 inside `<noscript>`,
0 already carrying a nonce — so today there is no divergence at all in _which
elements_ get nonced. A defect in `NonceInjector` or in HTMLRewriter itself
remains invisible to this harness. That is the price, and workerd is the only
thing that would pay it down; see _Decisions & alternatives_.

**Also does not prove:**

- Anything about the KV override path. The harness runs `buildCspDirectives`
  with no `kvPolicy`; a bad `security/csp` value in production is out of reach.
- Anything Cloudflare injects _after_ the Worker. The Web Analytics beacon is
  nonced correctly at that later stage (measured during capture); the harness
  never sees it.
- Anything about the edge router — rate limiting, circuit breaker, service-binding
  routing, cache headers. Out of scope.
- Violations on routes the spec does not visit, or that require interaction the
  spec does not drive.
- `apps/marketing` and `apps/hospitality`. Identical hole, untouched.

## Components

### `infrastructure/worker/csp.js` (`@mbe/edge-worker`) — unchanged

- Responsibility: owns the CSP policy. Sole source of both the directive string
  and the nonce-injection transform. This run adds a consumer and changes nothing
  here.
- Collaborators: the edge router (production), the new fixture (harness).
- Dependency direction: the harness imports the policy. The policy imports
  nothing from the harness, and nothing about the harness appears in `csp.js`.

### Edge-CSP fixture — `apps/rialto-web/e2e/support/edge-csp.ts`

- Responsibility: make every document response in a browser context carry the
  production CSP with a fresh per-request nonce and a correspondingly nonced
  body, and record every violation the page reports. It is a humble adapter — it
  translates between Playwright's `route`/`addInitScript` APIs and `csp.js`, and
  holds no policy of its own. Deletion test: remove it and the translation
  reappears verbatim in every test that needs it.
- Collaborators: `csp.js`, Playwright's `BrowserContext`.

### `apps/rialto-web/e2e/csp.spec.ts`

- Responsibility: the assertions, including the negative self-test. Owns the list
  of covered routes.
- Collaborators: the fixture.

### `apps/rialto-web/playwright.csp.config.ts`

- Responsibility: serve built output. Spreads the base config and overrides three
  things — `webServer` (`vite preview`), `use.baseURL`, and `testMatch`. The base
  config gains a matching `testIgnore` so a bare local `playwright test` does not
  run the CSP spec against the CSP-less dev server.
- Collaborators: `playwright.config.ts` (imported, not copied).

### CI step in `.github/workflows/rialto-web-e2e.yml` → `functional`

- Responsibility: build `apps/rialto-web` and invoke the CSP config. A separate
  **step**, so a CSP failure and a functional failure stay distinguishable — the
  property the workflow's header comment protects with separate jobs, obtained
  here without a third runner.

## Data model

There is no persistent data. One in-memory record, appended by the page and
drained once per route:

```ts
type CspViolation = {
  effectiveDirective: string; // e.g. "script-src-attr"
  blockedURI: string; // e.g. "inline"
  sample: string; // truncated; often "" for attribute handlers
  documentURI: string; // which route produced it
};
```

Access patterns: written by a `securitypolicyviolation` listener installed via
`addInitScript` (so it exists before any script runs — a listener attached after
navigation misses parse-time violations); read exactly once per route, after
readiness. Consistency requirement: **read-after-settle, not read-after-sleep.**
The existing specs' readiness signal is `await page.waitForLoadState("networkidle")`
followed by an assertion on a rendered element; the CSP spec must drain
violations after that same signal. Lazy-loaded route chunks can raise a violation
after `load` but before `networkidle`, so draining earlier under-reports, and an
arbitrary `waitForTimeout` is the flake this contract exists to prevent.

## Interfaces & contracts

### `applyEdgeCsp(context, options?) → CspRecorder`

- Input: a Playwright `BrowserContext`; optional `{ mutate?: (html: string) => string }`
  used only by the negative self-test.
- Output: a recorder exposing `drain(page): Promise<CspViolation[]>`. Side effect:
  the context is routed and instrumented.
- Behaviour: for `resourceType() === "document"` only, `route.fetch()` the
  original, generate a nonce (`crypto.randomUUID().replace(/-/g, "")`, the same
  form `response-formatter.js` uses), apply `options.mutate` if present, then
  `injectNonceIntoHtml`, then `route.fulfill` with
  `Content-Security-Policy: buildCspDirectives(nonce)`. Every non-document
  request is `route.continue()`d untouched.
- Failure modes: a throw inside the route handler fails the request, which fails
  the navigation, which fails the test — **fail closed**, never a silent
  pass-through. If `csp.js` changes shape the import throws at module load and
  the spec errors rather than degrading. If Playwright's `resourceType`
  classification ever changes and no document is matched, the header is absent —
  which assertion **A1** exists to catch. No timeout of its own: it runs
  in-process against a local server, and the navigation's own timeout governs.

### The spec's assertions, per covered route

Covered routes (representative of the distinct document and asset shapes, all
five measured clean): `/`, `components/button`, `demos/login`,
`demos/telemetry`, `visual-test`.

- **A1 — the policy is in force.** The navigation response carries a
  `content-security-policy` header, and it equals `buildCspDirectives(n)` for the
  nonce `n` parsed out of that same header. Guards the class where the harness
  quietly serves no policy and a green run means nothing.
- **A2 — every script is nonced.** For every `<script>` in the document,
  `script.nonce === n`. **Must read the IDL property, not the attribute** —
  measured: once CSP is applied the browser scrubs the content attribute, so
  `getAttribute("nonce")` returns `""` for every script while `script.nonce`
  returns the full 32-character value. An assertion written against the
  attribute fails on a correct page. A2 catches under-nonced _external_
  same-origin scripts, which A3 cannot see because `'self'` admits them.
- **A3 — no violations.** `drain(page)` returns `[]` after readiness.
- **A4 — the guard can fail.** One test runs with
  `mutate: html => html.replace(/(<link\s+rel="preload"\s+as="style")/, "$1 onload=\"this.rel='stylesheet'\"")`
  — the literal `rialto-web-fonts` defect — and asserts at least one violation
  with `effectiveDirective === "script-src-attr"`. Failure mode of A4 is the
  important one: if A4 goes green-with-no-violation, the harness has stopped
  applying the policy and A1–A3 are worthless.

### `vite preview` invocation

- Input: `pnpm --dir apps/rialto-web exec vite preview --port 4173 --strictPort`.
- Output: built `dist/` served at `http://localhost:4173/rialto/`, with SPA
  fallback. Measured: `/rialto/` → 200 and `/rialto/demos/login` → 200 (fallback
  working, matching `wrangler.toml`'s `not_found_handling = "single-page-application"`).
- Failure modes: `dist/` absent → preview serves nothing and every test fails on
  navigation, loudly. Port already bound → `--strictPort` fails fast rather than
  drifting to another port and silently testing nothing.
- **Use `pnpm exec vite preview`, never `pnpm preview -- --port`.** The
  `preview` script is itself `vite preview`, so pnpm's `--` separator is
  forwarded literally and vite treats `--port`/`--strictPort` as positional args
  and ignores them. `apps/marketing/playwright.config.ts` carries this same
  warning in a comment; this is the second instance, not a new discovery.

## Stack & dependencies

- **`@mbe/edge-worker` as a devDependency of `@mbe/rialto-web`** — makes the
  harness's dependency on the real policy visible in the dependency graph, which
  is the whole point of not keeping a second copy. Cost: a `pnpm-lock.yaml`
  change, which is a turbo `globalDependencies` entry, so the PR's CI run is
  fully cold across every task; and a `package.json` change, so
  `pnpm graph && pnpm generate:dep-graph` must be re-run or the Build job fails
  on stale `dep-graph.json`. Both one-time.
- **Playwright** — already the harness. No new test runner.
- **`vite preview`** — already a script in `apps/rialto-web/package.json`, and
  already the CI server for `apps/marketing`. No new server code.
- **No new npm dependency**, and specifically **no `wrangler`** — it appears
  nowhere in `pnpm-lock.yaml`; the deploy workflows shell out to `npx wrangler@3`.
- Boundary check: nothing forbids `apps/rialto-web/e2e/**` importing
  `infrastructure/worker/**` — `.dependency-cruiser.cjs` restricts
  `packages/ → apps|services`, cross-service imports, and imports _from_ apps, none
  of which apply; and `(^|/)e2e/` is in `TEST_PATHS`, so `not-to-dev-dep` exempts
  it. `apps/rialto-web/tsconfig.json` has `include: ["src"]`, so `e2e/` is outside
  `tsc --noEmit` and the untyped `.js` import cannot break typecheck.

### CI cost, stated rather than left silent

GitHub Actions is paid here and this workflow runs on every PR touching
`apps/rialto-web/**` or `packages/rialto/src/**`.

- **What is added:** one `pnpm --dir apps/rialto-web build` and one extra
  Playwright invocation over five routes, inside the existing `functional` job.
  The build measured **5.64 s wall, cold** locally (`tsc -b` dominant; `vite build`
  itself 660 ms) on an M-series laptop with warm `node_modules`. A
  `ubuntu-latest` runner is slower; budget 20–30 s. Preview boot plus the
  five-route run adds roughly another 15–25 s. **Estimate: 45–60 s of billed
  runner time per PR run**, on top of a job that already installs dependencies,
  builds rialto, and installs Chromium.
- **What was rejected on cost:** a third job. It would re-pay checkout,
  `pnpm install --frozen-lockfile`, the rialto build, and the Chromium install —
  roughly **2–3 additional minutes of billed time per run** for no extra
  information, buying only job-level rather than step-level failure separation.
- **What `wrangler dev` would have cost:** an `npx wrangler` download per run
  (unpinned, since wrangler is not in the lockfile — the exact float that broke
  `pulumi-up.yml`), workerd boot, plus standing up the edge topology: `/rialto/*`
  reaches the app through a **Service Binding** (`env.RIALTO` →
  `mattbutlerengineering-rialto-web.workers.dev`, per
  `infrastructure/worker/routes-config.json`) with a `HEALTH_STATE` KV binding for
  rate limiting, the circuit breaker, and the CSP override. That is a multi-worker
  local topology — real infrastructure work, maintained forever, to buy back only
  the nonce-injection fidelity gap quantified above.
- **Zero added cost** to the `visual` job, and **zero baseline regeneration**:
  the change does not touch how any existing spec is served or rendered. If a
  later run does convert the shared harness to built output, baselines must be
  regenerated from the `rialto-web-visual-diffs` CI artifact, never from macOS.

## Decisions & alternatives

- **Built output (`vite preview`) over `vite dev`** — dev works under the real
  policy (measured: 0 violations, hypothesis refuted), but it serves a module
  graph that never ships; a violation introduced by bundling or minification
  would be invisible.
- **Playwright-layer policy application over `wrangler dev`/workerd** — workerd
  is the only option that exercises the real `HTMLRewriter` nonce injection, and
  it loses on cost: an unpinned `npx wrangler` per run plus a service-binding and
  KV topology to maintain, in exchange for a divergence that is measurably
  narrow and biased toward false reds.
- **Route interception over a hand-rolled static server** — a static server would
  re-implement MIME typing and the SPA fallback that `vite preview` already gets
  right; over a `configurePreviewServer` middleware, because that would put
  test-harness code in the app's production vite config.
- **Additive spec over converting the shared `webServer`** — conversion is
  substitutive: it changes the server both existing jobs run against and forces
  regeneration of Linux-CI-specific visual baselines, for a criterion that only
  requires one pass under the real policy.
- **Extra step in `functional` over a third job** — measured ~2–3 min of billed
  runner time cheaper per run; step-level separation preserves distinguishable
  failures.
- **Package specifier over relative deep import** — `../../../infrastructure/worker/csp.js`
  works and costs no lockfile churn, but it hides the harness→policy edge from the
  dependency graph, which is the drift this run exists to prevent.
- **Recorded and accepted:** the harness asserts against `injectNonceIntoHtml`,
  a mirror of production's injector. Cost stated in _What a green run proves_.
  Revisit if a `NonceInjector`-class defect ever ships.

## ADRs

None — no decision met the bar. The mechanism is a test harness: swapping it for
workerd later touches one fixture, one spec, one config, and one CI step, and no
production code path depends on it. It is a real trade-off and it is
non-obvious, but it is cheap to reverse, so the record above is enough.

## Carried forward

Not work items — Decompose owns those. These are obligations inherited from
`defect.md` that must not be lost:

- **Claim the backlog seed.** `docs/backlog.md` line 28 needs
  `(claimed: maintenance:e2e-behind-edge-csp)` appended in place, never rewriting
  its `(from: …)` marker. Capture was read-only and deferred it to the first
  stage that opens the run's branch.
- **The folded-in record correction rides this run's PR** — the stale Cloudflare
  Insights beacon claims in `docs/backlog.md` (line 23) and
  `docs/features/rialto-game-ui/retro.md` (lines 33–35). Do not open a separate PR;
  do not "fix" the beacon.
- **New spec must be wired by full path.** `apps/rialto-web/e2e/csp.spec.ts` has
  to appear literally in `.github/workflows/rialto-web-e2e.yml` or
  `e2e/workflow-coverage.test.ts` goes red. Explicit path, never a glob (#3955).
- **The mechanism transfers unchanged to `marketing` and `hospitality`**, which
  have the identical hole — the fixture depends only on a `BrowserContext`. It
  stays app-local in this run per the brief's scope. Note the promotion
  constraint: `.dependency-cruiser.cjs`'s `apps-not-imported` rule forbids another
  app importing from `apps/rialto-web/e2e/`, so adopting it elsewhere means moving
  the fixture next to the policy it wraps (`infrastructure/worker/`), not
  cross-importing.
- **Turning the real policy on may surface pre-existing violations.** None
  appeared on the five covered routes, or on the eight routes probed during this
  stage. If a wider route set later surfaces one, that is a success — surface it,
  do not silently fix it.
