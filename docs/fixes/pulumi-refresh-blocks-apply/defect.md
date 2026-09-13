---
stage: capture
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-12
re-entry: architect
assumptions:
  - "re-entry: architect was taken from the autorun brief's recommendation rather than a direct user answer — the instruction was 'fix it' with no depth named. Agreed on the evidence below: the fix is a choice between mechanisms inside the production deploy workflow (`refresh --exclude`, `up --exclude`, GitHub step-level `continue-on-error` vs the pulumi/actions `continue-on-error` input), each with a different failure mode at the `Pulumi Up` tail, and the chosen one needs a guard test and a documented exit condition — not a one-line scoped change."
  - "date: is 2026-09-12 (the user's instruction date and the local calendar date at capture) even though the run-log timestamps quoted below are UTC and the latest ones fall on 2026-09-13."
---

# Defect: `pulumi refresh` 403s on two orphaned Auth0 state records and blocks every production apply

**Origin:** user instruction — "fix it", given 2026-09-12 against the measured
blocker below. Not a `docs/backlog.md` seed (none claimed) and not tracker
intake (no `intake:`). #5169 and #4848 are cited as evidence only; the tracker
is read-only for this run.

## Defect

**Observed.** Every `Pulumi Deploy` (`.github/workflows/pulumi-up.yml`) run on
`main` fails in the step `Pulumi Refresh (Sync state with cloud)`; the
`Pulumi Up` step is skipped. The refresh iterates every resource in the `prod`
stack state and two records that the program no longer declares —
`auth0:index:Tenant mattbutlerengineering-tenant` and
`auth0:index:Branding mattbutlerengineering-branding` — return
`403 Forbidden: Insufficient scope` from the Auth0 Management API on
`read:tenant_settings` / `read:branding`. No infrastructure change has applied
to production since **2026-09-09T06:26:16Z**.

**Expected.** A push to `main` matching the workflow's path filter, a completed
`Deploy Static Sites`, or a `workflow_dispatch` applies the Pulumi program to
the `prod` stack: the `Deploy Infrastructure` **job** concludes `success`
(job conclusion, not workflow rollup — a skipped job also reports workflow
`success`), and the deploy debt below lands.

**Done when** (from the brief; Verify/Ship measure these, not Capture):

1. A `Pulumi Deploy` run on `main` whose `Deploy Infrastructure` job concludes
   `success`, with the refresh step no longer 403ing.
2. The deploy debt is applied and observable: `/public` routed on the DO app
   (`doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | grep -c /public`,
   read-only; if `doctl` is unavailable, quote the run's own `~ updated` rows).
3. A regression-guard test exists and is green, reading the real workflow file
   (the `scripts/__tests__/pulumi-cli-pin.test.mjs` pattern).
4. `release.md` carries the human checklist for retiring the bypass: the exact
   Auth0 scopes to grant OR the exact `pulumi state delete` commands (with the
   `stack export` backup first), and what to remove from the workflow after.

## Reproduction / Evidence

All measured 2026-09-13 UTC from this worktree (branch
`fix/pulumi-refresh-blocks-apply` at `351a99e2b` == `origin/main`), read-only.

### Outage window

`gh run list --workflow pulumi-up.yml --limit 60 --json databaseId,createdAt,conclusion,headSha,event`
(abridged to the turning point; every non-cancelled run after 06:26Z is `failure`):

```
34740922628  2026-09-13T05:41:30Z  failure    dce2409d5  workflow_run   <- most recent
34740844371  2026-09-13T05:39:37Z  failure    dce2409d5  workflow_run
34730577897  2026-09-13T01:27:35Z  failure    5af211c6f  workflow_run
...
34385123277  2026-09-09T17:48:01Z  failure    0a60bbb08  workflow_run   <- #5169's triage run
34384875886  2026-09-09T17:45:35Z  cancelled  3b37e634c  push           <- #4565 merge, superseded
34383702799  2026-09-09T17:34:08Z  failure    6c0a54c51  push           <- #5165 revert: FIRST refresh-stage failure
34380735703  2026-09-09T17:05:07Z  failure    3b8c3d7c7  push           <- #4924 merge: failed at Up, not Refresh
34319050701  2026-09-09T06:26:16Z  success    82af9ac7e  workflow_run   <- LAST GREEN
```

Conclusion counts over those 60 runs:
`{"cancelled":11,"failure":38,"success":11}` — all 11 successes predate
2026-09-09T06:26Z. (The brief said 37; one more failure, 34740922628, landed
after it was written.)

### Where it fails, step by step (run 34740922628, `gh run view --json jobs`)

```
Deploy Infrastructure   failure
  8   success   Pin Pulumi CLI
  9   success   Pulumi Cancel + Clear Pending Operations
  10  failure   Pulumi Refresh (Sync state with cloud)
  11  skipped   Pulumi Up
Report Deploy Health    success      <- publishes deploy-result=failure to KV key deploy/infrastructure
```

Step 9 logs in to the R2 backend and runs `pulumi stack export | python3 | pulumi
stack import` successfully — so R2 credentials, the config passphrase, and
state-backend access are all working. The failure is inside refresh only.

The two 2026-09-09 runs bracket the transition:

```
34380735703  2026-09-09T17:05:07Z  3b8c3d7c7  Pulumi Refresh: success   Pulumi Up: failure   (403 on update:tenant_settings / update:branding per #4848)
34383702799  2026-09-09T17:34:08Z  6c0a54c51  Pulumi Refresh: failure   Pulumi Up: skipped   (403 on read:tenant_settings / read:branding)
```

### The orphaned URNs — exact strings from real logs

`gh run view 34740922628 --log-failed | grep -E "urn:pulumi" | sort -u` names
exactly two URNs and no others:

```
urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant
urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding
```

Verbatim error lines from that run (step `Pulumi Refresh (Sync state with cloud)`):

```
2026-09-13T05:42:50.3436670Z  ~  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error:   sdk-v2/provider2.go:571: sdk.helper_schema: 403 Forbidden: Insufficient scope, expected any of: read:branding: provider=auth0@3.51.0
2026-09-13T05:42:50.3440160Z  ~  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error: refreshing urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding: 1 error occurred:
2026-09-13T05:42:50.3466437Z  ~  auth0:index:Tenant mattbutlerengineering-tenant refreshing (0s) error:   sdk-v2/provider2.go:571: sdk.helper_schema: 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings: provider=auth0@3.51.0
2026-09-13T05:42:50.3472070Z  ~  auth0:index:Tenant mattbutlerengineering-tenant refreshing (0s) error: refreshing urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant: 1 error occurred:
2026-09-13T05:42:51.2754217Z     	* 403 Forbidden: Insufficient scope, expected any of: read:branding
2026-09-13T05:42:51.2764805Z     	* 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings
```

The same two URNs, same provider version (`auth0@3.51.0`), same scopes appear
in run 34730577897 (2026-09-13T01:27Z) and in #5169's triage run 34385123277
(2026-09-09T17:48Z). Both URNs fail in every run inspected — treat both as
affected, always.

### Proof the records are in state but not in the program

- `git grep -n -E "auth0\.(Tenant|Branding)" origin/main -- infrastructure/pulumi/`
  → none. `infrastructure/pulumi/auth0.ts` on `origin/main` declares only
  `auth0.ResourceServer` (:38), `auth0.Client` (:48), `auth0.ClientGrant` (:83),
  `auth0.User` (:95, :117).
- The read-only `Pulumi Preview (read-only)` run 34425499302
  (2026-09-10T01:26:45Z, `workflow_dispatch` on `main` @ `6524f6aae`, no
  refresh) planned them as deletes — i.e. present in recorded state, absent from
  desired state:

  ```
      - auth0:index/branding:Branding: (delete)
          [urn=urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding]
      - auth0:index/tenant:Tenant: (delete)
          [urn=urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant]
      ~ 3 to update
      - 2 to delete
      5 changes. 13 unchanged
  ```

  (The brief quoted "2 updates, 14 unchanged"; the transcript says 3/13 — use
  the measured figures.)

### How the orphans got there (PR metadata measured; mechanism from #4848, not re-measured)

- PR #4924 "fix: brand Auth0 universal login (tenant name, logo, dark palette)"
  merged **2026-09-09T17:05:04Z** as `3b8c3d7c7`, adding `auth0.Tenant` +
  `auth0.Branding`. Its apply (run 34380735703) passed refresh and failed at
  `Pulumi Up` — per #4848's 2026-09-09 comment, `403 Forbidden: Insufficient
scope, expected any of: update:tenant_settings` / `update:branding` — and
  both resources were nonetheless recorded in the `prod` stack state.
- PR #5165 "revert: #4924 …" merged **2026-09-09T17:34:05Z** as `6c0a54c51`,
  removing them from source. Its run 34383702799 is the first refresh-stage
  failure.
- PR #4565 "fix(infra): make ingress managed again so the /public/v1 route
  actually applies" merged **2026-09-09T17:45:29Z** as `3b37e634c` — eleven
  minutes into the outage; its push run was cancelled (superseded) and no run
  since has reached `up`. This is the deploy debt.

### Workflow structure as committed on `origin/main` (`git show origin/main:.github/workflows/pulumi-up.yml`)

- `on.push.paths` (lines 6-12): `infrastructure/pulumi/**`,
  `infrastructure/worker/**`, `apps/gen/**`, `packages/rialto/**`,
  `packages/rialto-catalog/**`, `packages/auth/**`. **`.github/workflows/**` is
  not in the filter** — a merge touching only the workflow will not trigger
  itself. `workflow_run` on "Deploy Static Sites" completed (lines 15-18);
  `workflow_dispatch:` (line 19). `concurrency: pulumi-deploy-${{ github.ref }}`,
  `cancel-in-progress: true` (lines 21-23).
- Job `Deploy Infrastructure` step order: Checkout → Setup pnpm → Setup Node.js
  → Install dependencies → Build gen app → Bundle edge router worker →
  `Pin Pulumi CLI` (line 75, `curl … | sh -s -- --version 3.253.0`) →
  `Pulumi Cancel + Clear Pending Operations` (line 80, raw CLI: `pulumi login`,
  `pulumi cancel`, `pulumi stack export | python3 | pulumi stack import`) →
  `Pulumi Refresh (Sync state with cloud)` (line 104,
  `pulumi/actions@8e5e406f4007fca908480587cb9893c07090f58d` v7.0.0,
  `command: refresh`, `pulumi-version: 3.253.0`) → `Pulumi Up` (line 123, same
  action and pin, `command: up`).
- **No `continue-on-error` and no `exclude` anywhere in the file** — refresh is
  unconditional and fatal.
- Guard test on `origin/main`: `scripts/__tests__/pulumi-cli-pin.test.mjs`
  reads the real file textually and asserts the `--version 3.253.0` install, a
  `pulumi-version:` on every `pulumi/actions` step equal to `3.253.0`, and that
  the pin step precedes every pulumi consumer.

### `pulumi-preview.yml` as committed on `origin/main` (measured, was unverified in the brief)

- Trigger surface is **`workflow_dispatch:` only** (lines 29-30) — no `push`,
  no `paths`. It does **not** run on `.github/workflows/**` changes or on any
  push; it can be dispatched from any ref
  (`gh workflow run pulumi-preview.yml --ref <branch>`).
- `command: preview`, `diff: true`, **`refresh: false`** (lines 154-156),
  `permissions: contents: read`, its own concurrency group
  (`pulumi-preview-*`, never cancels an in-flight apply).
- Guard test `scripts/__tests__/pulumi-preview-workflow.test.mjs` reads BOTH
  workflow files and pins: triggers `== ["workflow_dispatch"]`; the only
  `command:` value is `preview`; no mutating pulumi verb string anywhere in the
  file; every `refresh:` line `== "false"`; `permissions == ["contents: read"]`;
  the 3.253.0 pin; and **build-input parity with `pulumi-up.yml`** — the gen
  build's env var names and values and the esbuild bundle flags must match
  `pulumi-up.yml` exactly. It does not compare the `pulumi/actions` `with:`
  blocks, so an `exclude:` added to `pulumi-up.yml`'s steps does not by itself
  trip it.
- Consequence for Verify: because preview never refreshes, a dispatched preview
  from the run branch **cannot exercise a refresh-step exclusion**. It can show
  whether an `up`-side exclusion removes the `- 2 to delete` rows only if the
  same exclusion is also applied to `pulumi-preview.yml` (the brief's "parity"
  clause); otherwise it will reproduce run 34425499302's plan.

### Gaps (not guessed — surfaced for Architect/Verify)

- **GAP-1 (unmeasurable here):** the Pulumi M2M application's actual Auth0
  Management API scope list. Constraint forbids any Auth0 CLI/API/dashboard
  read. What is measured: the provider's own 403 text names the missing
  `read:branding` / `read:tenant_settings`, and no other URN appears in any
  error line of the three logs inspected — the remaining `auth0.*` resources
  refresh without error. The claim that the grant "holds scopes for
  ResourceServer/Client/ClientGrant/User" is inferred from that, and from
  #4848's comment, not read from Auth0.
- **GAP-2 (needs a real engine run):** whether `pulumi up --exclude <urn>`
  suppresses the planned `- delete` of a resource that is in state but absent
  from the program. The CLI help says excluded resources "will not be
  updated"; a delete is an update-class step, so it should — but nothing in
  this repo has proven it, and `pulumi-preview.yml` has no `exclude` input
  today. If the first real apply fails at the tail on the orphans, that is a
  finding, not a retry target.
- **GAP-3 (not evidenced):** whether `pulumi refresh` (as opposed to `up`)
  accepts `--continue-on-error` on CLI 3.253.0. Pulumi's CHANGELOG at
  `v3.253.0` evidences `up --continue-on-error` (≤ 3.116.1) and
  `up --refresh --continue-on-error`, but no `refresh --continue-on-error`
  entry. Local `pulumi` invocation is forbidden for this run, so this was not
  checked against the binary. The `pulumi/actions` `continue-on-error` input
  is the CLI flag ("Continue running the update even if an error is
  encountered"), distinct from GitHub's step-level `continue-on-error:` key.

## Root-cause hypothesis

**Hypothesis, not finding.** Two halves, and either alone would not block
applies:

1. **Orphaned state.** The `prod` stack state carries two Auth0 records
   (`Tenant`, `Branding`) that the program no longer declares (since revert
   #5165) and that the Pulumi M2M grant cannot read (`read:tenant_settings`,
   `read:branding` missing — the provider 403s deterministically). How they were
   recorded despite the 403 on `update:*` during #4924's apply is not measured
   (the #4848 comment asserts it; the refresh logs and preview 34425499302 prove
   they are in state now).
2. **Unconditional, fatal refresh.** `pulumi-up.yml` runs `command: refresh`
   before `command: up` with no `exclude`, no `continue-on-error`, and no
   scoping, so one unreadable record fails the step and skips `up`.

With readable state (scopes granted) or without the records (state delete),
refresh passes. With a scoped or non-fatal refresh, the orphans are skipped —
but `up` then plans `- delete` for both (measured in preview 34425499302), and
Branding delete needs `update:branding` per #4848 (Tenant delete is a provider
no-op), so a fix that only softens refresh is expected to move the failure to
the `Pulumi Up` tail unless the orphans are excluded there as well (GAP-2).

## Blast radius

- **What:** all production infrastructure applies via `pulumi-up.yml` — the
  only path that runs the Pulumi engine against `prod`. Zero applies since
  2026-09-09T06:26:16Z; refresh-stage failure since 2026-09-09T17:34:08Z
  (3.5 days at capture); 38 failed runs in the last 60.
- **Deploy debt held back:** #4565 `3b37e634c` — the `/public` ingress rule
  on the DO app plus `originRoutes: ["/api","/public"]` in the edge router
  (preview 34425499302: `~ 3 to update`, `13 unchanged` beyond the two
  deletes). The `public-ingress-never-applied` run closed (retro on
  `origin/main`) with this exact blocker recorded as "re-measured, reported,
  and deliberately not touched"; its user-facing defect — `/public/v1` not
  routed — is therefore still live in production. #4794 `0a60bbb08` (no infra
  diff) is also queued behind it.
- **Downstream victim (not in scope):** PR #5315
  (`maintenance:rialto-web-usage-instrumentation`, parked, `tier:critical`)
  adds an Analytics Engine binding that cannot reach production until applies
  work.
- **Signals lit:** #5169 (`ciHealth.pass_rate_pct` regression, `bug`/`ci-fix`,
  open since 2026-09-09T18:14:55Z) and the `Report Deploy Health` job writing
  `deploy-result: failure` to KV key `deploy/infrastructure` on every run.
- **Who:** Matt (sole operator, and the only one who can apply either
  documented human fix); the autonomous pipeline (any run whose Ship needs an
  infra apply); consumers of `/public/v1` on the DO app.
- **Not affected:** static-site deploys (`Deploy Static Sites` keeps
  completing — its `workflow_run` completion is what fires most of the failed
  runs), DO service deploys (`deploy-services.yml`, separate), and running
  production resources (a failed refresh mutates nothing).

## Ruled out

- **Runner-image / CLI-version float** (the #4117/#4118 class): the CLI is
  pinned to 3.253.0 in the install step and both action steps (guard test
  green on `origin/main`), and the failure is a deterministic named-scope 403,
  not `InvalidDigest`. Step 9 (`Pulumi Cancel + Clear Pending Operations`)
  succeeds against R2 every run, so backend access, credentials, and passphrase
  are fine.
- **Flake / retry:** 38 consecutive non-cancelled failures over 3.5 days with
  byte-identical error text and no intervening code change to the program.
- **A code error in the Pulumi program:** `origin/main` declares no
  `auth0.Tenant` / `auth0.Branding`; the revert is on `main`. The program is
  not the source of the records — the state is.
- **A `pulumi-preview.yml`-side fix:** preview never refreshes and never
  applies; it is an instrument, not a path to production.
- **Re-landing #4924 with scopes:** out of scope by the brief; the Auth0 half
  stays open for the user (#4848).
- **The two documented human fixes** (from #4848's 2026-09-09 comment, quoted
  so the fixer does not re-derive them — neither is available to this run):
  1. Grant `read:tenant_settings`, `update:tenant_settings`, `read:branding`,
     `update:branding` to the Pulumi M2M application's Management API client
     grant (PATCH replaces the array — include existing scopes), then
     `gh workflow run pulumi-up.yml --ref main`; `up` then deletes both
     records (Tenant delete no-op; Branding delete resets universal-login
     branding to defaults).
  2. `pulumi stack export --stack organization/mbe-infrastructure/prod > state-backup-<date>.json`
     then `pulumi state delete '<tenant-urn>' --stack organization/mbe-infrastructure/prod --yes`
     and the same for `<branding-urn>`, with real R2 credentials. Local
     `pulumi whoami` against R2 fails (memory: 20-char key) — do not try to
     obtain credentials.
- **State surgery inside the workflow's existing export/import step** (step 9
  already pipes `stack export` through a Python filter into `stack import`, so
  the orphans _could_ be dropped there): excluded by the brief's scope ("Pulumi
  state surgery" is Out; `stack import`/`state delete` are the user's).
  Recorded so Architect does not rediscover it as an option.

## Notes

- **Mechanisms measured for Architect to weigh** (Capture records, does not
  choose):
  - `pulumi/actions@8e5e406f…` (v7.0.0) `action.yml` inputs include `exclude`
    ("Specify a single resource URN to ignore. Multiple resources can be
    specified one per line"), `exclude-dependents`, `target`,
    `target-dependents`, `refresh` ("Execute the operation with the
    `--refresh` option"), `continue-on-error` (CLI flag — see GAP-3),
    `expect-no-changes`.
  - Pulumi CLI (CHANGELOG at tag `v3.253.0`, read via GitHub API):
    `--exclude` / `--exclude-dependents` added 3.158.0 (2025-03-24); wildcard
    handling for `--exclude` fixed 3.188.0; `--include`/`--exclude` for
    program-based refresh (RefreshV2) fixed 3.229.0 (2026-04-02) — all ≤ the
    pinned 3.253.0. Not run against a binary (forbidden for this run).
  - GitHub step-level `continue-on-error: true` on the refresh step lets `up`
    run but does nothing about the `- 2 to delete` plan (see hypothesis).
  - Whichever is chosen is a **temporary bypass**: it must sit next to the two
    URNs with the condition for removing it (scopes granted OR records
    deleted), and be guarded by a test that reads the real workflow file so it
    cannot drift or be forgotten.
- **Trigger caveat for Ship:** the push path filter will not fire on a
  workflow-only change; the first real apply must be
  `gh workflow run pulumi-up.yml --ref main`, and Ship must quote the run ID,
  the `Deploy Infrastructure` **job** conclusion, and the applied rows.
- `git diff origin/main..HEAD -- infrastructure/pulumi/` is empty on this
  branch at capture — the brief's precondition for any branch-side apply.
- Measured deltas from the brief: 38 failures (not 37); preview 34425499302 is
  `~ 3 to update / 13 unchanged` (not 2/14); `--exclude` presence evidenced
  from the CHANGELOG rather than a local binary.
