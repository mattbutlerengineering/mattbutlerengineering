---
stage: architect
run: maintenance:public-ingress-never-applied
date: 2026-08-24
assumptions:
  - "The edge gate is designed in, not routed out. Study found a SECOND, independent gate the brief and `defect.md` both missed: the shipped `apps/hospitality` bundle is built with `VITE_API_URL: https://mattbutlerengineering.com` (`.github/workflows/deploy-static.yml:179`), so every live `/public/v1/**` call goes through the Cloudflare edge worker, whose origin-proxy branch matches only `/api/` (`infrastructure/worker/edge-router.js:143`). Measured 2026-08-24: `GET https://mattbutlerengineering.com/public/v1/venues/x` -> `HTTP 200 ct=text/html size=7130` (the marketing site), never reaching DigitalOcean at all. Narrowing `ignoreChanges` alone therefore changes nothing any user can observe. The user's scope was `restore /public`; the named mechanism was the `ignoreChanges` narrowing. Rather than stop the run, both gates are designed as separable work, so `breakdown.md` can drop the edge half on one word from the human. This is the single most important thing to confirm before Decompose."
  - "Preview carrier = a new dispatch-only CI workflow, which needs one merge the run was not authorized to make. `gh secret list` confirms every credential a preview needs exists in CI (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PULUMI_CONFIG_PASSPHRASE`, `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `AUTH0_*`); no repo-root `.env` exists locally, and the local CLI is `v3.200.0` against CI's pinned `3.253.0`, so a local preview would validate the open question on the wrong engine. GitHub accepts `workflow_dispatch` only for workflow files present on the default branch, so the preview workflow must land on `main` before it can be dispatched against the fix branch. Recorded as precondition P2, not resolved here: turning `nothing is merged` into `one read-only workflow is merged` is a release-authorization change only the human may make."
  - "G1's expected-diff set is derived from a measured baseline, not asked of the user. The brief says nothing about how a multi-resource preview is judged and the skill offers no default, so rather than guess, the baseline was measured: `pulumi-up` run 32775514049 (2026-08-24T20:43:35Z, `a458f266`) built `apps/gen/dist` and esbuild-bundled the worker from scratch and still reported `digitalocean:index:App`, `cloudflare:index:WorkersScript mattbutlerengineering-gen` and `cloudflare:index:WorkersScript mattbutlerengineering-edge-router` all **unchanged** (`Resources: ~ 1 updated, 15 unchanged`). Two judgment calls follow from that and are recorded as assumptions because they were not put to the human: a `mattbutlerengineering-gen` diff is classed a **finding** rather than expected build noise, and an `edge-router: unchanged` is classed a **hard FAIL** rather than a curiosity. Both readings are only valid while the baseline holds — re-measure against the most recent `pulumi-up` before trusting the table."
  - "G2 confirms the existing semantics rather than choosing new ones, and the convergence question is answered `stay distinct`. Neither was put to the human: `edge-router.js:143` and `edge-router.test.js`'s `proxies /api (without trailing slash)` already pin exact-or-slash, so preserving it is the reading that changes nothing, and ADR-011 already separates the two matchers by what they do with the path (strip vs preserve). Converging them was rejected on a measured live-behavior consequence, not a preference. If the human wants the `staticRoutes` side tightened too, that is a separate run — it is recorded here as a deliberate non-goal, not an oversight."
  - "`defect.md`'s outstanding action — the `docs/backlog.md` seed for full spec reconciliation — is now written but NOT committed. Measured 2026-08-24: `git diff docs/backlog.md` shows the seed line present verbatim with `(from: maintenance:public-ingress-never-applied)`, as an uncommitted working-tree change; it is absent from `origin/main`. So `defect.md`'s frontmatter assumption is stale and the residual action is to commit it, not to write it. This stage is scoped to `architecture.md` only and did not touch it. Note the seed overlaps open issue #3277 (`Narrow Pulumi ignoreChanges to drift-tolerant paths`, still OPEN, `ready-for-human`, last touched 2026-07-10) — reconcile rather than double-file."
---

# Architecture: restore `/public` by making ingress a managed field again

> **Amendment — 2026-08-24. Closes design gaps G1 and G2 routed back by Decompose
> (`breakdown.md` § Design gaps found).** Nothing else in this artifact changed;
> every decision, alternative and precondition below predates the amendment and
> still stands. What changed: _Interfaces & contracts_ gains a **per-resource
> verdict** for the preview (the four `ignoreChanges` signatures were the App's
> row all along, never the preview's), the edge interface gains its **prefix-match
> semantics**, _Components_ gains the reason the two edge matchers stay distinct
> and one new requirement on the preview carrier, and _Decisions & alternatives_
> gains three lines.
>
> **One partial disagreement with `breakdown.md` item 4.5.** Its hard-fail on
> `App: unchanged` is right and is now pinned here as rule 1. But "applies the
> existing four-signature contract _per resource_" is the wrong frame: _silent
> no-honor_ is a property of `ignoreChanges`, which only the App resource carries,
> and _rejected_ is a **preview-level** outcome — an unparseable property path
> aborts the engine before any resource has a row to read. Applied to a
> `WorkersScript` those two signatures are a category error. The replacement is a
> two-level reading (preview-level outcome, then one verdict per resource from a
> named table), which subsumes 4.5's rule rather than contradicting it. 4.5's
> parenthetical "possibly `mattbutlerengineering-gen`" is also now resolved by
> measurement: expected `unchanged`, and a diff there is a finding.

## Approach

Two gates sit in series between a guest and `services/reservations`, and both
are shut. The Cloudflare edge worker proxies only `/api/*` to the DO origin, so
`/public/*` on the public domain never leaves Cloudflare; and the DO app spec has
no `/public` ingress rule, because `ignoreChanges: ["spec"]` makes every spec
field unmanaged. The fix opens each gate at its own layer and adds nothing new:
narrow `ignoreChanges` from `spec` to the three spec keys that actually produce
DO-injected drift, and promote the edge worker's hardcoded `/api/` origin test to
the config-driven registry ADR-011 already says owns routing.

The shape that lost was "enumerate the noise fields" — walk the live spec, find
every DO-injected key, and ignore each by path. It reads natural and it is wrong
twice: the list is open-ended (a key DO starts injecting next month is not on it),
and reaching `scope` on env entries or `instanceCount` on services requires the
nested-array path syntax nobody here has validated. The shape that wins inverts
it: enumerate the **siblings of the field we want back**. `ingress` has six
siblings that exist in live-or-source, three of which we keep ignoring. That list
is closed, enumerable from measured state, testable, and needs no array traversal
at all.

Reduced complexity is the point, not fewer parts: after this, a reader asking
"can an ingress change reach production" reads one array in one file instead of
reasoning about what a whole-object ignore swallows.

## Components

### App change-management policy — `infrastructure/pulumi/index.ts`

- Responsibility: decide which app-spec keys Pulumi owns. Today it owns none.
- Change: `ignoreChanges: ["spec"]` becomes `["spec.features", "spec.jobs", "spec.services"]`.
- Measured basis: the live spec's top-level keys are exactly `domains`,
  `features`, `ingress`, `jobs`, `name`, `region`, `services`
  (`doctl apps spec get 5dbdcf45-… --format yaml`, 2026-08-24, 260 lines); the
  source spec declares `name`, `region`, `domainNames`, `ingress`, `jobs`,
  `services`. The only live key absent from source is `features:
[buildpack-stack=ubuntu-22]`. So `name`, `region`, `domainNames` and `ingress`
  become managed and are already byte-equal to live — the intended diff is the
  one ingress rule and nothing else.
- Deliberately unchanged: `spec.jobs` and `spec.services` stay ignored, so env
  vars, instance sizes, and component config remain exactly as unmanaged as they
  are today. This fix restores **ingress**, not the spec.
- Collaborators: the DO provider (via the Pulumi engine); the coverage check,
  which reads this array as source.

### Edge topology registry — `infrastructure/worker/routes-config.json` + `edge-router.js`

- Responsibility: own which path prefixes proxy to `API_ORIGIN`.
- Change: add an `originRoutes: ["/api", "/public"]` key; `edge-router.js` reads it
  in place of the hardcoded `url.pathname.startsWith("/api/")` test. One new key,
  one changed condition — the circuit breaker, rate limiter, forwarded headers and
  path preservation all come along unchanged because the branch is the same branch.
- Why config rather than a second hardcoded `startsWith`: ADR-011 (active) states
  route prefixes are "all owned by a single config file … no topology is hardcoded
  in `edge-router.js`". The `/api` branch already violates that; adding a second
  hardcoded prefix doubles the violation and leaves the coverage check with no
  source of truth to read on the edge side.
- **`originRoutes` and `staticRoutes` stay distinct matchers — deliberately, not
  by neglect** (2026-08-24 amendment, closes G2). They are different kinds of
  thing, and ADR-011 already separates them by what they do with the path. A
  `staticRoutes` prefix is a **mount point**: it is stripped before forwarding
  (`edge-router.js:238`) because each app is built with a Vite `base` (ADR-011
  § _Service Bindings for Static Sites_), and its entry carries `binding`,
  `bindingOrigin`, `routeName`, `cacheClass`. An `originRoutes` prefix is a **path
  segment on a shared origin**: forwarded verbatim (ADR-011 § _HTTP Proxy for
  API_), re-matched by DO ingress against that same string under
  `preservePathPrefix: true`, and its entry is a bare string. The tables are also
  different shapes — `staticRoutes` is **total** (it ends in a catch-all
  `prefix: ""`, `edge-router.js:229-231`), so ordered first-match-wins over a bare
  `startsWith` is the natural encoding and a non-match cannot occur;
  `originRoutes` is **partial**, and a partial matcher needs a boundary or it
  swallows neighbours. Converging them is also not free: the static side already
  runs two matchers internally (exact `includes` at `:217` for the trailing-slash
  redirect, bare `startsWith` at `:229` for dispatch), and tightening `:229` would
  change what `/hospitality-anything` returns today — a live behavior change on a
  surface this run has no defect against, and out of bounds under the
  surgical-changes mandate. Recorded as a deliberate non-goal.
- Collaborators: DO ingress (its downstream); the coverage check (reads this file).

### Source-coupling check — `infrastructure/pulumi/ingress-coverage.test.ts`

- Responsibility: fail at PR time when a served prefix cannot reach production
  _by construction_. Today it asserts only "a rule exists in `index.ts`", which is
  why it is green over a dead surface.
- Owns three assertions (detail in _Interfaces & contracts_), not one.

### Production reachability probe — `scripts/check-api-surface-invariants.mjs`

- Responsibility: assert, against the deployed hosts, that a served prefix is
  answered by the service that implements it. This is the only check in the design
  that can distinguish "configured" from "reachable".
- Extends an existing seam rather than adding one: the script already runs from
  `post-deploy-check.yml`'s `api-surface-invariants` job, which already triggers on
  `Pulumi Deploy` completion and already files an issue on breach.

### Preview carrier — `.github/workflows/pulumi-preview.yml`

- Responsibility: produce the run's deliverable — a real `pulumi preview --diff`
  against the prod stack, on the pinned CLI, with no apply.
- **Must reproduce `pulumi-up.yml`'s build inputs exactly, not just its build
  steps** (2026-08-24 amendment, closes part of G1). `pulumi-up.yml:52-59` builds
  gen with a specific env block (`VITE_AUTH_AUTHORITY`, `VITE_AUTH_CLIENT_ID`,
  `VITE_AUTH_AUDIENCE`, `VITE_AUTH_REDIRECT_URI`, `VITE_API_URL`) and bundles the
  worker with a specific esbuild invocation (`:61-66`). A preview that builds the
  same packages with different inputs produces a different artifact and therefore
  a spurious diff on a resource this run never touched — which is exactly the
  noise the per-resource table exists to exclude. Same steps, same env, same
  esbuild flags, or the `mattbutlerengineering-gen` row below is unreadable.
- **Must emit a bundle fingerprint alongside the preview** (same amendment).
  `content` is one opaque bundled string, so a rendered `~ content` diff proves
  the bundle changed, never that it changed the right way. The workflow prints
  `sha256sum infrastructure/worker/dist/edge-router.js` and the occurrence count
  of `originRoutes` in that file, and both go in `preview.txt`. This is what makes
  the `edge-router` row falsifiable in the useful direction. It reads a local
  build artifact and stays inside the read-only bound the one authorized merge was
  granted under — no new authorization, no new credential, no mutation.
- Deletion test: without it the run cannot meet its first exit criterion at all;
  it is the instrument, not a wrapper.

## Data model

None. No persisted data, schema, or migration is touched. The only state this run
reads is the Pulumi stack's recorded App inputs, and it reads them without writing.

## Interfaces & contracts

### `ignoreChanges` property paths → Pulumi engine

- Input: three depth-2, wildcard-free property paths.
- Output: those keys are excluded from the App diff; every other key is diffed.
- **Failure modes, and what each looks like in the preview** — this is how the
  preview doubles as the validator for precondition P1. **These four are the
  App's row of the per-resource table below, never a verdict on the preview as a
  whole** (2026-08-24 amendment, G1): other resources change in this run by
  design, and _rejected_ is a preview-level outcome that leaves no rows at all.
  - _Pass_: the `digitalocean:index:App` resource shows exactly one `~` update,
    its diff confined to `spec.ingress.rules`, exactly the `/public` rule added —
    no other ingress rule added, removed, or reordered. Other resources may
    legitimately appear in the same preview; this bullet says nothing about them.
  - _Silent no-honor_: diff also churns `spec.services` / `spec.jobs` /
    `spec.features`. The paths were accepted and not applied. Do not apply —
    this is the ~30-minute full-redeployment case, and it means escalating to
    full reconciliation.
  - _Rejected_: `pulumi preview` errors on an unparseable property path. The
    syntax is unsupported at this engine version; same escalation.
  - _No diff at all_: the App reports `unchanged`. This is the original defect's
    exact signature — green and inert. A clean preview here means the fix did
    **not** work, not that it did. Whoever reads the preview must be told this.
- Retry: safe, `preview` mutates nothing.

### Preview → reader: the per-resource verdict (2026-08-24 amendment, closes G1)

This run changes two resources on purpose, so **"the preview is not clean" is the
expected state and "resources changed" is not a verdict.** A reader who accepts a
non-empty preview as success while `digitalocean:index:App` reports `unchanged`
has reproduced this defect exactly — a green signal over a dead surface — which
is the one outcome this whole run exists to make unrepresentable. Read the
preview in two levels, in order.

**Level 1 — the preview-level outcome.** Either the engine produced a plan, or it
errored. The _rejected_ signature above lives here and only here: an unparseable
`ignoreChanges` property path aborts before any resource has a row. A preview
that errored has nothing to read at level 2, and P1 is answered `no`.

**Level 2 — one verdict per resource**, against this table. The stack holds 16
resources (`Resources: ~ 1 updated, 15 unchanged`, `pulumi-up` run 32775514049,
2026-08-24T20:43:35Z). Exactly two of them may diff **as a result of this run**.

| Resource                                                           | Expected                                                                                 | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `digitalocean:index:App mattbutlerengineering-api-app`             | `~ updated`, diff confined to `spec.ingress.rules`, exactly the `/public` rule added     | the four signatures above are this row. Ingress churn beyond the one added rule means source and live ingress had already diverged — enumerate it for `release.md`, because it would ship on apply                                                                                                                                                                                                                                                                                                                            |
| `cloudflare:index:WorkersScript mattbutlerengineering-edge-router` | `~ updated`, diff confined to `content`                                                  | expected, and attributable: `content` is `readFileSync("../worker/dist/edge-router.js")` (`index.ts:283`) and `routes-config.json` is bundled into that file (`edge-router.js:23`), so both halves of the edge change land here and nowhere else. A diff touching `bindings`, `scriptName`, `mainModule` or `compatibilityDate` is **not** expected — none of them is touched by this run                                                                                                                                     |
| `cloudflare:index:WorkersScript mattbutlerengineering-gen`         | `unchanged`                                                                              | a diff is a **finding**, not build noise. Measured: run 32775514049 ran `pnpm build --filter=@mbe/gen` from a clean checkout and this resource still reported `unchanged`, so the asset manifest is reproducible across builds. A diff means the gen build went non-deterministic, `apps/gen/dist` was stale or absent, or the preview carrier's build env diverged from `pulumi-up.yml`'s — in the last case the preview is not reading the artifacts it claims to, and the `edge-router` row is suspect for the same reason |
| `auth0:index:Client mattbutlerengineering-hospitality`             | `unchanged` in a no-refresh preview; `~ [diff: +sso]` if anyone previews after a refresh | known, permanent, unrelated drift. Measured in one run's log (32775514049): `refresh` pulls live `sso` into state (`[diff: +sso]`), then `up` pushes source back (`[diff: -sso]`), oscillating on every deploy. This run previews **without** `--refresh`, so state was last reconciled to source by that `up` and the row should be quiet — but either reading is benign. Never counted for or against this run, and never allowed to dilute the App verdict                                                                 |
| the other 12                                                       | `unchanged`                                                                              | a finding. Nothing in this run touches them; enumerate any diff by name for `release.md`                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Hard rules, in priority order:**

1. **`App: unchanged` is FAIL, unconditionally — most of all when other resources
   did change.** That is the original defect's exact signature, and no amount of
   movement elsewhere redeems it. There is no combination of other rows that
   turns this row green.
2. **`edge-router: unchanged` is FAIL.** The measured baseline says that bundle is
   byte-reproducible, so an absent diff means it does not carry the edge change
   and the preview is evaluating the wrong worker. A passing App row does not
   redeem it: the two gates are in series, and either one shut leaves the surface
   just as dead. Confirm positively from the bundle fingerprint the carrier
   emits, not from the opaque `content` diff alone.
3. **Every resource appearing in the plan gets a named verdict.** "Only ingress
   changed" is admissible as an enumeration and inadmissible as an impression —
   an unread row is how a dead surface passes for a live one.
4. This table's expectations are only valid while the baseline holds. Re-measure
   against the most recent `pulumi-up` before trusting rows 2–4; nothing in this
   repo goes red when the baseline moves.

### Edge worker → DO origin (`API_ORIGIN = https://api.mattbutlerengineering.com`)

- Input: any request whose path matches an `originRoutes` prefix.
- **Match semantics — exact-or-slash** (2026-08-24 amendment, closes G2). A
  registry prefix `p` matches path `s` **iff `s === p` or `s.startsWith(p + "/")`**
  — the whole prefix, or a whole path segment below it. Never a bare
  `s.startsWith(p)`. This is precisely what `edge-router.js:143` already does for
  `/api` (`url.pathname.startsWith("/api/") || url.pathname === "/api"`) and what
  `edge-router.test.js`'s `proxies /api (without trailing slash)` already pins, so
  the change is a **pure refactor for `/api` plus an addition of `/public`**, and
  no path served today starts being answered by something else. Bare `startsWith`
  would newly proxy `/apiary` and `/publicity` — measured at the apex 2026-08-24,
  `/apiary`, `/publicity`, `/public` and `/public/v1/venues/x` all return `200
text/html`, 7130 bytes (the marketing SPA), and only the last two may move. A
  refactor that changes what two live paths return is not a refactor.
- **Everything else a caller must know about matching**: it reads `url.pathname`
  only (query excluded) and is case-sensitive, both unchanged from today; and
  **`originRoutes` order is not significant** — the branch is a single boolean,
  _does any prefix match_, so the array is a set, not an ordered dispatch table,
  and no entry can shadow another. That is the whole interface: one array, one
  boolean, no ordering contract to get wrong. Contrast `staticRoutes`, whose order
  _is_ load-bearing and whose prefix is stripped, and which for those reasons keeps
  its own separate matcher — see _Components § Edge topology registry_.
- Output: the origin's response, with `X-Forwarded-Host`, `X-Forwarded-For`,
  `X-Request-ID` set and `X-Feature-Flags` stripped; path preserved verbatim.
- Failure modes: no explicit timeout on the subrequest (`fetch` is called with no
  `AbortSignal`) — the bound is the Workers runtime limit plus the KV-backed
  circuit breaker, which opens after repeated 5xx and returns a branded 503. No
  retry at the edge. `/public` inherits all of this by construction.

### DO ingress → `reservations-api`

- Input: path prefix `/public`, `preservePathPrefix: true`, ordered between
  `/api` and the `/` catch-all.
- Output: the request arrives at reservations with its path intact.
- Failure mode if the rule is absent: it matches only `/`, lands on `users-api`,
  and answers Fastify's default route-miss — indistinguishable from a genuine
  404, which is why this was invisible for three months.

### Reachability probe → deployed hosts

- Input: per-probe method, path, expected status, required headers — plus two
  additions this run needs: an optional per-probe `origin` (so one invocation can
  cover both `api.mattbutlerengineering.com` and `mattbutlerengineering.com`) and
  an optional `expectBodyIncludes`, which requires `runProbe` to read the body it
  currently discards and `classifyProbe` to gain one state (`wrong-service`).
- **The discriminator, measured.** `defect.md` correctly notes users-api and
  reservations-api emit byte-identical 404s _for an unregistered route_ — so
  status alone proves nothing. But once reservations actually serves the rule,
  `GET /public/v1/venues/<absent-slug>` hits `publicVenueRoutes`' own handler,
  which replies `404 {"success":false,"error":"Venue not found"}`. That body
  cannot be produced by the catch-all, whose miss is
  `{"message":"Route GET:… not found","error":"Not Found","statusCode":404}`.
  Two probes, both currently failing, both passing only when the surface is
  genuinely live:
  - `https://api.mattbutlerengineering.com/public/v1/venues/<absent>` → 404 whose
    body includes `Venue not found` (today: the Fastify route-miss).
  - `https://mattbutlerengineering.com/public/v1/venues/<absent>` → same (today:
    `HTTP 200 text/html`, the marketing site).
- Failure modes: 15s timeout, 3 retries at 10s, retried **only** on `unreachable`
  — the existing asymmetry is deliberate and must be preserved; `wrong-service` is
  a deterministic property of the running config and must never be retried away.

### Source-coupling check (the three assertions that replace one)

- **A. Two gates, not one.** Every prefix a service registers must be covered by a
  non-catch-all DO ingress rule in `index.ts` **and** by an `originRoutes` prefix
  in `routes-config.json`. Reading only the DO side is what let the edge gate hide.
- **B. Managed-ness.** No `ignoreChanges` entry on the App resource may be `spec`
  or a prefix of `spec.ingress`. This is the assertion whose absence made the whole
  file vacuous: the rule was correct in source _and_ the resource was configured to
  ignore it, and nothing anywhere connected those two facts.
- **C. Parse guard.** The existing "reads real prefixes from both sides" guard
  extends to cover the new sources, so a regex that silently matches nothing cannot
  make A or B vacuously true.
- Failure mode of A–C together: they still prove only that source _permits_ the
  route to ship. They are the cheap tier and must say so; the probe above is the
  only thing that proves production. Honest scoping is the fix for vacuity — a
  check that overclaims is the defect, not the check that runs on source.

## Stack & dependencies

- No new dependency, package, or service. Every change is to files that already
  exist, using mechanisms already in use here.
- `pulumi preview --diff`, run in CI on the pinned CLI `3.253.0` with the same R2
  cloud-url `pulumi-up.yml` uses — the engine that will apply is the engine that
  must answer P1.

## Preconditions (named, unresolved — the design does not assume past them)

- **P1 — depth-2 `ignoreChanges` property paths are honored by engine 3.253.0 with
  `@pulumi/digitalocean` ^4.79.0.** The brief flagged nested-array wildcards
  (`spec.services[*].instanceCount`) as unvalidated; this design **removes** that
  dependency — no `[*]`, no `[0]`, no array traversal anywhere. What remains
  unvalidated is depth-2 object-key paths, and no depth-1 formulation can manage
  `ingress` while ignoring `services`, so the dependency is unavoidable and is
  named rather than assumed. It is settled by reading the preview against the four
  signatures above — the App row of the per-resource table — and by nothing else.
  Do not treat a green `pulumi-up` as evidence — that is precisely what this defect proves means nothing.
- **P2 — the preview needs a carrier the run may not create unaided.** See the
  frontmatter assumption: credentials are CI-only, the local CLI is the wrong
  version, and a `workflow_dispatch` workflow is not dispatchable until its file is
  on the default branch. Human decision.
- **P3 — no `pulumi-up` or `deploy-services` run may be in flight when the preview
  runs.** `preview` mutates no resource, but whether the DIY R2 backend takes a
  state lock for it is not established here, and the known DO+Pulumi dual-deploy
  race is reason enough to serialize regardless.

## Decisions & alternatives

- **Narrow `ignoreChanges` by naming `ingress`'s siblings** over **narrowing by
  enumerating DO-injected noise fields** — the noise list is open-ended by
  construction and needs the unvalidated nested-array wildcard syntax; the sibling
  list is closed, derived from measured state, and needs no array traversal.
- **Narrow `ignoreChanges`** over **full spec reconciliation so it can be dropped
  entirely** — reconciliation is the eventual right answer and is already filed as
  #3277; it lost here only on scope, and the cost of deferring it is recorded
  explicitly: every spec key still ignored is silently unmanaged, exactly as
  ingress was.
- **Keep ingress in the DO app spec** over **managing ingress by a different
  mechanism** — DO App Platform exposes no per-component hostname, so nothing
  outside the app spec can select which component a path reaches; there is no other
  mechanism to move it to.
- **Open the edge gate in addition to DO ingress** over **routing `/public` at the
  Cloudflare edge worker instead of DO ingress** — the edge cannot substitute for
  ingress: its only origin is `API_ORIGIN`, the whole app, and with
  `preservePathPrefix: true` any rewrite arrives verbatim at a service that does
  not serve it. The two gates are in series, not in competition.
- **Extend the edge** over **repointing `VITE_API_URL` at `api.mattbutlerengineering.com`** —
  CSP already allows that origin (`connect-src … https://api.mattbutlerengineering.com`)
  and default CORS already allows `https://mattbutlerengineering.com`, so it would
  technically work; it lost because it moves every guest request off the edge's
  circuit breaker, rate limiter and request-ID path, and trades an infrastructure
  fix for a client rebuild-and-redeploy.
- **Config-driven `originRoutes`** over **a second hardcoded `startsWith("/public/")`** —
  ADR-011 assigns route-prefix ownership to `routes-config.json`, and the coverage
  check needs a readable source of truth on the edge side.
- **Extend `check-api-surface-invariants.mjs`** over **a new probe script** — the
  invariant is the same one that script exists for (a guard observable only on the
  deployed host), it already runs on `Pulumi Deploy` completion, and it already
  files an issue on breach. One adapter is a hypothetical seam; this is the second
  case for a seam that already earned itself.
- **Preview in CI on the pinned CLI** over **a local `pulumi preview`** — P1 is a
  question about engine semantics, and the local CLI is `v3.200.0` against CI's
  `3.253.0`; validating on the wrong engine answers the wrong question. Credential
  availability points the same way.
- **Exact-or-slash prefix matching** over **bare `startsWith(prefix)`**
  (2026-08-24 amendment, G2) — bare `startsWith` is one character shorter and
  newly proxies `/apiary` and `/publicity`, both of which serve the marketing SPA
  today (measured). Exact-or-slash is also what the `/api` branch and its existing
  test already encode, so the edge change stays a refactor plus an addition rather
  than a silent behavior change smuggled in as one.
- **Keep `originRoutes` and `staticRoutes` on separate matchers** over **one
  shared prefix matcher for the whole registry** (2026-08-24 amendment, G2) — one
  matcher reads tidier and is wrong: the two tables mean different things (mount
  point with the prefix stripped vs. path segment forwarded verbatim, per
  ADR-011), one is total and one is partial, and converging them would change what
  `/hospitality-anything` returns today. The static side's looseness is recorded
  as a deliberate non-goal, not fixed here.
- **A per-resource verdict table** over **one verdict for the preview as a whole**
  (2026-08-24 amendment, G1) — a single verdict was tenable only while the App was
  the only resource that could move. With the edge half in scope, two resources
  diff by design, and a whole-preview reading collapses into "resources changed =
  success" — the precise false green this run exists to eliminate. The cost is a
  table that must be re-measured when the baseline moves; that cost is named in
  the table's own rule 4.
- **Preview without `--refresh`** over **refresh-then-preview** — `refresh` writes
  the state file, which is a mutation of shared state and outside "apply nothing".
  The cost is that the diff compares desired state against _recorded_ state rather
  than live; that gap is covered read-only by `doctl apps spec get`, which is the
  actual production truth, and any disagreement between the two is itself a finding
  for `release.md`.

## ADRs

None — no decision met the bar. The nearest candidate, adding `/public` to the
edge routing table, belongs as an **amendment to the active ADR-011 (Edge Routing
Architecture)**, whose routing table and "topology lives in `routes-config.json`"
rule this change both touches and moves toward; ADR-011 already carries an
amendment in exactly that form (2026-07-11, #3349). The `ignoreChanges` narrowing
is a one-line, one-command reversal and needs only the record above.
