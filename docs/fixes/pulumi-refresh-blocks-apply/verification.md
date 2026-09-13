---
stage: verify
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-12
assumptions:
  - "Soft gate: `prd.md` is absent by design — this is a maintenance run (protocol § Maintenance-run orientation); `defect.md` (`re-entry: architect`) is the requirements source and its four Done-when criteria plus every `breakdown.md` acceptance criterion form the criteria list. The predecessor gate is satisfied (`breakdown.md` 9/9 checked). No backfill interview was run."
  - "The RED demonstration (V1) was run in a throwaway detached `git worktree` under the session scratchpad at `origin/main` = `ec25f648b`, with ONLY `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` copied in and `node_modules` / `scripts/node_modules` symlinked from the run worktree; the symlinks were unlinked (never `rm -rf` through them) and the worktree removed with `git worktree remove --force` afterwards. The run worktree stayed at 0 dirty files throughout. The stage skill names no mechanism for proving a test can go red; this is the reading that leaves the run's tree untouched while still demonstrating rather than asserting."
  - "Implement's own RED/GREEN lines in `breakdown.md` § Notes were NOT copied as evidence; every command below was re-run by this stage and the output quoted is this stage's."
  - "`defect.md` Done-when 1, 2 and 4 are recorded under § Not verified as gaps by design, not as failures: `defect.md` itself says `Verify/Ship measure these, not Capture` and `architecture.md` § Verification path assigns them to Ship (S1–S7, `release.md`). Nothing pre-merge can produce a `Deploy Infrastructure` job conclusion, an applied `/public` route, or a `release.md` that does not exist yet. Recorded as gaps, never softened into passes."
  - "`Exactly one dispatched preview` was read literally: one `gh workflow run pulumi-preview.yml --ref fix/pulumi-refresh-blocks-apply` at 2026-09-13T06:52:50Z. The immediate `gh run list` after it was empty (normal propagation delay); the run appeared 2 s later as 34743839849 and no second dispatch was made. Two later `gh run view --log` / `gh run download` calls failed with `not a git repository` because they were issued from the scratchpad — a local invocation error, retried with `-R`, not a second dispatch."
  - "The V4 gate was read as BOTH `git diff origin/main..HEAD -- infrastructure/pulumi/` empty AND the four-line serialization check from `docs/fixes/public-ingress-never-applied/release.md` step 1 printing `[]`/`[]`/`0`/`0` — re-run inline immediately before the dispatch, not only earlier. In-flight checks on `deploy-static.yml` and `pulumi-preview.yml` were added as extra read-only reads (architecture S0 adds `deploy-static.yml` for Ship); both were empty."
  - "The edge-router row in the preview carries more than `architecture.md` § Blast radius expected (a full `bindings` re-send including the `ANALYTICS` analytics_engine binding, and the analytics-schema / `writeAnalytics` content rewrite). This is #5315, merged into `main` at `ec25f648b` after Architect wrote its expectation from preview 34425499302 (`6524f6aae`). Read as a finding to record — same resource, same three-row count, same `~ 3 to update / 15 unchanged` — not as the `row beyond those three` stop condition. No user was present to confirm the reading."
  - "`date:` is 2026-09-12 (the orchestrator's run day, Pacific); every timestamp quoted below is UTC and falls on 2026-09-13."
---

# Verification: exclude two orphaned Auth0 state records so `pulumi-up.yml` applies again

Measured 2026-09-13T06:50–07:05Z from the run worktree
`/private/tmp/…/scratchpad/pulumi-refresh-blocks-apply`, branch
`fix/pulumi-refresh-blocks-apply` at `33b494b02` (`git ls-remote` matches),
based on `origin/main` = `ec25f648b` (`git merge-base origin/main HEAD` →
`ec25f648b6df8be24a81cf918ec4032608666c54`). Read-only on source: no file
outside this artifact was edited; no `pulumi`, `doctl`, `wrangler`, Auth0,
`gh issue`/`gh pr` mutation, no `.env` read, no `check-ai-antipatterns.mjs --update`.
The one external action was the single read-only preview dispatch under V4.

## Summary

**PASS — 0 failures; nothing routes back to Implement.**

| Group                                       | Result                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `defect.md` Done-when 3 (regression guard)  | PASS                                                                                        |
| `architecture.md` V1–V4                     | 4/4 PASS                                                                                    |
| `architecture.md` V5 (refresh-side exclude) | NOT VERIFIED — by design (any refresh writes prod state; first post-merge run is the proof) |
| `breakdown.md` items 1.0–2.4                | 9/9 PASS                                                                                    |
| `defect.md` Done-when 1, 2, 4               | NOT VERIFIED — by design (Ship S1–S7 and `release.md`; not producible pre-merge)            |
| V4 stop conditions                          | none fired: no `delete`, 3 `~` rows only, neither orphan URN in any row or error line       |

The centrepiece: the guard test fails on `origin/main`'s workflow files with
exactly the five predicted assertions (`5 failed | 6 passed (11)`) and passes
on the branch (`11 passed (11)`); the whole `scripts` suite is
`168 passed (168)` / `3242 passed (3242)`; and a real Pulumi 3.253.0 preview
dispatched from the branch plans `~ 3 to update / 15 unchanged` with zero
`delete` lines where `main`'s last preview (34425499302) planned
`- 2 to delete … 13 unchanged` — the two orphans became `unchanged`, as
`architecture.md` § Data model predicted.

## Criteria & evidence

### Done-when 3 + V1 — a regression-guard test exists, reads the real workflow files, is RED on `origin/main`'s workflows and GREEN on the branch

- Check (RED): throwaway detached worktree at `origin/main`; only the test
  file copied in; `node_modules` symlinked;
  `NO_COLOR=1 pnpm --dir scripts test pulumi-orphan-exclude-bypass`.
- Evidence (RED — worktree at `ec25f648b`, both workflow files byte-identical
  to `origin/main`):

  ```
  Preparing worktree (detached HEAD ec25f648b)
  HEAD is now at ec25f648b fix(infra): bind Analytics Engine on the edge router, and give the count a reader (#5315)
  ?? scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs
  YES: both workflow files byte-identical to origin/main
  EXIT=1
   ❯ scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs (11 tests | 5 failed) 11ms
       × "Pulumi Refresh (Sync state with cloud)" excludes exactly the two orphaned Auth0 URNs, verbatim, as a literal block scalar 5ms
       × "Pulumi Up" excludes exactly the two orphaned Auth0 URNs, verbatim, as a literal block scalar 1ms
       × carries the identical exclusion list on its single pulumi/actions step 1ms
       ✓ adds exclude: to no step other than refresh, up and preview 1ms
       ✓ never widens the exclusion with exclude-dependents, target or continue-on-error 1ms
       ✓ excludes only prod-stack Auth0 Tenant/Branding literals — no wildcards, quotes or commas 0ms
       × .github/workflows/pulumi-up.yml carries the TEMPORARY BYPASS marker and names the release.md recipe on comment lines 1ms
       ✓ .github/workflows/pulumi-up.yml places the marker and the recipe directly above every exclude: block 0ms
       × .github/workflows/pulumi-preview.yml carries the TEMPORARY BYPASS marker and names the release.md recipe on comment lines 1ms
       ✓ .github/workflows/pulumi-preview.yml places the marker and the recipe directly above every exclude: block 0ms
       ✓ refuses a re-declared auth0.Tenant / auth0.Branding while the bypass exists 1ms
   Test Files  1 failed (1)
        Tests  5 failed | 6 passed (11)
  ```

  The five assertion messages, verbatim:

  ```
  AssertionError: .github/workflows/pulumi-up.yml step "Pulumi Refresh (Sync state with cloud)" has no exclude: input under with:: expected null not to be null
  AssertionError: .github/workflows/pulumi-up.yml step "Pulumi Up" has no exclude: input under with:: expected null not to be null
  AssertionError: .github/workflows/pulumi-preview.yml step "Pulumi Preview (no apply, no refresh)" has no exclude: input under with:: expected null not to be null
  AssertionError: .github/workflows/pulumi-up.yml has no comment line containing "# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply": expected false to be true
  AssertionError: .github/workflows/pulumi-preview.yml has no comment line containing "# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply": expected false to be true
  ```

  Exactly the predicted set: invariant 1 ×2 (refresh, up), invariant 2 ×1
  (preview parity), invariant 5 ×2 (marker, both files); invariants 3, 4, 6
  and the adjacency half of 5 pass vacuously on files with no `exclude:`.
  Teardown: both symlinks unlinked, `git worktree remove --force` →
  `removed`, `verify-red no longer listed`, `dir gone`; run worktree
  `git status --short` → empty.

- Check (GREEN): same command on the run branch.
- Evidence (GREEN — HEAD `33b494b02f5e62e9a2f2f874969a2aaf384907fd`):

  ```
  EXIT=0
   ✓ scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs (11 tests) 7ms
   Test Files  1 passed (1)
        Tests  11 passed (11)
  ```

- Check (reads the real files, no YAML parser): imports and root resolution.
- Evidence:

  ```
  1:import { describe, it, expect } from "vitest";
  2:import { readFileSync, readdirSync } from "node:fs";
  3:import { resolve, dirname } from "node:path";
  4:import { fileURLToPath } from "node:url";
  7:const ROOT = resolve(__dirname, "../..");
  13:const UP = readFileSync(resolve(ROOT, UP_PATH), "utf8");
  14:const PREVIEW = readFileSync(resolve(ROOT, PREVIEW_PATH), "utf8");
  301:    const dir = resolve(ROOT, PROGRAM_DIR);
  302:    const redeclaring = readdirSync(dir)
  ```

  `URN_SHAPE` (test lines 58–59) is
  `/^urn:pulumi:prod::mbe-infrastructure::auth0:index\/(tenant:Tenant|branding:Branding)::[A-Za-z0-9-]+$/`;
  `MARKER` / `RECIPE` constants at lines 60–61. Eight `it(` source lines
  expand to 11 tests (two sit inside `for` loops over the two up-side steps
  and the two files). The AI-antipattern ratchet's
  `noopTestAssertions: 19 (baseline: 19)` (2.3 below) is the mechanical proof
  that no `it()` lacks an `expect(`.
  `grep -rnE "auth0\.(Tenant|Branding)\(" infrastructure/pulumi/*.ts` →
  `no match` (invariant 6's precondition holds on the branch).

- Result: **PASS** (Done-when 3, V1, breakdown 1.1 and 1.4).

### V2 — existing suites green, existing guards byte-identical to `origin/main`

- Check: `NO_COLOR=1 pnpm --dir scripts test` (whole `@mbe/scripts` suite),
  `pnpm --dir scripts lint`, and the guard-file diff.
- Evidence:

  ```
  EXIT=0
   Test Files  168 passed (168)
        Tests  3242 passed (3242)
     Duration  28.99s (transform 2.32s, setup 0ms, import 6.54s, tests 67.50s, environment 9ms)
   ✓ scripts/__tests__/pulumi-r2-validation-guard.test.mjs (14 tests) 13ms
   ✓ scripts/__tests__/pulumi-preview-workflow.test.mjs (15 tests) 7ms
   ✓ scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs (11 tests) 7ms
   ✓ scripts/__tests__/pulumi-cli-pin.test.mjs (4 tests) 3ms
  ```

  ```
  $ pnpm --dir scripts lint
  > @mbe/scripts@0.0.0 lint … > eslint .
  EXIT=0
  ```

  ```
  $ git diff --stat origin/main..HEAD -- scripts/__tests__/pulumi-cli-pin.test.mjs scripts/__tests__/pulumi-preview-workflow.test.mjs scripts/pulumi-r2-validation-guard.mjs scripts/__tests__/pulumi-r2-validation-guard.test.mjs
  (empty)
  ```

  Noise in the suite log, not failures: `collect-domain-metrics: unavailable (fetch failed: connection refused) — skipping`,
  `[file-issue-cli] search failed, proceeding as no-match: gh: rate limited`,
  `[ratchet] search failed, proceeding as no-match: gh rate limited` —
  pre-existing network-tolerant paths, all three suites still `passed`.

- Result: **PASS** (V2, breakdown 2.2, and the "pin + r2 + preview tests still
  exit 0" halves of 1.2 and 1.3).

### V3 — scope invariants: nothing under `infrastructure/pulumi/`, additions-only workflows, exactly the designed file set, three byte-identical `exclude:` blocks

- Check: the diffs the brief and `breakdown.md` 2.4 name.
- Evidence:

  ```
  $ git diff origin/main..HEAD -- infrastructure/pulumi/ metrics/ai-antipattern-baselines.json
  (empty)
  $ git diff --numstat origin/main..HEAD -- .github/workflows/
  14	0	.github/workflows/pulumi-preview.yml
  26	0	.github/workflows/pulumi-up.yml
  $ git diff --numstat origin/main..HEAD -- .claude/rules/gotchas.md
  1	0	.claude/rules/gotchas.md
  $ git diff --name-only origin/main..HEAD
  .claude/rules/gotchas.md
  .github/workflows/pulumi-preview.yml
  .github/workflows/pulumi-up.yml
  docs/fixes/pulumi-refresh-blocks-apply/architecture.md
  docs/fixes/pulumi-refresh-blocks-apply/autorun-brief.md
  docs/fixes/pulumi-refresh-blocks-apply/breakdown.md
  docs/fixes/pulumi-refresh-blocks-apply/defect.md
  scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs
  $ git diff --stat origin/main..HEAD | tail -1
   8 files changed, 2155 insertions(+)
  ```

  Every added workflow line is a comment, `exclude: |`, or one of the two
  URNs (filter of `+` lines minus those three shapes → `none`). Forbidden keys
  on non-comment lines (`exclude-dependents:`, `target:`, `continue-on-error`)
  → `no match`. The `uses:`/`pulumi-version:`/`command:`/`stack-name:`/
  `work-dir:`/`cloud-url:`/`env:` key-line set of `pulumi-up.yml` diffed
  against `origin/main`'s → `IDENTICAL key-line set`.

  The three `exclude:` blocks, by line, and their byte identity:

  ```
  .github/workflows/pulumi-up.yml:122:          exclude: |
  .github/workflows/pulumi-up.yml-123-            urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  .github/workflows/pulumi-up.yml-124-            urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
  .github/workflows/pulumi-up.yml:154:          exclude: |
  .github/workflows/pulumi-up.yml-155-            urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  .github/workflows/pulumi-up.yml-156-            urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
  .github/workflows/pulumi-preview.yml:171:          exclude: |
  .github/workflows/pulumi-preview.yml-172-            urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  .github/workflows/pulumi-preview.yml-173-            urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
  -- up#1 vs up#2 --  IDENTICAL
  -- up#1 vs preview --  IDENTICAL
  md5: 2dd4fb38c311fe05e2e3fbe38e7a6ebb  (all three)
  ```

  Marker and recipe lines:
  `# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply (Refs #5169, #4848)`
  at `pulumi-up.yml:112`, `:144`, `pulumi-preview.yml:160`;
  `# Recipe and ordering: docs/fixes/pulumi-refresh-blocks-apply/release.md`
  at `pulumi-up.yml:121`, `:153`, `pulumi-preview.yml:170` — each directly
  above its `exclude:` (122, 154, 171).

  `pulumi-preview.yml` read-only properties, present and (additions-only
  diff) untouched:

  ```
  29:on:
  30:  workflow_dispatch:
  38:  group: pulumi-preview-${{ github.ref }}
  39:  cancel-in-progress: false
  42:  contents: read
  154:          command: preview
  155:          diff: true
  156:          refresh: false
  ```

- Result: **PASS** (V3, breakdown 1.2, 1.3, 2.4's scope half).

### V4 — one read-only preview dispatched from the run branch: no `- delete`, the orphan URNs untouched, only the three expected `~` rows

- Check (gate, immediately before the dispatch):

  ```
  === gate: V3 infrastructure/pulumi diff must be empty ===
  infra diff empty
  === gate: serialization check immediately before dispatch 2026-09-13T06:52:47Z ===
  in_progress pulumi-up: []
  in_progress deploy-services: []
  queued pulumi-up: 0
  queued deploy-services: 0
  === gate: local HEAD == remote branch ===
  local=33b494b02f5e62e9a2f2f874969a2aaf384907fd remote=33b494b02f5e62e9a2f2f874969a2aaf384907fd
  ```

  (Extra read-only reads at 06:52:20Z: `in_progress pulumi-preview: []`,
  `in_progress deploy-static: []`. Baseline before dispatch:
  `gh run list --workflow=pulumi-preview.yml --branch fix/pulumi-refresh-blocks-apply` → `[]`.)

- Check (the one dispatch, then locate by `headSha`, never `--commit`):

  ```
  === DISPATCH (the one authorised external action) 2026-09-13T06:52:50Z ===
  dispatch exit=0
  === immediate list ===
  []
  RUN FOUND: {"conclusion":"","createdAt":"2026-09-13T06:52:52Z","databaseId":34743839849,"event":"workflow_dispatch","headSha":"33b494b02f5e62e9a2f2f874969a2aaf384907fd","status":"in_progress"}
  RUN_ID=34743839849
  FINAL: completed/success
  {"conclusion":"success","createdAt":"2026-09-13T06:52:52Z","event":"workflow_dispatch","headSha":"33b494b02f5e62e9a2f2f874969a2aaf384907fd","status":"completed","updatedAt":"2026-09-13T06:54:13Z","url":"https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/34743839849"}
  ```

  Job and steps (`gh run view --json jobs`):

  ```
  {"conclusion":"success","name":"Preview Infrastructure (no apply)","steps":["1 Set up job=success","2 Checkout=success","3 Setup pnpm=success","4 Setup Node.js=success","5 Install dependencies=success","6 Build gen app (Pulumi uploads assets from dist/)=success","7 Bundle edge router worker=success","8 Fingerprint the bundled edge router=success","9 Pin Pulumi CLI=success","10 Pulumi Preview (no apply, no refresh)=success","11 Capture preview transcript=success","12 Upload preview transcript=success", …]}
  ```

- Evidence — the `pulumi-preview` artifact (`preview.txt`, 190 lines,
  `gh run download -R … -n pulumi-preview`), header and summary:

  ```
  run:            https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/34743839849
  dispatched ref: refs/heads/fix/pulumi-refresh-blocks-apply
  evaluated sha:  33b494b02f5e62e9a2f2f874969a2aaf384907fd
  pulumi CLI:     3.253.0 (pinned)
  refresh:        no
  bundle sha256:  87bff76490d67f05873028c065830358c584b2d2004b93aee575c80faad01b35
  originRoutes occurrences in bundle: 4
  …
  Resources:
      ~ 3 to update
      15 unchanged
  ```

  (a) The change summary from the run log itself (step
  `Pulumi Preview (no apply, no refresh)`), verbatim:

  ```
  2026-09-13T06:54:07.4832007Z Resources:
  2026-09-13T06:54:07.4832587Z     ~ 3 to update
  2026-09-13T06:54:07.4832922Z     15 unchanged
  ```

  No `to delete`, `to replace`, `to create` line exists anywhere in the
  1337-line log (`grep -cE 'to delete|to replace|to create'` → `0`).

  (b) Every `~`/`+`/`-` resource row, with URN and what it carries
  (`preview.txt` counts: `~` resource rows → `3`; `-`/`+` resource rows →
  `no -/+ resource rows`):

  1. `~ cloudflare:index/workersScript:WorkersScript: (update)` —
     `[urn=urn:pulumi:prod::mbe-infrastructure::cloudflare:index/workersScript:WorkersScript::mattbutlerengineering-gen]`,
     `[provider: …providers:cloudflare::default_6_19_0::32f4dfce-… => …providers:cloudflare::default_6_20_0::[unknown]]`.
     Every property (`accountId`, `assets.config.notFoundHandling: "single-page-application"`,
     `assets.directory: "../../apps/gen/dist"`, `compatibilityDate: "2026-03-25"`,
     `scriptName`) is printed **without** a `~`/`+`/`-` marker — provider
     transition only, as expected. No `assets` diff (the public-ingress
     release's stop signature is absent).
  2. `~ cloudflare:index/workersScript:WorkersScript: (update)` —
     `[urn=urn:pulumi:prod::mbe-infrastructure::cloudflare:index/workersScript:WorkersScript::mattbutlerengineering-edge-router]`,
     same provider transition, plus:

     ```
     - bindings: [secret]
     + bindings: [
     +     [0]: { + name: "API_ORIGIN"  + text: [secret]  + type: "plain_text" }
     +     [1]: { + name: "MARKETING"    + service: "mattbutlerengineering-marketing"    + type: "service" }
     +     [2]: { + name: "HOSPITALITY"  + service: "mattbutlerengineering-hospitality"  + type: "service" }
     +     [3]: { + name: "RIALTO"       + service: "mattbutlerengineering-rialto-web"   + type: "service" }
     +     [4]: { + name: "GEN"          + service: "mattbutlerengineering-gen"          + type: "service" }
     +     [5]: { + name: "HEALTH_STATE" + namespaceId: "dda61075cc654b0a849046ae563d8d45" + type: "kv_namespace" }
     +     [6]: { + dataset: "edge_requests"  + name: "ANALYTICS"  + type: "analytics_engine" }
       ]
     ~ content :
         -   { pattern: "/api/", maxRequests: 100, windowSeconds: 60 }
         +   { pattern: "/api/", maxRequests: 100, windowSeconds: 60 },
         +   { pattern: "/public/", maxRequests: 100, windowSeconds: 60 }
         +   originRoutes: ["/api", "/public"],
         + // infrastructure/worker/analytics-schema.js
         + var ANALYTICS_BINDING = "ANALYTICS";
         + function isOriginRoute(pathname) { … }
         -     if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
         +     if (isOriginRoute(url.pathname)) {
     ```

     (rows condensed to one line per object; the `content` excerpt keeps the
     transcript's own `-`/`+` markers and elides unchanged context). The
     `/public/` rate-limit entry, `originRoutes: ["/api", "/public"]`,
     `isOriginRoute()` and the branch switch are #4565's deploy debt; the
     `bindings` re-send with `[6] ANALYTICS analytics_engine` and the
     `analytics-schema.js` / `writeAnalytics` rewrite are #5315
     (`ec25f648b`) — see § Findings.

  3. `~ digitalocean:index/app:App: (update)` —
     `[id=5dbdcf45-4053-4518-a97b-f1e2b3122a61]`,
     `[urn=urn:pulumi:prod::mbe-infrastructure::digitalocean:index/app:App::mattbutlerengineering-api-app]`,
     provider `default_4_79_0` (no transition):

     ```
     ~ spec: {
         ~ ingress: {
             ~ rules: [
                 ~ [6]: { ~ component: { ~ name: "users-api" => "reservations-api" }
                          ~ match    : { ~ path: { ~ prefix: "/" => "/public" } } }
                 + [7]: { + component : { + name: "users-api"  + preservePathPrefix: true }
                          + match     : { + path: { + prefix: "/" } } }
               ]
           }
       }
     ```

     The App row is confined to `spec.ingress.rules` — nothing on
     `spec.services` / `jobs` / `features`. Read as a list: one
     `/public → reservations-api` rule inserted before the `/` catch-all.

  The Stack itself: `pulumi:pulumi:Stack: (same)`.

  (c) The two orphan URNs — every line in the 1337-line log that mentions
  either (`grep -nE 'auth0:index/(tenant:Tenant|branding:Branding)|mattbutlerengineering-(tenant|branding)'`):

  ```
  659: 2026-09-13T06:53:59.2721412Z   exclude: urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  660: urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
  ```

  Both are the action's own input echo (the `with:` dump at the start of
  step 10), not resource rows. Same grep filtered to `delete|error|forbidden|403`
  → `no match`. Further counts over the whole log:
  `lines containing 'delete' (any case): 0`;
  `auth0` lines outside the input echo: `0`;
  `Insufficient scope`: `0`; `could not be found in the stack`: `0`.
  (A bare `403` grep matched 8 lines — all timestamp fractions such as
  `06:53:00.1027403Z` and `06:54:07.4822403Z`; none is an HTTP status. Recorded
  so the number is not mistaken for a scope error.)

  (d) The action's input dump for step 10 (the closest the log comes to the
  CLI argv — `pulumi/actions` does not echo `--exclude`; the engine-level proof
  is (a)+(c) against 34425499302's `- 2 to delete … 13 unchanged` on the same
  program: the deletes are gone and `unchanged` rose by exactly the two
  excluded records):

  ```
  2026-09-13T06:53:59.2718846Z   pulumi-version: 3.253.0
  2026-09-13T06:53:59.2719063Z   command: preview
  2026-09-13T06:53:59.2719250Z   diff: true
  2026-09-13T06:53:59.2719435Z   refresh: false
  2026-09-13T06:53:59.2719624Z   stack-name: prod
  2026-09-13T06:53:59.2719844Z   work-dir: infrastructure/pulumi
  2026-09-13T06:53:59.2721412Z   exclude: urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
  urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
  2026-09-13T06:53:59.2725132Z   exclude-dependents: false
  2026-09-13T06:53:59.2725355Z   target-dependents: false
  2026-09-13T06:53:59.2726560Z   exclude-protected: false
  2026-09-13T06:53:59.2727444Z   continue-on-error: false
  ```

  The block scalar reached the action as two lines (the second URN on its
  own line, then a blank) — i.e. it parsed intact; a folded `>` would have
  shown one joined line.

  Warnings in the step, both expected: `warning: Resource does not support customTimeouts, ignoring: update=15m0s`
  (the DO App `customTimeouts` note in `architecture.md` § Interfaces) and,
  in `Pin Pulumi CLI`, `warning: Pulumi has been installed to /home/runner/.pulumi/bin, but it looks like there's a different copy`
  (the pin step's standard message; `preview.txt` confirms `3.253.0 (pinned)`).

- Stop conditions (architecture § Blast radius / § Interfaces "Preview from
  the run branch"): **none fired.**
  - `- 2 to delete` still present → **no** (`delete` count 0).
  - engine error mentioning `--exclude` → **no** (`grep -nE "error:|Error:"` → only the two warnings above).
  - `App: unchanged` → **no** (App row is `~ (update)` on `spec.ingress.rules`).
  - any row beyond the three → **no** (3 `~` rows, 0 `-`/`+` rows).
  - any `replace`/`delete` on a non-orphan resource → **no**.
  - any error line naming either orphan URN → **no**.

- Result: **PASS** (V4; the first real-engine demonstration at CLI 3.253.0
  that `--exclude` on an in-state, not-in-program resource yields a
  `SameStep` — GAP-2 / G-A narrowed to "preview proves the plan; only the
  apply executes it").

### V5 — refresh-side exclusion

- Check: none possible pre-merge.
- Evidence: `pulumi-preview.yml:156` `refresh: false` is a pinned read-only
  property (`pulumi-preview-workflow.test.mjs`, 15 passed) and the run's input
  dump confirms `refresh: false`; any refresh writes production state. The
  preview under V4 therefore exercises the `up`/`preview`-side `--exclude`
  only (preview and up share `GenerateDeletes`; refresh takes the separate
  `deployment_executor.go` path).
- Result: **NOT VERIFIED — by design.** The first post-merge `pulumi-up.yml`
  run (Ship S2/S3: `Pulumi Refresh (Sync state with cloud)` = `success`,
  zero error lines naming either orphan URN) is the proof. Not a pass.

### Breakdown acceptance criteria not already covered above

**1.0 Worktree ready** — `pnpm install --frozen-lockfile` re-run in the run
worktree:

```
EXIT=0
Done in 3.8s
$ git status --short
(empty)
```

`pnpm --dir scripts test pulumi-cli-pin` → `4 passed (4)` inside the V2 suite.
**PASS.**

**2.1 Gotchas bullet** — `git diff --numstat origin/main..HEAD -- .claude/rules/gotchas.md` → `1	0`;
the one `+` line sits after the `pulumi/pulumi#23478` note and before
`## Dependencies`; `grep -F` of every required name against that `+` line:

```
FOUND: auth0:index/tenant:Tenant        FOUND: mattbutlerengineering-tenant
FOUND: auth0:index/branding:Branding    FOUND: mattbutlerengineering-branding
FOUND: #4924    FOUND: 2026-09-09T17:05    FOUND: #5165
FOUND: pulumi-preview.yml    FOUND: pulumi-orphan-exclude-bypass.test.mjs
FOUND: read:tenant_settings  FOUND: update:tenant_settings
FOUND: read:branding         FOUND: update:branding
FOUND: stack export          FOUND: state delete
FOUND: no pipeline signal
FOUND: docs/fixes/pulumi-refresh-blocks-apply/release.md
FOUND: #5169    FOUND: #4848
```

Both orderings are in the line verbatim ("for (b) merge the removal PR →
`pulumi state delete` ×2 → `gh workflow run pulumi-up.yml --ref main`; for (a)
grant the scopes → merge the removal PR → dispatch"). Prettier: see 2.3.
**PASS.**

**2.3 Lint, format, orphan and ratchet gates** — each re-run in the worktree:

```
$ pnpm exec prettier --check .github/workflows/pulumi-up.yml .github/workflows/pulumi-preview.yml scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs .claude/rules/gotchas.md docs/fixes/pulumi-refresh-blocks-apply/
All matched files use Prettier code style!
EXIT=0
$ node scripts/check-orphaned-tests.mjs
PASS: Every test file lives under a workspace package that CI runs.
EXIT=0
$ node scripts/check-ai-antipatterns.mjs
  OK       noopTestAssertions: 19 (baseline: 19)
  OK       magicTimeouts: 29 (baseline: 29)   OK emptyCatch: 5 (baseline: 5)   OK hardcodedRoutes: 693 (baseline: 693)
  OK       anyType: 291 (baseline: 291)   OK consoleLogs: 712 (baseline: 712)   OK unusedParams: 4 (baseline: 4)   OK mockShapeMismatch: 18 (baseline: 18)
All patterns within baseline. No regressions detected.
EXIT=0
$ git diff --quiet origin/main..HEAD -- metrics/ai-antipattern-baselines.json && echo byte-identical
byte-identical to origin/main
$ node scripts/check-workflow-deps.mjs
PASS: Every dependency-needing workflow installs (and builds, where the script reaches a dist-resolved workspace package) before running its script.
EXIT=0
$ node scripts/check-ci-dispatch.mjs
PASS: Every workflow that opens a PR dispatches CI on its branch.
EXIT=0
$ node scripts/check-ci-gate-coverage.mjs
PASS: Every non-advisory job in ci.yml is reachable from ci-gate's needs and evaluated by its result-check loop.
EXIT=0
```

(`pnpm --dir scripts lint` → `EXIT=0`, quoted under V2.) **PASS.**

**2.4 Commit shape and push** — three commits on the branch, all Conventional
Commits, each body carrying `Refs #5169` / `Refs #4848` and both trailers;
`grep -nE "Closes|Fixes|Refs"` over all three bodies matches only the six
`Refs` lines:

```
33b494b02 docs(pulumi-refresh-blocks-apply): carry the run through Implement (item 2.4)
7bc778bd0 docs(gotchas): record the pulumi orphan-exclude bypass and its removal condition
74532e108 fix(ci): exclude two orphaned Auth0 state records from pulumi refresh, up and preview
…
Refs #5169
Refs #4848

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NUFvW3cT7ZpDE9PcemHv25
```

Push verified (never `| tail`):

```
$ git rev-parse HEAD
33b494b02f5e62e9a2f2f874969a2aaf384907fd
$ git ls-remote origin refs/heads/fix/pulumi-refresh-blocks-apply
33b494b02f5e62e9a2f2f874969a2aaf384907fd	refs/heads/fix/pulumi-refresh-blocks-apply
```

**PASS.**

## Failures

None. Nothing routes back to Implement.

## Not verified

- **`defect.md` Done-when 1** — a `Pulumi Deploy` run on `main` whose
  `Deploy Infrastructure` job concludes `success` with refresh no longer
  403ing. Not producible pre-merge: the only path that runs refresh against
  prod is `pulumi-up.yml` on `main`, and any refresh writes state. Ship S1–S3.
  Two more failures landed on `main` while this stage ran, confirming the
  defect is still live: `34742452739` (2026-09-13T06:19:13Z, `failure`) and
  `34742533377` (06:21:09Z, `failure`) — both `workflow_run` after
  `Deploy Static Sites` `34742452751` succeeded.
- **`defect.md` Done-when 2** — the deploy debt (`/public` on the DO app)
  applied and observable. Not producible pre-merge. What V4 does show is that
  the debt is still _planned_ (the `~ digitalocean:index/app:App` row on
  `spec.ingress.rules[6]`/`[7]`), not applied. Ship S5.
- **`defect.md` Done-when 4** — `release.md` carries the human checklist.
  `release.md` is Ship's artifact and does not exist yet; the marker comment
  in all three workflow blocks already names
  `docs/fixes/pulumi-refresh-blocks-apply/release.md` (breakdown
  SURFACED-1: the guard asserts the string, not the file — Ship decides
  whether to commit `release.md` on the branch before merging so `main` never
  carries a dangling reference).
- **V5** — the refresh-side `--exclude` (above).
- **`/local-ci-precheck`** (breakdown 2.3, marked optional) was not invoked;
  the listed gates it would run that touch these files were run individually.
- **GAP-1 / G-C** (`defect.md`, `architecture.md`) — the M2M grant's actual
  scope list remains unmeasurable under the constraints; unchanged.
- **The apply itself** (GAP-2 / G-A's last step): the preview proves the
  plan contains no delete; only Ship's first `up` executes it.

## Findings (not criteria)

- **#5315 widened the edge-router row, not the row count.** `architecture.md`
  § Blast radius (written from preview 34425499302 at `6524f6aae`) expected
  the edge-router `~` to carry `content` + the provider bump. The branch's
  base `ec25f648b` includes #5315, so the same row now also re-sends the full
  `bindings` array (`- bindings: [secret]` → seven entries, `[6]` being the
  new `ANALYTICS` `analytics_engine` binding on dataset `edge_requests`) and
  rewrites `writeAnalytics` via `analytics-schema.js`. Still one resource,
  still `~ 3 to update / 15 unchanged`. Ship's S4 should expect these lines
  in the real `up` output and not read them as drift. The
  `bindings: [secret]` on the `-` side means prod state currently records the
  bindings as a secret value, so the apply will re-send all seven — same
  resource, same swap.
- **The outage is still running.** Two new `pulumi-up.yml` failures on `main`
  at 06:19Z and 06:21Z today (above), so `defect.md`'s window now extends past
  2026-09-13T06:21Z; 34742452751 (`Deploy Static Sites`, `success`) fired the
  latter — the `workflow_run` trigger keeps producing red runs until the fix
  merges.
- **BSD `awk` on the local runner does not accept `\s`** — a first
  `exclude:` block extraction silently produced three empty files (md5
  `d41d8cd9…` of the empty string) and `diff` reported them "identical".
  Re-done with `grep -A2 -E '^[[:space:]]*exclude:'`; the identity quoted
  under V3 is the second, non-empty measurement (3 lines each, md5
  `2dd4fb38…`). Recorded because empty-vs-empty "IDENTICAL" is exactly the
  shape of a vacuous pass.
- **`gh run view --log` / `gh run download` need a repo context.** Both
  failed with `failed to run git: fatal: not a git repository` when issued
  from the scratchpad; the 2-line "log" was that error. Retried with
  `-R mattbutlerengineering/mattbutlerengineering` — no second dispatch.
- **A bare `403` grep against a `Z`-timestamped log is noise** (8 hits, all
  fractional-second digits). Grep the provider's phrase (`Insufficient scope`)
  or the URN, as Ship S3 already does.
- **The preview ran in 81 s** (06:52:52Z → 06:54:13Z), install through
  upload — the branch's `pnpm` and build caches were warm; nothing about the
  exclusion changed the runtime shape.

## Hand-off

Next stage: **Review** (`review.md`). No failure routes to Implement.

For Review: the diff is exactly `.github/workflows/pulumi-up.yml` (+26),
`.github/workflows/pulumi-preview.yml` (+14),
`scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` (+310, new),
`.claude/rules/gotchas.md` (+1), plus the run docs; V1–V4 above are the
evidence that the bypass is exact, mirrored, guarded and — at the pinned
engine — plans no delete.

For Ship, carried unchanged from `breakdown.md` § Carried forward with these
additions from this stage: expect the #5315 `bindings`/analytics lines inside
the edge-router `~` row (S4); the `bindings: [secret]` → full-array re-send;
V5 is proven only by S2/S3; Done-when 1, 2, 4 are Ship's; SURFACED-1
(`release.md` reference in the marker) is Ship's decision.
