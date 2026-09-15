---
stage: verify
run: maintenance:public-ingress-never-applied
date: 2026-09-09
assumptions:
  - "The run's end state was read as `prepared, both production gates still shut`, per `breakdown.md` frontmatter assumption 5 (both reachability probes are expected to still fail when this run ends) and the orchestrator's brief. The defect's Expected is therefore recorded below as a FAIL that is the authorized end state — not softened into a pass — and the reason it is still shut is now the `pulumi-up` refresh block (Auth0 Tenant/Branding state from #4924), not prepare-and-stop: #4565 is merged and unapplied."
  - "The RED demonstrations for items 1.1–1.3 and the defect regression were run in a throwaway detached `git worktree` under the session scratchpad (created from this branch's HEAD `367973ef0`, `node_modules` symlinked from this worktree, removed afterwards with `git worktree remove --force`; this worktree stayed at 0 dirty files throughout). The stage forbids source edits here and the skill names no mechanism for proving a test can go red, so this is the reading that leaves the run's tree untouched while still demonstrating rather than asserting."
  - "Items 4.4 and 4.6 are recorded as FAIL against their literal acceptance text and routed to Ship, not Implement: neither can be satisfied by a code change (4.4's live `--status in_progress` query cannot be run retroactively; 4.6's residual is a paragraph `release.md` must carry, and `release.md` does not exist yet). The verify skill routes failures to Implement by default; these two are the exception, named here."
  - "Item 3.3's `pnpm check:adr` was run as `node tools/cli/dist/index.js check-adr` — no `check:adr` script exists in the root `package.json`; `.husky/pre-commit:4` runs `pnpm --filter @mbe/cli start check-adr --staged`, and the built CLI is the same code path."
  - "Live probes were run from this LAN. The resolver-sinkhole gotcha was ruled out before any host was called dead: `dig +short @1.1.1.1` and the local resolver return the same A/CNAME records for both hosts (quoted under A1)."
---

# Verification: restore `/public` by opening both gates, and stop at a readable preview

## Summary

**18 PASS, 3 FAIL, 1 Not verified, 1 gap.** Every source-level check the run built is green on the merged code (`infrastructure/pulumi` 87/87, `infrastructure/worker` 264/264, the three script suites 53/53, typecheck and lint clean), and the regression test is demonstrably non-vacuous: run against the pre-fix source it fails 4 of 7 naming both gates by mechanism, and each of its three readers fails its own guard when broken. The preview run's every quoted fact re-reads true from GitHub. **Production is unchanged: both gates are shut** — apex `/public/v1/venues/x` → `200 text/html`, `api.` → Fastify route-miss 404 from users-api, DO spec has zero `/public` rules — which is the defect's Expected still unmet. PR #4565 is merged but has never been applied, because every `pulumi-up` since 2026-09-09T17:05Z fails in `Pulumi Refresh` on orphaned Auth0 state (needs a human). The three FAILs are the unmet Expected (routes to Ship + human), item 4.4's P3 check that was reconstructed rather than performed, and item 4.6's either/or that resolved to both. The one gap is the shipped edge probe never probing the edge (`--base` override), confirmed live and in all four breach issues.

Verdict: **the prepared fix is verified as prepared; it is not verified as working, and cannot be until it is applied.** Next stage is Review, carrying the Ship-routed items and the gap.

Measured 2026-09-10T00:56–01:00Z from worktree `docs/public-ingress-never-applied-close` at `367973ef0` (contains `origin/main` `5b1f1309f`; `3b37e634c` = #4565 is an ancestor).

## Criteria & evidence

### A. Defect (`defect.md` Expected / Observed)

#### A1. Expected: `/public/v1/**` is reachable in production on the host the shipped bundle calls

- Check: read-only GETs against both hosts, DNS cross-checked against 1.1.1.1 first; DO app spec read for a `/public` rule.
- Evidence:

  ```
  $ dig +short @1.1.1.1 mattbutlerengineering.com        # 104.21.25.32 / 172.67.222.73
  $ dig +short mattbutlerengineering.com                  # 104.21.25.32 / 172.67.222.73   (same on the LAN resolver)
  $ dig +short @1.1.1.1 api.mattbutlerengineering.com    # mattbutlerengineering-api-x6iga.ondigitalocean.app. / 172.66.0.96 / 162.159.140.98
  $ dig +short api.mattbutlerengineering.com              # same three records

  === live probes 2026-09-10T00:56:10Z ===
  https://mattbutlerengineering.com/public/v1/venues/x -> 200 text/html size=7274
  https://mattbutlerengineering.com/api/v1/venues -> 401 application/json; charset=utf-8 size=109
  https://api.mattbutlerengineering.com/public/v1/venues/x -> 404 application/json; charset=utf-8 size=90
  https://api.mattbutlerengineering.com/api/v1/venues -> 401 application/json; charset=utf-8 size=109

  $ curl -sS -D - https://api.mattbutlerengineering.com/public/v1/venues/x
  HTTP/2 404
  x-ratelimit-limit: 100
  {"message":"Route GET:/public/v1/venues/x not found","error":"Not Found","statusCode":404}

  $ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | grep -c /public
  0
  (ingress prefixes, in order: /api/v1/users, /api/gen, /v1/sessions, /v1/orchestrate, /v1/webhooks, /api, /)
  ```

  Why it is still shut — the fix is merged but has never been applied:

  ```
  $ gh pr view 4565 --json state,mergedAt,mergeCommit
  MERGED  2026-09-09T17:45:29Z  3b37e634c472af9da8f2f56d429c9a5f96b45593  (base main, by mattbutlerengineering)

  $ gh run list --workflow=pulumi-up.yml --limit 12      (id  sha  status  conclusion  created  updated)
  34391301490  b62c0bd0b  completed  failure    2026-09-09T18:48:50Z  18:50:32Z
  34391022653  59721bb8f  completed  failure    2026-09-09T18:46:03Z  18:47:38Z
  34390771643  59721bb8f  completed  failure    2026-09-09T18:43:35Z  18:44:51Z
  34385123277  0a60bbb08  completed  failure    2026-09-09T17:48:01Z  17:50:09Z
  34384887917  0a60bbb08  completed  cancelled  2026-09-09T17:45:42Z  17:48:27Z
  34384875886  3b37e634c  completed  cancelled  2026-09-09T17:45:35Z  17:47:06Z
  34383702799  6c0a54c51  completed  failure    2026-09-09T17:34:08Z  17:35:37Z
  34380735703  3b8c3d7c7  completed  failure    2026-09-09T17:05:07Z  17:07:23Z
  34319050701  82af9ac7e  completed  success    2026-09-09T06:26:16Z  06:28:18Z   <- last run to reach `up`, pre-#4565

  $ gh run view 34391301490 --json jobs   (Deploy Infrastructure steps)
  Pulumi Refresh (Sync state with cloud): failure
  Pulumi Up: skipped
  $ gh run view 34391301490 --log-failed | grep -i "Insufficient scope"
  auth0:index:Tenant mattbutlerengineering-tenant refreshing (0s) error: ... 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings: provider=auth0@3.51.0
  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error: ... 403 Forbidden: Insufficient scope, expected any of: read:branding: provider=auth0@3.51.0
  ```

- Result: **FAIL** — the surface is exactly as dead as the day of capture, on both hosts. This is the authorized prepare-and-stop end state (assumption 1), but it is also no longer _only_ that: the fix is on `main` and blocked from applying by state this run did not create. Routes to **Ship** (`release.md` apply steps) and to a **human** (delete the two orphaned Auth0 state records or grant `read:tenant_settings` + `read:branding` to the M2M client — options on #4848). Not an Implement item; no code in this run is wrong.

#### A2. Regression test: the defect's reproduction state must fail `ingress-coverage.test.ts`

The defect's signature is: the `/public` rule present in `index.ts`, `ignoreChanges: ["spec"]` on the App, no `originRoutes` at the edge — and a green test. The current test was run against exactly that source (`origin/main` immediately before #4565 merged, `9aaadd787`, the `main` parent of the previewed merge commit), in the scratch worktree (assumption 2).

- Check: `git show 9aaadd787:infrastructure/pulumi/index.ts` and `:infrastructure/worker/routes-config.json` written over the scratch copies; current test file unchanged; `vitest run ingress-coverage`.
- Evidence:

  ```
  $ grep -n 'ignoreChanges:' infrastructure/pulumi/index.ts     # 271:    ignoreChanges: ["spec"],
  $ grep -c originRoutes infrastructure/worker/routes-config.json  # 0

  [A] vitest exit=1
       × reads real values from every source, so nothing below can pass vacuously 5ms
       × reads the live ignoreChanges array, not a commented-out one 1ms
       ✓ every path a service serves is covered by a non-catch-all ingress rule 2ms
       × every path a service serves is also forwarded by the Cloudflare edge 0ms
       ✓ never exempts a prefix from the edge gate that this run exists to open 0ms
       × keeps the ingress rules managed, so a rule in source can reach production 2ms
       ✓ routes the public surface to the service that implements it 0ms
        Tests  4 failed | 3 passed (7)

  Error: the Cloudflare edge gate has no source of truth: infrastructure/worker/routes-config.json declares no "originRoutes" array, so nothing here can tell which prefixes edge-router.js forwards to API_ORIGIN. The edge currently proxies only /api/, which means /public/v1/** dies at the edge even when DO ingress routes it correctly.
  AssertionError: ignoreChanges: ["spec"] on the digitalocean.App resource makes spec.ingress unmanaged, so no ingress rule written in index.ts can reach production — a green "pulumi up" means the App was left unchanged, not that the rule shipped. Narrow it to ingress's siblings (spec.features, spec.jobs, spec.services) so the rules above are diffed again.: expected [ 'spec' ] to deeply equal []
  ```

  The one assertion that still passes on the defect state (`covered by a non-catch-all ingress rule`) is the original, vacuous check — it was true then too, which is the defect. And on the merged source:

  ```
  $ pnpm --dir infrastructure/pulumi test            exit=0
   ✓ ingress-coverage.test.ts (7 tests) 16ms
   ✓ index.test.ts (80 tests) 440ms
        Tests  87 passed (87)
  ```

- Result: **PASS** — the test now fails on the defect's exact source state, naming each gate by mechanism, and passes on the fix.

### B. Exit criteria (`defect.md` § Notes, 1–4)

#### EC1. A real `pulumi preview` shows the `/public` rule being added to `digitalocean:index:App`, read and recorded

- Check: every fact `preview.txt` quotes re-read from the run itself, not from the file.
- Evidence:

  ```
  $ gh run view 34379571653 --json headSha,conclusion,status,event,headBranch,createdAt,updatedAt,workflowName
  headSha 02c8ecd00ad0043647eceaef39c0082be00a49f4  conclusion success  status completed
  event workflow_dispatch  headBranch fix/public-ingress-two-gates
  createdAt 2026-09-09T16:53:46Z  updatedAt 2026-09-09T16:55:28Z  workflowName "Pulumi Preview (read-only)"
  job "Preview Infrastructure (no apply)": success — steps Checkout / Setup pnpm / Setup Node.js / Install dependencies /
    Build gen app / Bundle edge router worker / Fingerprint the bundled edge router / Pin Pulumi CLI /
    Pulumi Preview (no apply, no refresh) / Capture preview transcript / Upload preview transcript — all success

  $ gh run view --job 102560794159 --log | grep -n ...
  650: with:
  652:   command: preview
  653:   diff: true
  654:   refresh: false
  655:   stack-name: prod
  656:   work-dir: infrastructure/pulumi
  696:   pulumi:pulumi:Stack: (same)
  698:     ~ cloudflare:index/workersScript:WorkersScript: (update)
  744:     ~ digitalocean:index/app:App: (update)
  748:       ~ spec: {
  749:           ~ ingress: {
  750:               ~ rules: [
  751:                   ~ [6]: {
  753:                               ~ name: "users-api" => "reservations-api"
  757:                                   ~ prefix: "/" => "/public"
  761:                   + [7]: {
  764:                               + preservePathPrefix: true
        ~ 2 to update
        14 unchanged
  warning: Resource does not support customTimeouts, ignoring: update=15m0s
  ```

  `git log -1 02c8ecd0` → `Merge origin/main into fix/public-ingress-two-gates`, parents `98ef2d96e` + `9aaadd787`, 2026-09-09T16:48:47Z; `git merge-base --is-ancestor a5bfb2acd 02c8ecd0` → true (the carrier is on the evaluated ref).

- Result: **PASS**.

#### EC2. The preview shows no unintended spec changes beyond ingress and the ignored DO defaults — or they are enumerated

- Check: grep the plan for any App key outside `spec.ingress`, and for any `WorkersScript` key outside `content`.
- Evidence:

  ```
  $ grep -n -E '~ (services|jobs|features|name|region|domainNames):' preview-job.log    (App block, lines 744-798)
  753:  ~ name: "users-api" => "reservations-api"      <- nested under rules[6].component, not spec.name
  (no other hit)
  $ grep -n -E '~ (content|bindings|scriptName|mainModule|compatibilityDate)' preview-job.log
  702:  ~ content:                                      <- the only edge-router key that diffs
  ```

  Rendered as a list diff, the App change is rules[6] `"/"→"/public"`, `users-api→reservations-api`, plus `+ rules[7]` = the old catch-all re-added at the end: read as a list, exactly one `/public → reservations-api` rule inserted between `/api` and `/`. Nothing on `spec.services`, `spec.jobs`, `spec.features`, `spec.name`, `spec.region`, `spec.domainNames`. Two resources in the plan, both expected. The `customTimeouts` warning is an apply-time observation for `release.md` (the App update will run on the provider's own timeout, not 15m), not a spec change.

- Result: **PASS** — nothing to enumerate beyond the two expected rows.

#### EC3. `ingress-coverage.test.ts` is no longer vacuous

- Check: A2 above (fails on the defect state) plus the per-reader guard demonstrations under items 1.1–1.3.
- Result: **PASS**.

#### EC4. `release.md` records the exact apply steps, and nothing is applied

- Check: `ls docs/fixes/public-ingress-never-applied/` → no `release.md` (Ship's artifact; this stage precedes it). "Nothing is applied": A1's production measurements, the `pulumi-up` history showing no run reached `up` after #4565, and the preview job's step list containing no `up`/`refresh`/`destroy`.
- Result: **Not verified** for the `release.md` half (does not exist yet, by stage order); the nothing-is-applied half **holds**, measured.

### C. Breakdown items (`breakdown.md` 1.1–4.6)

#### Cross-item gates (lint, typecheck, test, regen)

- Check: run in the worktree.
- Evidence:

  ```
  pnpm --dir infrastructure/pulumi test       exit=0   Tests 87 passed (87)
  pnpm --dir infrastructure/pulumi typecheck  exit=0   (tsc --noEmit)
  pnpm --dir infrastructure/pulumi lint       exit=0   (eslint *.ts)
  pnpm --dir infrastructure/worker test       exit=0   Tests 264 passed (264), 15 files
  pnpm --dir infrastructure/worker lint       exit=0   (eslint .)
  pnpm exec vitest run scripts/__tests__/pulumi-preview-workflow.test.mjs scripts/__tests__/check-api-surface-invariants.test.mjs scripts/__tests__/pulumi-cli-pin.test.mjs
                                              exit=0   Test Files 3 passed (3), Tests 53 passed (53)
  ```

  Regen: not run locally (this branch is docs-only); evidenced by CI on the previewed SHA — `gh run view 34379561880` → `headSha 02c8ecd0…`, jobs `Build: success`, `Integrity: success`, `CI Gate: success`.

- Result: **PASS**.

#### 1.1 Assertion B — managed-ness

- Check: RED-B in the scratch worktree — only `ignoreChanges` reverted to `["spec"]` (line 291), test file untouched; then green on HEAD.
- Evidence:

  ```
  291:    ignoreChanges: ["spec"],
  [B] vitest exit=1
       ✓ reads real values from every source, so nothing below can pass vacuously
       × reads the live ignoreChanges array, not a commented-out one
       ✓ every path a service serves is covered by a non-catch-all ingress rule
       ✓ every path a service serves is also forwarded by the Cloudflare edge
       ✓ never exempts a prefix from the edge gate that this run exists to open
       × keeps the ingress rules managed, so a rule in source can reach production
       ✓ routes the public surface to the service that implements it
        Tests  2 failed | 5 passed (7)
  AssertionError: ignoreChanges: ["spec"] on the digitalocean.App resource makes spec.ingress unmanaged, so no ingress rule written in index.ts can reach production — ...: expected [ 'spec' ] to deeply equal []
  ```

  The reader is `appIgnoreChanges()` (test lines 98–104): `readCode("./index.ts")` then `/ignoreChanges:\s*\[([^\]]*)\]/` — the real array, comments stripped, not a fixture. On HEAD the same test is green with no edit (87/87 above).

- Result: **PASS**.

#### 1.2 Assertion A — two gates, not one

- Check: RED-C — only `/public` removed from `originRoutes` (`["/api"]`), everything else at HEAD.
- Evidence:

  ```
  "originRoutes": ["/api"],
  [C] vitest exit=1
       × every path a service serves is also forwarded by the Cloudflare edge 6ms
        Tests  1 failed | 6 passed (7)
  AssertionError: these paths are served by a service and routed by DO ingress, but the Cloudflare edge worker does not forward them to API_ORIGIN — originRoutes is ["/api"]. A request from the shipped browser bundle dies at the edge and never reaches DigitalOcean, so the DO rule behind it is unreachable.: expected [ '/public/v1/venues', …(3) ] to deeply equal []
  +   "/public/v1/venues",
  +   "/public/v1/reservations/manage",
  +   "/public/v1/reservations/confirm",
  +   "/public/v1/guests/unsubscribe",
  ```

  The failure names the edge side specifically and lists the four real served `/public` paths the reader found in `services/reservations` source; the DO-side assertion stays green, so the two gates are read independently.

- Result: **PASS**.

#### 1.3 Assertion C — parse guard over both new sources

- Check: three mutations, each restored before the next — D1: `ingressPrefixes()` regex changed to match nothing; D2: the `ignoreChanges` key in `index.ts` renamed so the reader finds nothing; D3: `originRoutes` emptied to `[]`.
- Evidence:

  ```
  [D1] regex -> /NEVER_MATCH_XYZ"([^"]+)"/g       vitest exit=1   Tests 2 failed | 5 passed (7)
       × reads real values from every source ...      AssertionError: expected 0 to be greater than 0
       × every path ... covered by a non-catch-all ingress rule   (30 paths now "uncovered")
  [D2] 291: ignoreChangez: [...]                   vitest exit=1   Tests 3 failed | 4 passed (7)
       × reads real values from every source ...      Error: could not locate the ignoreChanges array in index.ts
       × reads the live ignoreChanges array ...
       × keeps the ingress rules managed ...          Error: could not locate the ignoreChanges array in index.ts
       ✓ (the four edge/ingress/route assertions still pass — one unreadable source failed one gate, not the file)
  [D3] "originRoutes": []                          vitest exit=1   Tests 2 failed | 5 passed (7)
       × reads real values from every source ...
       × every path ... forwarded by the Cloudflare edge
  ```

  Each reader throws inside the assertion that uses it (test lines 89, 101–102, 120–127), never at module scope — D2 shows the isolation: the edge gate's check kept running while the DO reader was broken.

- Result: **PASS**.

#### 1.4 Probe engine: `origin`, `expectBodyIncludes`, the `wrong-service` verdict

- Check: `scripts/__tests__/check-api-surface-invariants.test.mjs` (verbose) + source grep.
- Evidence:

  ```
  ✓ classifyProbe — expectBodyIncludes and the wrong-service verdict > reports wrong-service when the status matches but the body is another service's
  ✓ ... > orders wrong-service after unreachable and after status-mismatch
  ✓ ... > prefers wrong-service over guard-missing
  ✓ ... > treats a body it could not read as the wrong service, never as ok
  ✓ ... > leaves a probe that declares no expectBodyIncludes exactly as it was
  ✓ ... > declares wrong-service as a probe state
  ✓ classifyProbe > only ever returns a declared state
  ✓ isRetryable > never retries a state that is a deterministic property of the running config
  ✓ isRetryable > covers every declared state
  ✓ resolveBase > uses the probe's own origin when no --base was given

  scripts/check-api-surface-invariants.mjs
  37: /** @typedef {"ok"|"unreachable"|"status-mismatch"|"wrong-service"|"guard-missing"} ProbeState */
  39-43: PROBE_STATES = [ ..., "wrong-service", ... ]
  180-181: if (probe.expectBodyIncludes && !(observed.body ?? "").includes(probe.expectBodyIncludes)) return "wrong-service";
  337-343: failure-report copy: `answered 404 as expected, but the body does not contain "Venue not found" — a different service is serving this path.`
  ```

  The five pre-existing probes all report `ok` in the live run under 1.5.

- Result: **PASS**.

#### 1.5 The two production reachability probes

- Check: `node scripts/check-api-surface-invariants.mjs --retries 0` against live production, no `--base`.
- Evidence:

  ```
  probe NO --base at 2026-09-10T00:58:33Z   exit=1
  {"name":"public-venue-lookup:reachable-at-origin","request":"GET https://api.mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue","expectStatus":404,"httpCode":404,"guards":{"x-ratelimit-limit":"100"},"state":"wrong-service"}
  {"name":"public-venue-lookup:reachable-through-edge","request":"GET https://mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue","expectStatus":404,"httpCode":200,"guards":{"x-ratelimit-limit":null},"state":"status-mismatch"}
  2 of 7 probes failed:
    wrong-service    public-venue-lookup:reachable-at-origin    GET https://api.mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue
            answered 404 as expected, but the body does not contain "Venue not found" — a different service is serving this path. Check the DO ingress rules and the edge worker's originRoutes, not the service.
            body: {"message":"Route GET:/public/v1/venues/surface-probe-absent-venue not found","error":"Not Found","statusCode":404}
    status-mismatch  public-venue-lookup:reachable-through-edge GET https://mattbutlerengineering.com/public/v1/venues/surface-probe-absent-venue
            expected HTTP 404, got 200
  (the other five probes: state "ok")

  scripts/check-api-surface-invariants.mjs:118-139 — both probes declare origin, expectBodyIncludes: "Venue not found", requireHeaders: ["x-ratelimit-limit"]
  ✓ API_SURFACE_PROBES > requires the rate-limit header on every probe
  ✓ API_SURFACE_PROBES > never expects a success status — no probe may authenticate or mutate
  ✓ API_SURFACE_PROBES > probes the public surface on BOTH hosts, because the gates are in series
  ```

  Two hosts, two different verdicts for two different reasons, exactly as the item specifies. Both are RED by design until the apply (assumption 1).

- Result: **PASS**.

#### 2.1 Narrow `ignoreChanges` to `ingress`'s siblings

- Check: read `infrastructure/pulumi/index.ts`; `index.test.ts` in the suite run.
- Evidence:

  ```
  291:    ignoreChanges: ["spec.features", "spec.jobs", "spec.services"],
  268-290 (comment): "Ignore ingress's SIBLINGS, never `spec` itself." ... "Now MANAGED ...: name, region, domainNames, ingress"
    ... "Still DELIBERATELY UNMANAGED — env vars, instance sizes and component config remain exactly as unmanaged as they were
    ... (full reconciliation is issue #3277): spec.features, spec.jobs, spec.services"
    ... "Whether the engine honors these paths is settled by reading `pulumi preview --diff` — NOT by a green `pulumi up`"
   ✓ index.test.ts (80 tests)
  ```

  Exactly three depth-2 entries, that order, no `[*]`/`[0]`. Test 1.1 green with no test edit (1.1 above). P1 answered by EC1: the engine accepted the paths and diffed `spec.ingress` while leaving `spec.services`/`spec.jobs`/`spec.features` quiet.

- Result: **PASS**.

#### 3.1 `originRoutes` in the edge topology registry

- Evidence:

  ```
  infrastructure/worker/routes-config.json:2   "originRoutes": ["/api", "/public"],
  infrastructure/worker/routes-config.test.js:139  it("has an originRoutes array of path prefixes proxied to API_ORIGIN", ...
    147 Array.isArray  148 length > 0  149-  each prefix starts with "/"  159 toContain("/api")  160 toContain("/public")
   ✓ routes-config.test.js (26 tests)
  $ node scripts/check-service-bindings.js   exit=0   PASS: All 3 sources define the same service bindings.
  ```

- Result: **PASS**.

#### 3.2 `edge-router.js` reads `originRoutes` instead of the hardcoded prefix

- Evidence:

  ```
  infrastructure/worker/edge-router.js
    6:  *   /public/*                → DO App Platform (HTTP subrequest)        (header route comment)
    77: function isOriginRoute(pathname) {
    78:   return topologyConfig.originRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    179:    if (isOriginRoute(url.pathname)) {
  $ grep -n -E '"/api|"/public|"/gen|"/hospitality|"/rialto' edge-router.js   -> only lines 249, 251 (comment text, "/rialto" as an example)
  infrastructure/worker/edge-router.test.js
    229 it("proxies /api (without trailing slash)")                       (unmodified, still passes)
    293 PUBLIC_TEST_PATHS = ["/public", "/public/v1/venues/x", "/public/v1/guests/unsubscribe"]
    316 it("gives /public the same forwarded headers and flag stripping as /api")
    340 it.each(["/publicity", "/apiary"])(... do not proxy ...)
    352 it("matches on the pathname only, so a query string cannot affect routing")
    359 it("is case-sensitive — /Public is not /public")
    364 it("routes identically when originRoutes is reversed — the array is a set")
   ✓ edge-router.test.js (69 tests)
  ```

  Matcher is exactly `s === p || s.startsWith(p + "/")` on `url.pathname`; `staticRoutes` matcher untouched (`routes-config.json` `staticRoutes` unchanged in #4565's diff of that file beyond the added key). The rate-limit finding from Implement is in the shipped source too: `rate-limiter.js:29 { pattern: "/public/", maxRequests: 100, windowSeconds: 60 }`, guarded by `rate-limiter.test.js:185 describe("originRoutes coverage")`.

- Result: **PASS**.

#### 3.3 ADR-011 amendment

- Check: read the ADR; `check-adr` via the built CLI (assumption 4); `adr-compliance-reviewer` subagent on the #4565 diff.
- Evidence:

  ```
  docs/adr/ADR-011-edge-routing-architecture.md
    36: | `/public/*`      | DigitalOcean App Platform | HTTP proxy to `API_ORIGIN`          |     (routing table row)
    60: > **Amendment (2026-07-11, #3349):** ...                                              (the prior form)
    70: > **Amendment (2026-08-24, `docs/fixes/public-ingress-never-applied/`):** origin
    71: > path prefixes are now owned by `routes-config.json`'s **`originRoutes`** key,
    72: > and `/public/*` proxies to `API_ORIGIN` alongside `/api/*`. This closes a
    82: > `originRoutes` and `staticRoutes` deliberately keep **separate matchers**.
  $ node tools/cli/dist/index.js check-adr   exit=0
  Checking codebase against 1 active ADRs...
  ✅ No architectural violations detected.
  adr-compliance-reviewer (dispatched on the #4565 diff of the five files above, read-only): PASS — "LGTM — no ADR violations found".
    ADR-011:27-28 "no topology is hardcoded in edge-router.js" is now satisfied for origin routes (routes-config.json:2 -> edge-router.js:24 import,
    :77-79 isOriginRoute, :179 branch; the old literal test is a `-` line in the diff). Amendment at ADR-011:70-95 is in the same blockquote form as
    #3349's (:60-68) and cites this run directory; routing-table row at :36. ADR-014 (Pulumi owns the DO App spec): the narrowing moves toward it.
    Pre-existing and NOT introduced by the diff (recorded, not counted): rate-limiter.js RATE_LIMITS hardcoded (already flagged by Implement);
    edge-router.js /health/* and /dashboard literals; ADR-011:41-44 says /health/system is "defined in routes-config.json" and it is not;
    ADR-007:20-24 path-prefix list omits /public/v1/*. All four are doc/code drift older than this run — follow-up material, not violations here.
  ```

- Result: **PASS**.

#### 4.1 The dispatch-only preview workflow (clauses a–h)

- Check: read `.github/workflows/pulumi-preview.yml` (identical on HEAD and `origin/main`, `git diff --stat` empty) and its test.
- Evidence:

  ```
  (a) 29: on:  30:   workflow_dispatch:                           (no other trigger)
  (b) 77-92: pnpm build --filter=@mbe/gen ; esbuild infrastructure/worker/edge-router.js --bundle --format=esm --outfile=infrastructure/worker/dist/edge-router.js
  (c) 146: curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0     153: pulumi-version: 3.253.0
  (d) grep -E "pulumi (up|destroy|refresh|cancel|stack import|stack export)|command: (up|destroy|refresh)|refresh: true"  -> no match
  (e) 41: permissions:  42:   contents: read
  (f) 105, 145, 184: set -euo pipefail
  (g) 80-84: VITE_AUTH_AUTHORITY / VITE_AUTH_CLIENT_ID / VITE_AUTH_AUDIENCE / VITE_AUTH_REDIRECT_URI / VITE_API_URL — same five names, same values and secret expressions as pulumi-up.yml:54-59; esbuild flags identical to pulumi-up.yml:63-67
  (h) 107: sha="$(sha256sum "$bundle" ...)"  112: occurrences="$(grep -o -F 'originRoutes' "$bundle" | wc -l ...)"  121-126: echoed to log and step summary

  scripts/__tests__/pulumi-preview-workflow.test.mjs — 15 passed, including:
  ✓ trigger surface (4.1a) > triggers on workflow_dispatch and nothing else
  ✓ read-only bound (4.1d, 4.1e) > runs no Pulumi command other than preview / invokes no mutating pulumi verb anywhere / never refreshes / grants contents: read and no other permission
  ✓ Pulumi CLI pin (4.1c) > (4 tests)
  ✓ build prerequisites (4.1b) > installs deps, builds gen, and bundles the worker before previewing
  ✓ pipefail on gate commands (4.1f) > opens every piping run block with set -o pipefail
  ✓ bundle fingerprint (4.1h) > emits a sha256 and an originRoutes occurrence count for the bundled worker
  ✓ build-input parity with pulumi-up.yml (4.1g) > same env var NAME SET / same values and secret expressions / same esbuild invocation, flag for flag
  ```

- Result: **PASS**.

#### 4.2 The one authorized merge (PR #4545)

- Evidence:

  ```
  $ gh pr view 4545 --json ...
  title "ci(pulumi): add a dispatch-only, read-only preview carrier"  MERGED 2026-08-25T00:22:55Z  mergeCommit a5bfb2acd822e563cd65afb4cb4c251dc833f8c6  base main
  files: [".github/workflows/pulumi-preview.yml", "scripts/__tests__/pulumi-preview-workflow.test.mjs"]     (exactly two)
  $ git log -1 --format='%H parent=%P' a5bfb2acd   -> parent=e6491b0006ae585b83e25d8c1ba977a01fa80d65 ; that parent is an ancestor of origin/main
  $ gh run view 32792310963 --json event,conclusion,headSha,headBranch,jobs
  event pull_request  conclusion success  headBranch ci/pulumi-preview-carrier  headSha a5c459e1d…  CI Gate: success
  $ gh workflow list --all | grep -i pulumi
  Pulumi Preview (read-only)   active   226963896
  ```

  The PR's head was cut from `main` (`e6491b000`), not the fix branch; `CI Gate` ran on a real `pull_request` event (not the `gate-missing`/dispatch-only shape). `ingressCoverage` on that head still had `ignoreChanges: ["spec"]` and no `originRoutes` (the two paths are the only files), so `main` stayed green.

- Result: **PASS**.

#### 4.3 Fix branch carries the workflow on the dispatched ref

- Evidence:

  ```
  $ git merge-base --is-ancestor a5bfb2acd 02c8ecd0…   -> true
  $ git ls-tree 02c8ecd0… -- .github/workflows/pulumi-preview.yml   -> 100644 blob fe18a4f33951c4bac14bf6bafb9f4b293b130c63
  $ gh run view 34379561880 --json headSha,jobs   -> headSha 02c8ecd0…  Build: success  Integrity: success  CI Gate: success
  ```

- Result: **PASS**.

#### 4.4 Serialize against in-flight deploys (P3)

- Check: the item requires `gh run list --workflow=pulumi-up.yml --status in_progress` (and `deploy-services.yml`) run **immediately before** dispatch, timestamped in `preview.txt`. `preview.txt` records that this was not done and reconstructs the window instead. This stage re-verified the reconstruction.
- Evidence:

  ```
  preview 34379571653 window   2026-09-09T16:53:46Z .. 16:55:28Z          (gh run view, above)
  pulumi-up.yml       34319050701 ended 2026-09-09T06:28:18Z (success)  ->  next 34380735703 started 17:05:07Z
  deploy-services.yml 34318866422 ended 2026-09-09T06:42:42Z            ->  next 34390771555 started 18:43:35Z
  (all from `gh run list --workflow=<wf> --limit N --json createdAt,updatedAt`, 2026-09-10T00:57:04Z; matches preview.txt line for line)
  in_progress right now (irrelevant to the dispatch, recorded anyway): pulumi-up 0, deploy-services 0
  ```

- Result: **FAIL** against the acceptance text — the property P3 held (no overlap, re-confirmed), but the check that was meant to establish it in advance was never executed; a reconstruction is a weaker instrument than the one specified, and cannot be run retroactively. Routes to **Ship** (assumption 3): `release.md`'s pre-flight must perform the live `--status in_progress` query and record its UTC timestamp before any future dispatch or apply.

#### 4.5 Dispatch, capture, and read the preview at two levels

- Check: every value in `preview.txt` re-read from the run (EC1/EC2 above), plus the fingerprint, the seven rules, and the baseline.
- Evidence:

  ```
  fingerprint (job 102560794159 log, step "Fingerprint the bundled edge router"):
    sha256sum infrastructure/worker/dist/edge-router.js = 830d5def8da802b9dbfa89dcd31bee10bdeab595bd7a5efab4273b789c1be709
    originRoutes occurrences in infrastructure/worker/dist/edge-router.js = 4
  edge-router content diff (log lines 719, 725, 731, 740):
    +   { pattern: "/public/", maxRequests: 100, windowSeconds: 60 }
    +   originRoutes: ["/api", "/public"],
    + function isOriginRoute(pathname) {
    +     if (isOriginRoute(url.pathname)) {
  Level 1: plan produced, `~ 2 to update / 14 unchanged`, no engine error -> P1 = yes
  Level 2: App `~ update` confined to spec.ingress.rules (EC2); edge-router `~ update` confined to content, positively confirmed by the fingerprint; gen not in plan; auth0 Client not in plan (neutral); other 12 not in plan
  rule 6 baseline: gh run view 34319050701 -> Pulumi Deploy, headSha 82af9ac7e…, success, 2026-09-09T06:26:16Z..06:28:18Z (still the most recent run to reach `up`; A1's list shows every later run failed/cancelled in Refresh)
  rule 7: job steps (EC1) contain no up/refresh/destroy; pulumi/actions inputs `command: preview`, `refresh: false`; production measured shut (A1)
  ```

  All seven rules are recorded in `preview.txt` with verdicts; each verdict re-derives from the log as quoted. Rule 3's earlier `gen` diff (run 33218903008) is noted there as uninvestigated — see Not verified.

- Result: **PASS**.

#### 4.6 Reconcile the deferred-reconciliation seed with issue #3277

- Check: the item's acceptance is an either/or recorded in `release.md`: (a) seed references #3277 and rides the fix branch, or (b) seed dropped and #3277 annotated — "not both, and not silently neither".
- Evidence:

  ```
  $ gh issue view 3277 --json state,labels,title
  "Narrow Pulumi ignoreChanges to drift-tolerant paths"  OPEN  labels [ready-for-human]
  $ gh api .../issues/3277/comments | select(.id==5610831575)
  created_at 2026-09-10T00:36:53Z  user mattbutlerengineering  body "Reconciliation note from run `maintenance:public-ingress-never-applied` ... this issue and that run's backlog seed overlap by design; this comment records where the line is. **What the run narrowed** ..."
  $ git show origin/main:docs/backlog.md | grep -n public-ingress-never-applied
  54:- Reconcile the DigitalOcean app spec with `infrastructure/pulumi/index.ts` and remove the residual `ignoreChanges` narrowing — ... (from: maintenance:public-ingress-never-applied)
  56:- Guard `pulumi-up.yml`'s `Pin Pulumi CLI` step with `set -o pipefail` — ... (from: maintenance:public-ingress-never-applied)
  $ ls docs/fixes/public-ingress-never-applied/   -> no release.md
  ```

  Line 54 does not cite #3277; the seed reached `main` inside #4565 (17 files, `docs/backlog.md` among them), not on its own; #3277 is annotated **and** the seed is retained — i.e. "both".

- Result: **FAIL** against the literal acceptance (it is both, and it is recorded in `breakdown.md` Notes rather than `release.md`). The substance — overlap resolved non-silently, the line between the two documented on the issue — is done. Routes to **Ship** (assumption 3): carry the 4.6 paragraph from `breakdown.md` § Reconciliation into `release.md`.

## Failures

1. **A1 — the defect's Expected is unmet: `/public/v1/**` is dead on both hosts.** Authorized end state (prepare-and-stop) _and_ now blocked past authorization: #4565 is on `main` unapplied because `pulumi-up.yml` fails in `Pulumi Refresh` on two orphaned Auth0 state records (`auth0:index:Tenant`, `auth0:index:Branding` from #4924; revert #5165 removed source, not state) — `403 Insufficient scope, expected any of: read:tenant_settings` / `read:branding`. Routes to **Ship** (`release.md`: the unblock is precondition zero, then the apply steps) and to a **human** (`pulumi state delete` the two URNs, or add both scopes to the M2M client — #4848). Not Implement: no code in this run is wrong.
2. **4.4 — P3 was reconstructed, not performed.** Property held; instrument missing. Routes to **Ship**: live `--status in_progress` query, timestamped, before any dispatch or apply.
3. **4.6 — either/or resolved to both, recorded in the wrong artifact.** Routes to **Ship**: carry into `release.md`.

### Gap (not an acceptance criterion of any item; blocks trusting the post-apply gate)

**The shipped edge probe never probes the edge.** Confirmed from `origin/main` source and live:

```
$ git show origin/main:.github/workflows/post-deploy-check.yml | sed -n 203,208p
        id: probe
        run: |
          set -o pipefail
          node scripts/check-api-surface-invariants.mjs \
            --base https://api.mattbutlerengineering.com \
            2>&1 | tee /tmp/api-surface.log
$ git show origin/main:scripts/check-api-surface-invariants.mjs | sed -n 229,231p
export function resolveBase(probe, baseOverride) {
  return baseOverride ?? probe.origin ?? DEFAULT_BASE;
}
(HEAD is byte-identical to origin/main for both files)

probe WITH --base https://api.mattbutlerengineering.com   exit=1
{"name":"public-venue-lookup:reachable-at-origin","request":"GET https://api.mattbutlerengineering.com/public/v1/venues/...","httpCode":404,"state":"wrong-service"}
{"name":"public-venue-lookup:reachable-through-edge","request":"GET https://api.mattbutlerengineering.com/public/v1/venues/...","httpCode":404,"state":"wrong-service"}
                                                     ^^^^ api., not the apex — the edge probe's own origin was overridden

breach issues filed by post-deploy-check since #4565 merged — every one shows BOTH probes requesting https://api.mattbutlerengineering.com/...:
  #5168 (0a60bbb) 2026-09-09T17:48:40Z   #5171 (59721bb) 18:46:46Z   #5173 (b62c0bd) 18:49:34Z   #5181 (5b68dc0) 21:34:40Z   (all OPEN)
```

Two consequences. (i) In CI the gate measures the DO gate twice and the Cloudflare gate never; after the apply it will go green while the edge half is unmeasured — the class this run exists to make unrepresentable. (ii) The unit test `resolveBase > lets an explicit --base override even a probe that pins its own origin` **pins the override as intended behaviour**, so the fix must change that test deliberately, not just the workflow. Routes to **Implement** as a new work item (or a `ready` issue): either drop `--base` from `post-deploy-check.yml` so per-probe `origin` governs, or make an explicit per-probe `origin` win over `--base` — and land it **before** the apply is declared verified by the gate. Also the four breach issues will keep being filed on every deploy until the apply lands (the sequencing hazard `breakdown.md` Notes predicted); they are noise from the same cause, not four defects.

## Not verified

- **EC4 / `release.md`** — does not exist; it is the Ship stage's artifact. Only the "nothing is applied" half was checked (it holds).
- **`pnpm regen --check` locally** — not run on this docs-only branch; evidenced instead by CI's `Integrity: success` on the previewed SHA (`34379561880`).
- **The `gen` diff in preview run 33218903008 (2026-08-28, `98ef2d96e`)** — a rule-3 finding at the time, never investigated by whoever ran it, and not re-investigated here; it did not recur on `02c8ecd0`, which is the only run 4.5 reads. Whether it was a carrier build-env divergence that has since closed, or a transient, is unknown.
- **Level 2 rows 5–16 (`unchanged`)** are inferred from absence in a **no-refresh** plan, as `preview.txt` states; they were not compared against live cloud state. The `doctl apps spec get` read (A1) covers the App only. This is the designed trade (architecture § _Decisions_: preview without `--refresh`), recorded so it does not read as measured.
- **Whether the apply honors the depth-2 `ignoreChanges` paths** — P1 is answered by the preview (yes); the apply's behaviour, and the effect of the `customTimeouts` warning (the App update will use the provider's own timeout), can only be observed at apply time.
- **Post-apply production behaviour** — both reachability probes, the `Venue not found` body through the edge, `x-ratelimit-limit` on the apex `/public` path, and the booking widget itself — nothing here is observable until `pulumi up` runs, which this run does not do.
- **`main`'s own push-CI on `3b37e634c`** — not looked up (the `--commit` filter is unreliable per memory); the PR-level run on `02c8ecd0` is what is cited.
