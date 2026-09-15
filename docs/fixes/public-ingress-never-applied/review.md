---
stage: review
run: maintenance:public-ingress-never-applied
date: 2026-09-09
assumptions:
  - "The `--base` post-deploy probe gap (Verify's one gap) is classified MAJOR, not critical, and deferred to a follow-up Implement work item rather than fixed here. No live user is present to arbitrate severity (autorun), and this stage forbids source edits, so per the standing autorun rule a deferred major is logged with its reason and as an assumption. Reason it is not critical: it does not touch the run's prepare-and-stop deliverable (the readable, preview-validated fix), and production is already dead-and-authorized on both hosts. It must be fixed before the post-apply `API Surface Invariants` gate is trusted to have verified the edge half — a Ship precondition and Implement follow-up, not a Ship blocker for the prepared state."
  - "PR #4565's over-merge (it merged all Milestone 1-3 source + docs to `main`, exceeding the brief's single-authorized-merge / prepare-and-stop authorization) is recorded once as a process finding and NOT relitigated, per the orchestrator's explicit scope note. Classified major-process, decision accept-as-is: it is CI-green, source-correct, and cannot be safely undone here (a revert would red `main` and discard correct work)."
  - "Reviewed the two merged squash commits `a5bfb2acd` (#4545, preview carrier) and `3b37e634c` (#4565, the fix) as the run's diff — via `git show <sha> -- <path>` — not the working tree, per the orchestrator's scope note. Read each changed source file against `architecture.md`'s named contracts. The regression test's non-vacuity was taken as established by Verify (skill: the Verify regression test is the floor; do not re-verify), and re-confirmed by reading the diff rather than re-running."
---

# Review: restore `/public` by opening both gates, and stop at a readable preview

## Scope

The run's changes are already on `origin/main` in two squash commits; this review
covers those diffs, not the working tree.

- **`a5bfb2acd` (#4545)** — `.github/workflows/pulumi-preview.yml` (dispatch-only,
  read-only Pulumi preview carrier) + `scripts/__tests__/pulumi-preview-workflow.test.mjs`.
- **`3b37e634c` (#4565)** — the fix: `infrastructure/pulumi/index.ts`
  (`ignoreChanges` narrowed to `["spec.features","spec.jobs","spec.services"]`),
  `infrastructure/pulumi/ingress-coverage.test.ts` (de-vacuumed, three assertions),
  `infrastructure/worker/{routes-config.json,edge-router.js,rate-limiter.js}` +
  their tests (`originRoutes`, `isOriginRoute`, `/public/` edge rate limit),
  `scripts/check-api-surface-invariants.mjs` + tests (per-probe `origin`,
  `expectBodyIncludes`, `wrong-service`, two reachability probes),
  `docs/adr/ADR-011` amendment, `docs/backlog.md` seeds, run docs,
  `metrics/ai-antipattern-baselines.json` (hardcodedRoutes 651→652).

Three passes were run against the merged code: correctness, design (vs
`architecture.md`), security (the edge now forwards `/public/**` unauthenticated
to reservations-api). Verify's 18 PASS / 3 FAIL / 1 gap was read in full first;
its regression demonstrations (RED-on-defect, GREEN-on-fix, per-reader guard
mutations) are the floor and were not re-run.

Also examined per the orchestrator's directive: the gate the run relies on but
did not change — `.github/workflows/post-deploy-check.yml`'s probe step and
`scripts/check-api-surface-invariants.mjs`'s `resolveBase()`.

## Findings

### Major (correctness / decayed contract): the shipped post-deploy edge-reachability probe never reaches the edge

- Scenario: `post-deploy-check.yml`'s `Probe deployed API surface` step runs
  `check-api-surface-invariants.mjs --base https://api.mattbutlerengineering.com`,
  and this run's own `resolveBase(probe, baseOverride)` is
  `baseOverride ?? probe.origin ?? DEFAULT_BASE` (`:229-231`). So the workflow's
  `--base` overrides the `reachable-through-edge` probe's own
  `origin: "https://mattbutlerengineering.com"` (`:135`). In CI both reachability
  probes are sent to `api.` — measured live and visible in all four breach
  issues (#5168/#5171/#5173/#5181), where both probes request
  `https://api.mattbutlerengineering.com/...`. **Decayed contract:**
  `architecture.md` § _Reachability probe → deployed hosts_ specifies "an
  optional per-probe `origin` (so one invocation can cover both
  `api.mattbutlerengineering.com` and `mattbutlerengineering.com`)"; the deployed
  caller silently collapses both to one host. After the apply lands, the gate
  measures the DO gate twice and the Cloudflare edge gate never, so it can report
  green while the edge half is dead — the exact "green over a dead surface" class
  this run exists to make unrepresentable. The unit test
  `resolveBase > lets an explicit --base override even a probe that pins its own
origin` pins the override as intended behaviour, so the fix must change that
  test deliberately, not just the workflow.
- Decision: **deferred** to a follow-up Implement work item / `ready` issue (drop
  `--base` from `post-deploy-check.yml` so per-probe `origin` governs, or make an
  explicit per-probe `origin` win over `--base`, adjusting the pinning test).
  Deferred because this stage forbids source edits and there is no live user to
  arbitrate; it does not affect the run's prepare-and-stop deliverable. **Must
  land before the post-apply `API Surface Invariants` gate is treated as having
  verified the edge half** — record as a precondition in `release.md`. Not
  critical (see frontmatter assumption 1). Verify already routed this to
  Implement; this review confirms the classification and the decayed-contract
  grounding.

### Major (process): PR #4565 exceeded the brief's prepare-and-stop / single-merge authorization

- Scenario: the brief authorized exactly one merge — #4545, the read-only
  preview carrier. #4565 merged the entire Milestone 1-3 source (narrowed
  `ignoreChanges`, `originRoutes`/`isOriginRoute`, the de-vacuumed test, the two
  probes, the ADR amendment, the `/public/` rate limit) plus the run docs and
  both backlog seeds to `main` on 2026-09-09T17:45Z. Consequence, already
  visible: the sequencing hazard `breakdown.md` § Notes predicted materialised —
  `post-deploy-check.yml` filed four `API surface invariant breach` issues in
  four hours, one per deploy, and will keep filing until the apply lands; and the
  fix now sits on `main` unapplied. This is stated, not relitigated, per the
  orchestrator's instruction.
- Decision: **accept-as-is / deferred** — the merged code is CI-green and
  source-correct; a revert would red `main` and discard correct work, which is
  worse than the bounded fallout (breach-issue noise, which self-clears when the
  apply lands and the Major finding above is fixed). Recorded factually.

### Minor: exact origin paths `/public` and `/api` are unbounded by the edge rate limiter

- Scenario: `rate-limiter.js` `findRateLimit` matches `pathname.startsWith("/public/")`,
  so the bare exact path `/public` (which `isOriginRoute` still proxies, via
  `pathname === "/public"`) matches no `RATE_LIMITS` pattern → `{allowed:true,
limit:-1}`, i.e. unbounded at the edge. Same for `/api` exact. An attacker
  hammering `GET /public` is edge-unlimited. Bounded in practice: both are
  proxied to the origin, where the service-wide 100/min `onRequest` limiter
  applies, and both 404 (no `/public` or `/api` route exists — routes live under
  `/public/v1/...` and `/api/v1/...`).
- Decision: **deferred** — pre-existing for `/api`, origin-bounded for both,
  single exact path each, and already flagged in `breakdown.md` § Implement-stage
  deviations ("Not fixed, flagged (pre-existing, out of scope)"). No new material
  exposure introduced by `/public` joining the branch.

### Minor: `/public` origin traffic is recorded in edge analytics under the label `"api"`

- Scenario: `edge-router.js:237` hardcodes `writeAnalytics(env, request, "api", ...)`
  for the whole origin-proxy branch, which now includes `/public`. Anyone
  querying edge analytics for public-surface traffic sees it counted as `api`.
  Observability inaccuracy only; no external request behaviour changes.
- Decision: **deferred** — telemetry label, cosmetic, no user-facing effect;
  worth a one-line fix if the branch is touched again, not on its own.

### Minor: doc/contract drift around the change

- Scenario: (a) `architecture.md` § _Components § Edge topology registry_ still
  asserts `/public` inherits the edge rate limiter "unchanged because the branch
  is the same branch" — the code disproves this (an explicit `RATE_LIMITS`
  `/public/` entry was required because the limiter runs before the branch and is
  keyed by its own table); `breakdown.md` already logged this as an Implement
  finding. (b) `ADR-007`'s path-prefix list omits `/public/v1/*`, now that the
  surface is routable. (c) `ADR-011:41-44` says `/health/system` is defined in
  `routes-config.json`, but it is hardcoded at `edge-router.js:127` — pre-existing,
  surfaced by the `adr-compliance-reviewer` during Verify.
- Decision: **deferred** — doc-only drift. (a) is already recorded; (b)/(c) are
  pre-existing and are follow-up material, not violations introduced by this run.

## Passes with no findings

- **Security — clean.** The edge forwards `/public/**` unauthenticated to
  `API_ORIGIN`, but on the _same_ branch as `/api`: same circuit breaker, same
  forwarded-header set (`Host`, `X-Forwarded-Host`, `X-Forwarded-For`,
  `X-Request-ID` set; `X-Feature-Flags` stripped so a client cannot inject a
  trusted flag), verbatim path preservation for DO ingress to re-match under
  `preservePathPrefix`. `/public/` now carries its own edge rate limit (100/min,
  equal to `/api/`, added after the Implement-stage finding that proxying does
  not rate-limit), and the origin-side service-wide limiter + `publicRateLimitHook`
  also apply. Path normalisation is inherited from `new URL(request.url)`, exactly
  as `/api` — no new traversal surface. No secrets in any changed source: the
  preview workflow passes every credential via `env:` from GitHub secrets (never
  interpolated), runs `contents: read` only, dispatch-only, no mutating Pulumi
  verb, pinned CLI 3.253.0, and passes preview stdout through `env:` rather than
  the shell body (no injection). The committed `preview.txt` exposes only ingress
  rules and edge-router code diff — no env-var values (`spec.services`/`spec.jobs`
  are ignored and never diffed).
- **Correctness — clean** apart from the Major above. The `ignoreChanges`
  narrowing was proven honored by the engine (preview diff confined to
  `spec.ingress.rules`, exactly the `/public` rule inserted between `/api` and the
  `/` catch-all; no `spec.services`/`jobs`/`features` churn). `swallowsIngress()`
  correctly treats `spec`, `spec.ingress`, and any `spec.ingress.*` as swallowing
  and the three sibling paths as safe. `readCode()`'s whole-line comment strip
  fixes the reader that had matched the historical `["spec"]` in its own comment,
  and is guarded by a dedicated assertion. `isOriginRoute` is exactly the
  architecture's exact-or-slash contract (`s === p || s.startsWith(p + "/")`,
  `url.pathname` only, case-sensitive, order-insignificant), pinned by boundary,
  query, case, and reversed-array tests plus a "prefix absent from source still
  routes" / "stops routing when removed" pair that catches a leftover literal.
  `classifyProbe` orders `wrong-service` after `status-mismatch` and before
  `guard-missing` as specified, and `isRetryable` excludes it. The reachability
  discriminator is real: `Venue not found` is served by reservations
  (`availability.ts` / `venues.ts` via `createProblemDetails`), which the
  catch-all's route-miss body cannot produce.
- **Design — matches `architecture.md`.** Every named contract holds in the code:
  the three-key `ignoreChanges`, the two-matcher separation (`originRoutes` vs
  `staticRoutes`, kept distinct as a documented non-goal), the probe engine
  additions, and the three coverage assertions (A/B/C). The one deviation —
  `EDGE_EXEMPT_PREFIXES = ["/v1"]`, exempting agent-api's `/v1/*` from edge
  coverage because those paths are addressed on `api.` directly and serve the
  marketing SPA at the apex — is a sound, documented resolution of an internal
  inconsistency in the architecture (assertion A's literal "every served prefix"
  vs. the fixed `originRoutes = ["/api","/public"]`), and is guarded by a test
  that fails if the exemption ever grows to cover `/api` or `/public`. Not a
  finding.

## Verdict

**Ready to ship as the prepared, prepare-and-stop deliverable. No critical
finding is unfixed; nothing blocks Ship.** The fix is source-correct, CI-green,
and preview-validated (the depth-2 `ignoreChanges` paths are honored; the App
diff is exactly the `/public` ingress rule; the edge bundle carries `originRoutes`).

Ship (`release.md`) must carry forward, as preconditions to the apply:

1. **Precondition zero (human):** `pulumi-up` is blocked in `Pulumi Refresh` on
   two orphaned Auth0 state records (`auth0:index:Tenant`, `auth0:index:Branding`
   from #4924; revert #5165 removed source, not state) — `403 Insufficient scope`.
   Unblock via `pulumi state delete` of the two URNs or grant
   `read:tenant_settings` + `read:branding` to the M2M client (#4848). Not this
   run's code; not a defect in the change.
2. **The Major `--base` probe gap must be fixed before the post-apply
   `API Surface Invariants` gate is trusted** to have verified the edge half
   (Implement follow-up / `ready` issue).
3. Item 4.4: perform the live `--status in_progress` check against `pulumi-up.yml`
   and `deploy-services.yml`, timestamped, immediately before any dispatch/apply.
4. Item 4.6: carry the reconciliation paragraph (#3277 annotated, seed retained
   on `main`) into `release.md`.
5. The `customTimeouts` preview warning: the App update will run on the DO
   provider's own timeout, not `15m` — an apply-time observation, not a defect.

The four breach issues (#5168/#5171/#5173/#5181) are a single cause (unapplied
ingress + the `--base` gap), not four defects; they self-clear once the apply
lands and finding 1 (Major) is fixed.
