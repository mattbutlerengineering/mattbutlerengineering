# Autorun brief — pulumi refresh blocks every production apply

Collected 2026-09-12 by the autorun orchestrator from the user's instruction
("fix it", given against the measured blocker below) plus measurements taken
in-session. This file is not an artifact: it never counts toward orientation.
Every fact below carries its source; anything unmeasured is marked as such.

## Run

- **Scale:** maintenance run. Directory `docs/fixes/pulumi-refresh-blocks-apply/`.
- **Slug:** `pulumi-refresh-blocks-apply`.
- **Variant:** defect brief (something is broken — a regression since 2026-09-09).
- **Worktree:** `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/4bd870b5-39eb-4dfd-b509-43c76fe74668/scratchpad/pulumi-refresh-blocks-apply`,
  branch `fix/pulumi-refresh-blocks-apply`, cut from `origin/main` at `351a99e2b`.
  Fresh checkout: run `pnpm install --frozen-lockfile` before any gate, and
  `pnpm build --filter @mbe/cli...` before committing (the pre-commit
  `check-adr` imports `@mbe/agent-core/dist`, which a fresh worktree lacks).
- **Origin:** user instruction, not a backlog seed and not tracker intake. Do
  not claim a `docs/backlog.md` line. Tracker issues are cited as evidence only
  (see Tracker policy).
- **Re-entry recommendation:** `architect`. The fix touches the production
  deploy pipeline's design (`.github/workflows/pulumi-up.yml`) and there is a
  real choice between mechanisms (below). Capture decides and records it.

## What is broken

**Observed:** every `Pulumi Deploy` run on `main` fails in the step
`Pulumi Refresh (Sync state with cloud)` before `Pulumi Up` executes. No
infrastructure change has applied to production since 2026-09-09.

**Expected:** a push to `main` touching `infrastructure/**` (or a completed
static deploy) applies the Pulumi program to the `prod` stack.

## Evidence (measured 2026-09-12/13 unless dated otherwise)

- **Outage window.** `gh run list --workflow pulumi-up.yml --limit 60`: last
  `success` **2026-09-09T06:26:16Z** at `82af9ac7e`; oldest failure in the
  window **2026-09-09T17:05:07Z**; **37 failures** in the last 60 runs; the
  six most recent (through 2026-09-13T01:27Z) are all `completed/failure`.
- **Failing job/step** (run at 2026-09-13T01:27Z): job `Deploy Infrastructure`,
  step `Pulumi Refresh (Sync state with cloud)`. Log, verbatim:

  ```
  ~  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error:   sdk-v2/provider2.go:571: sdk.helper_schema: 403 Forbidden: Insufficient scope, expected any of: read:branding: provider=auth0@3.51.0
  ~  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error: refreshing urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding: 1 error occurred:
  ```

  Earlier runs (#5169's triage, run 34385123277) show the same 403 for
  `auth0:index:Tenant mattbutlerengineering-tenant` on `read:tenant_settings`.
  Treat both URNs as affected even where one run's log shows only one.

- **How the orphans got there** (from the 2026-09-09 comments on #4848, and
  PR metadata): #4924 "brand Auth0 universal login" merged
  **2026-09-09T17:05:04Z** (`3b8c3d7c7`), adding `auth0.Tenant` +
  `auth0.Branding`. Its apply 403'd on `update:tenant_settings` /
  `update:branding` but **both resources were still recorded in the `prod`
  stack state**. Revert #5165 merged **2026-09-09T17:34:05Z** (`6c0a54c51`),
  removing them from source. Since then `pulumi refresh` reads every resource
  in state, hits the two orphans, 403s on the `read:*` scopes, and the step
  fails. The Pulumi M2M application's Management API grant holds scopes for
  the resource types still in the program (`auth0.ResourceServer`,
  `auth0.Client`, `auth0.ClientGrant`, `auth0.User` in
  `infrastructure/pulumi/auth0.ts`) but not `read/update:tenant_settings`
  or `read/update:branding`.
- **Orphaned URNs** (from the #4848 comment; confirm against a real refresh
  log or `pulumi stack export` — do not guess the exact strings):
  - `urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant`
  - `urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding`
- **Workflow structure** (`.github/workflows/pulumi-up.yml` on `main`):
  `Pulumi Refresh` (pulumi/actions@8e5e406f…, v7.0.0, `command: refresh`,
  no `continue-on-error`) runs unconditionally before `Pulumi Up`
  (`command: up`). Both pin `pulumi-version: 3.253.0` and use the R2
  `cloud-url`. A `Pin Pulumi CLI` step (line ~75) and a
  `Pulumi Cancel + Clear Pending Operations` step (line ~80) already invoke
  the CLI directly — precedent for raw-CLI steps in this workflow.
- **Triggers:** `push` to `main` filtered to `infrastructure/pulumi/**`,
  `infrastructure/worker/**`, `apps/gen/**`, `packages/rialto/**`,
  `packages/rialto-catalog/**`, `packages/auth/**`; `workflow_run` after
  "Deploy Static Sites" completes; `workflow_dispatch`. **The filter does not
  include `.github/workflows/**`** — a merge that changes only the workflow
  file will not trigger itself. `concurrency: pulumi-deploy-${{ github.ref }}`
  with `cancel-in-progress: true`.
- **Deploy debt** that applies on the first successful `up` (from #4848 /
  `docs/fixes/public-ingress-never-applied/`): #4565 `3b37e634` (`/public`
  ingress rule on the DO app + `originRoutes: ["/api","/public"]` in the edge
  router; preview showed 2 updates, 14 unchanged) and #4794 `0a60bbb0` (no
  infra diff). A read-only preview on 2026-09-10 (run 34425499302) also showed
  the two orphans as `- delete` rows.
- **Downstream victim:** PR #5315 (`maintenance:rialto-web-usage-instrumentation`,
  parked, `tier:critical`) adds an Analytics Engine binding that cannot reach
  production until applies work; it is NOT part of this run.
- **`pulumi-preview.yml`** does not run refresh and keeps working (memory note
  2026-09-10, unverified this session — measure before relying on it).

## Root-cause hypothesis (hypothesis, not finding)

Two orphaned Auth0 records in the `prod` stack state that the Pulumi M2M
grant cannot read, combined with an unconditional, fatal `pulumi refresh`
step ahead of `pulumi up`. Either half alone would not block applies: with
readable state the refresh passes; with a non-fatal or scoped refresh the
orphans are skipped.

## Ruled out / already known

- Not a runner-image or CLI-version float: the CLI is pinned (3.253.0) and
  the failure is a deterministic 403 on a named scope.
- Not fixable by re-running: 37 consecutive failures with no code change in
  between.
- Not a code error in the program: the revert (#5165) is on `main` and the
  program no longer declares Tenant/Branding.
- Both documented fixes on #4848 need a human: (1) grant
  `read/update:tenant_settings` + `read/update:branding` to the Pulumi M2M
  app in the Auth0 dashboard; (2) `pulumi stack export` backup then
  `pulumi state delete <urn>` ×2 with real R2 credentials. **Neither is
  available to this run** (see Constraints). Local `pulumi whoami` against the
  R2 backend fails (memory note: 20-char key) — do not try to obtain
  credentials.

## Mechanisms available to a code-side fix (for Architect to weigh)

Measured 2026-09-13:

- `pulumi/actions` at the pinned SHA exposes inputs `exclude`,
  `exclude-dependents`, `target`, `target-dependents`, `continue-on-error`,
  `refresh` (list read from its `action.yml`).
- The Pulumi CLI has `refresh --exclude <urn>` and `up --exclude <urn>`
  ("Specify a resource URN to ignore. These resources will not be updated.
  … Wildcards (*, **) are also supported"). Present on the local 3.200.0
  binary; the pinned 3.253.0 is newer.
- `continue-on-error: true` on the refresh step would let `up` run, but `up`
  then plans `- delete` for both orphans, and Branding delete needs
  `update:branding` (Tenant delete is a provider no-op per #4848) — expect the
  run to still fail at the tail unless the orphans are also excluded from `up`.

Whichever mechanism is chosen: the exclusion is a **temporary bypass**, not
the end state. It must be recorded next to the URNs with the condition for
removing it (scopes granted, or state records deleted), and guarded by a test
that reads the real workflow file (the `scripts/__tests__/pulumi-cli-pin.test.mjs`
pattern) so it cannot silently drift or be forgotten.

## Target state / success criteria

1. A `Pulumi Deploy` run on `main` whose `Deploy Infrastructure` **job**
   concludes `success` (job conclusion, not workflow rollup — a skipped job
   also reports workflow `success`), with the refresh step no longer 403ing.
2. The deploy debt is applied and observable: `/public` is routed on the DO
   app (`doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | grep -c /public`
   per the prior run's checklist — read-only; if `doctl` is unavailable,
   quote the Pulumi run's own `~ updated` rows instead).
3. A regression guard test exists and is green, reading the real workflow.
4. `release.md` carries the human checklist for retiring the bypass: the exact
   Auth0 scopes to grant OR the exact `pulumi state delete` commands (with the
   `stack export` backup first), and what to remove from the workflow
   afterwards.

## Scope

**In:** `.github/workflows/pulumi-up.yml` (and, if the mechanism needs it,
`pulumi-preview.yml` for parity); a guard test under `scripts/__tests__/`;
docs for the bypass; the run artifacts.

**Out:** Auth0 dashboard/API changes; Pulumi state surgery; re-landing #4924;
anything in `infrastructure/pulumi/**` beyond a comment; #5315; the ciHealth
sensor itself.

## Constraints (standing, verbatim where quoted)

- "DON'T read service `.env` files to extract production credentials
  (DATABASE_URL, API keys) — request them from the user or read from the
  deployment platform's secret store."
- "NEVER hardcode secrets in source code" / "ALWAYS use environment variables
  or a secret manager". `gh secret set` always with `--body`.
- **Deploy via CI only.** No local `pulumi up|refresh|destroy`, no `doctl apps
create-deployment`, no `wrangler deploy`. Production applies happen only
  through `pulumi-up.yml` on GitHub Actions.
- **Do NOT run `pulumi state delete`, `pulumi stack import`, or any Auth0
  console/Management-API mutation.** These are the user's, and are the
  documented alternative fixes — surface them, never execute them.
- Do not run `scripts/check-ai-antipatterns.mjs --update`; do not modify
  `metrics/ai-antipattern-baselines.json`.
- Never use `status` as a shell variable name (zsh read-only).
- Never `git add -A` (the PostToolUse prettier hook dirties ~150 files);
  stage explicit paths. Never `git push | tail`; verify every push by
  comparing `git rev-parse HEAD` with `git ls-remote origin <branch>`.
- Commit trailer, exactly:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NUFvW3cT7ZpDE9PcemHv25
  ```

  PR bodies end with:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01NUFvW3cT7ZpDE9PcemHv25
  ```

## Tracker policy

Read-only. #5169 (ciHealth regression, root-caused to this failure) and #4848
(the Auth0 branding audit issue carrying the two documented fixes) are
evidence; cite them in artifacts and in the commit message with `Refs #5169`
(never `Closes`/`Fixes` — the Auth0 half stays open for the user). Do not
create, close, label, or comment on any issue.

## Release authorization

**Full release, given as "fix it" by the user on 2026-09-12** — logged here
as the orchestrator's reading of that instruction; record it in
`release.md` frontmatter under `assumptions:` as well.

Ship MAY: merge the PR once `CI Gate` is green and Review has no unfixed
Critical; then, because the push filter will not fire for a workflow-only
change, run `gh workflow run pulumi-up.yml --ref main` and watch the
`Deploy Infrastructure` job to its conclusion; quote the run ID, the job
conclusion, and the applied rows.

Ship MUST NOT: touch Auth0; run any Pulumi command locally; delete or import
state; force-push; merge past a red `CI Gate` or an unfixed Critical.

Verify (before merge) MAY dispatch a **read-only** preview from the run branch
if `pulumi-preview.yml` supports `workflow_dispatch`, to show the plan no
longer touches the orphans. A production **apply** from the run branch is
permitted only if `git diff origin/main..HEAD -- infrastructure/pulumi/` is
empty (so the only difference from `main` is the workflow itself) and the
decision is logged under `assumptions:`; prefer leaving the apply to Ship on
`main`.

## Known unknowns (⛔ = stop and surface, do not guess)

- Whether `up --exclude <orphan-urn>` suppresses the planned `- delete` of a
  resource that is in state but absent from the program. The CLI help says
  "will not be updated"; a delete is an update-class step, so it should — but
  this is exactly what the real run must prove. If the first real run fails
  at the tail on the orphans, that is a finding, not a retry target.
- Exact orphan URN strings: take them from a real log or export, not from
  this brief.
- Whether `pulumi-preview.yml` has `workflow_dispatch` and runs on
  `.github/workflows/**` changes (measure).
- ⛔ Any step that would require the user's credentials (Auth0, R2 keys,
  passphrase) outside GitHub Actions' own secrets.
- ⛔ Any reading in which the fix requires changing `infrastructure/pulumi/**`
  program code in a way that alters production resources beyond the deploy
  debt already merged to `main`.
- After the first green apply, the accumulated deploy debt lands in
  production (the `/public` ingress rule and edge-router `originRoutes`).
  That is intended and was authorized by the earlier public-ingress run, but
  Ship must state what applied, not just that the run was green.
