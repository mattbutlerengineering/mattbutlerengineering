---
stage: ship
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-13
assumptions:
  - "Soft gate: maintenance run — no `prd.md`. `review.md` has 0 unfixed critical and 0 major (2 minor: the gotchas wording fixed in `644897321`; the dangling `release.md` reference — this file's absence from the branch — discharged by committing this file BEFORE the PR). `verification.md` § Failures reads `None.`; `defect.md` Done-when 1, 2 and 4 are this stage's to produce."
  - "Release authorization: FULL. `autorun-brief.md` § Release authorization records the orchestrator's reading of the user's instruction `fix it` (given 2026-09-12, repeated verbatim 2026-09-13 when asked nothing) as: open the PR, merge on `CI Gate` green, dispatch `pulumi-up.yml` on `main` (the push filter excludes `.github/workflows/**`), read the `Deploy Infrastructure` job. No separate go/no-go was asked before the merge or the dispatch."
  - "The stage ran INLINE in the orchestrator: the harness's auto-mode classifier denied dispatching a Ship subagent that would merge to `main` and trigger a production apply unattended (2026-09-13 ~07:40Z). Per the autorun skill (`Where dispatching a fresh agent context isn't supported, run the stage inline instead`), every external action below is one individually permission-checked command, recorded as it ran. Same actions, same evidence, same record."
  - "The two human fixes are copied verbatim from `docs/fixes/public-ingress-never-applied/release.md` step 0 (`origin/main`), never re-derived and never executed by this run. Both remain the user's (Matt's) actions."
  - "This file is committed on the run branch with § Release log unfilled (placeholders marked `_pending_`) so the marker comments' reference resolves at merge time; the filled version lands on `main` through a docs-only follow-up PR after the apply — the write-back path that earlier prepare-and-stop runs lacked (their `release.md` said PREPARED-NOT-RELEASED for days after the fact)."
  - "`docs/backlog.md` line 128 is related but NOT claimed (brief: the run's origin is the user's instruction, not a seed); Operate appends the removal-condition seed at run close."
---

# Release: pulumi orphan-exclude bypass — `exclude:` the two Auth0 orphans on refresh, up and preview

Restores production infrastructure applies without touching the Auth0 grant or
prod state. The bypass is **temporary**: it stays until the human retires the
two orphaned records (§ Human checklist), then one removal PR takes it out.

Refs #5169, #4848 (evidence only — neither is closed by this release).

## Pre-flight

Every line below is a command this stage ran on 2026-09-13 (UTC), quoted.

- [x] **Verification green (no unresolved failures).** `verification.md`
      (`0e55282d6`, 2026-09-13): § Failures — _"None. Nothing routes back to
      Implement."_ Guard test 5 RED on `origin/main`'s workflows / 11 GREEN on
      the branch; `scripts` suite `168 files / 3242 tests` green; preview run
      **34743839849** from the branch (`33b494b02`): `~ 3 to update`,
      `15 unchanged`, **0** `delete` lines, both orphan URNs present only in the
      action's `exclude:` input echo. V5 (refresh-side exclusion) is recorded as
      _not verified — proven by the first post-merge run_, not as a pass.
- [x] **Review: no unfixed critical.** `review.md` (`61ab775fa`): 2 findings —
      0 critical, 0 major, 2 minor (one fixed in `644897321`, one discharged by
      this commit). Verdict: _"NO unfixed critical findings — Ship may proceed."_
- [x] **No secrets in the diff.**
  ```
  $ git diff origin/main..HEAD | grep -E '^\+' \
      | grep -cE 'sk_live|pk_live|rk_live|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN'
  1
  $ git diff origin/main..HEAD | grep -nE '^\+.*(sk_live|…|-----BEGIN)'
  2122:+`git diff origin/main..HEAD | grep -iE 'token|secret|key|password|AKIA|sk_live'`
  ```
  The one hit is `review.md` quoting its own grep pattern (docs prose, no
  value). Restricted to the four non-doc files: `0`. Literal
  `secret|token|password|passphrase = "<12+ chars>"` in added lines under
  `.github`, `scripts`, `.claude`: `0` (grep exit 1).
- [x] **Target configuration exists — in CI secrets only, unchanged.** The
      `exclude:` input is static YAML; no new secret or variable is required.
      Secrets `pulumi-up.yml` references, all on unchanged context lines (names
      only): `PULUMI_CONFIG_PASSPHRASE`, `R2_ACCESS_KEY_ID`,
      `R2_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`,
      `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`,
      `AUTH0_GEN_CLIENT_ID`, `VITE_AUTH_AUTHORITY`, `CLOUDFLARE_ACCOUNT_ID`,
      `HEALTH_KV_NAMESPACE_ID`. Nothing runs locally; no `.env` was read.
- [x] **No migrations / data changes.**
      `git diff --name-only origin/main..HEAD | grep -Ei 'migration|prisma|\.sql$'`
      → no output (grep exit 1). The change set is 10 files: 4 non-doc
      (`.github/workflows/pulumi-up.yml` +26/−0, `.github/workflows/pulumi-preview.yml`
      +14/−0, `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` +310,
      `.claude/rules/gotchas.md` +1) and the six run docs. `infrastructure/pulumi/**`
      and `metrics/ai-antipattern-baselines.json` untouched.
- [x] **Rollback plan concrete** — below.
- [x] **Scope invariant.** `git diff origin/main..HEAD -- infrastructure/pulumi/`
      → empty, so the first apply executes exactly the plan already merged on `main`
      (#4565, #4794, #5315), not anything from this branch.

## Rollback plan

Three layers; each is real commands.

**(a) The bypass itself** — a workflow-only change; reverting it fires no run
and changes no infrastructure. It returns the pipeline to the status quo
(refresh 403 on the two orphans, `Pulumi Up` skipped):

```
git fetch origin
git checkout -b revert/pulumi-orphan-exclude-bypass origin/main
git revert --no-edit <squash-sha>          # the squash of the PR recorded in § Release log
git push -u origin revert/pulumi-orphan-exclude-bypass
gh pr create --base main --title "revert: pulumi orphan-exclude bypass" --body "Refs #5169"
gh pr merge <N> --squash                   # on CI Gate green
```

The revert deletes `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`
along with the three `exclude:` blocks, so no guard is left asserting a bypass
that no longer exists.

**(b) Infrastructure the first apply lands** — none of it is this run's: the
`~ 3` rows are #4565 (`3b37e634c`, DO App `/public` ingress rule + edge-router
`originRoutes`), #4794 (`0a60bbb08`) and #5315 (`ec25f648b`, edge-router
`ANALYTICS` binding), all merged on `main` before this run. To undo any of them:
revert that PR on `main`, then `gh workflow run pulumi-up.yml --ref main` — which
now works _because_ the bypass stays. The App rule's rollback is itself a full
DO deployment (~30 min); the two `WorkersScript` rollbacks apply in seconds.

**(c) A half-landed apply** (DO App update fails mid-deployment): follow the
public-ingress plan — read `doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | head -3`
until nothing is `PENDING`/`DEPLOYING`, then at most **one** re-dispatch. Never
`pulumi state delete`, never `doctl apps update` by hand.

## Human checklist — retiring the bypass (Matt)

The bypass is dead weight the moment EITHER of these is done, and the removal
PR should follow. **A scope grant produces no pipeline signal** — the excluded
records are never touched, so nothing goes red to remind anyone. This checklist,
the marker comments, the gotchas bullet and Operate's backlog seed are the only
mitigations.

**Removal condition — do ONE of these (copied verbatim from
`docs/fixes/public-ingress-never-applied/release.md` step 0; neither was run by
this release):**

- _Option 2 — delete the two records from prod state (no Auth0 change):_ with
  the real R2 keys (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) and
  `PULUMI_CONFIG_PASSPHRASE`:

  ```
  cd infrastructure/pulumi
  pulumi login "s3://mattbutlerengineering-pulumi-state?endpoint=https://59d5bec2d6e979d474efe54ec76c3658.r2.cloudflarestorage.com&s3ForcePathStyle=true"
  pulumi stack export --stack organization/mbe-infrastructure/prod > state-backup-$(date +%Y%m%d).json   # keep this
  pulumi state delete 'urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant' --stack organization/mbe-infrastructure/prod --yes
  pulumi state delete 'urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding' --stack organization/mbe-infrastructure/prod --yes
  ```

  Check: `pulumi stack export --stack organization/mbe-infrastructure/prod | jq '[.deployment.resources[].urn|select(test("auth0:index/(tenant|branding)"))]|length'` → `0`.

- _Option 1 — grant the scopes (keeps the door open to re-land #4924):_ Auth0
  Dashboard → Applications → the Pulumi M2M app → APIs → Auth0 Management API →
  add `read:tenant_settings`, `update:tenant_settings`, `read:branding`,
  `update:branding`. Check:
  `auth0 api get "client-grants?audience=https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/api/v2/"`
  shows all four on that grant. Consequence: the next `up` after removal
  executes the two `- delete` rows (Tenant delete is a provider no-op; Branding
  delete resets universal-login branding to defaults, which per #4848 is what
  production shows today).

**The removal PR** — one PR, nothing else in it:

1. Remove the three `exclude:` blocks **with their marker comments**:
   `.github/workflows/pulumi-up.yml` (steps `Pulumi Refresh (Sync state with cloud)`
   and `Pulumi Up`) and `.github/workflows/pulumi-preview.yml` (step
   `Pulumi Preview (no apply, no refresh)`).
2. Delete `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`.
3. Drop the `.claude/rules/gotchas.md` bullet that begins _"Two Auth0 records
   orphaned by #4924 …"_ under `## Pulumi / R2 state backend`.
4. `pulumi-cli-pin.test.mjs` and `pulumi-preview-workflow.test.mjs` stay
   untouched and green before and after.

**Ordering matters** (refresh bails on a missing literal `--exclude`; up and
preview ignore it; the push filter never fires on a workflow-only merge):

- **Option 2 (state delete): merge the removal PR FIRST, then `state delete`,
  then `gh workflow run pulumi-up.yml --ref main`.** No red run at all. The
  reverse order turns the bypass into a loud blocker — refresh fails with
  `one or more targets could not be found in the stack` — until the PR merges.
- **Option 1 (scopes): grant, then merge the removal PR, then dispatch.** Until
  the PR merges the bypass is harmless dead weight.

**Relation to `docs/backlog.md` line 128** (_Escalate a human-gated blocker
that outlives the run that found it …_, from
`maintenance:public-ingress-never-applied`): the apply outage that seed
describes is **bypassed** by this run and **retired** only by the human fix
above. The line is not claimed by this run; Operate appends the
removal-condition seed at run close.

## Release steps — executed inline, each recorded in § Release log

**S0 — serialization check** (public-ingress step 1 **plus `deploy-static.yml`**;
a static deploy completing during the ~30-minute DO deployment fires
`pulumi-up.yml`'s `workflow_run` trigger and `cancel-in-progress: true`
cancels the apply mid-`up`), run immediately before the PR merge and again
immediately before the dispatch:

```
date -u +%Y-%m-%dT%H:%M:%SZ
gh run list --status in_progress --workflow pulumi-up.yml        --json databaseId,createdAt,headBranch
gh run list --status in_progress --workflow deploy-services.yml  --json databaseId,createdAt,headBranch
gh run list --status in_progress --workflow deploy-static.yml    --json databaseId,createdAt,headBranch
gh run list --status queued      --workflow pulumi-up.yml        --json databaseId --jq length
gh run list --status queued      --workflow deploy-services.yml  --json databaseId --jq length
doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format ID,Phase,Cause,Created | head -3
```

Proof: the `gh` lines print nothing / `0`; the newest DO deployment is not
`PENDING`/`DEPLOYING`.

**P — the PR.** `gh pr create --base main --head fix/pulumi-refresh-blocks-apply …`,
body ends with the session attribution; `Refs #5169`, `Refs #4848`, never
`Closes`. Watch `CI Gate` (the only required check; `codecov/patch` and
`Hospitality E2E` are advisory) by polling
`gh pr view <N> --json mergeStateStatus,statusCheckRollup`. Merge with
`gh pr merge <N> --squash` (a `CLEAN` PR refuses `--auto`;
`delete_branch_on_merge` is on). Proof: `gh pr view <N> --json state,mergeCommit`
→ `MERGED <squash-sha>`.

**S1 — exactly one dispatch.** `gh workflow run pulumi-up.yml --ref main`, then
`gh run list --workflow pulumi-up.yml --branch main --limit 5 --json databaseId,headSha,event,status`
filtered to `event == workflow_dispatch` and `headSha == <squash-sha>` (never
`--commit`).

**S2 — job-level result, never the workflow rollup:**
`gh run view <id> --json jobs --jq '.jobs[]|select(.name=="Deploy Infrastructure")|{conclusion,steps:[.steps[]|"\(.name)=\(.conclusion)"]}'`
→ `Deploy Infrastructure` = `success`, `Pulumi Refresh (Sync state with cloud)`
= `success`, `Pulumi Up` = `success`.

**S3 — refresh log:** both URNs in zero error lines
(`grep -E 'urn:pulumi.*auth0:index/(tenant|branding)' | grep -ci 'error\|forbidden'` → `0`);
the refresh `Resources:` summary quoted (expect `16 unchanged`, or `~ N updated`
if live drift was found — quoted either way).

**S4 — up log:** the `Resources:` line quoted — expect `~ 3 updated`,
`15 unchanged`, **no `deleted`**; every `~` row named; neither orphan URN in a
`-` row. Expect and do not chase
`warning: Resource does not support customTimeouts, ignoring: update=15m0s`.

**S5 — deploy debt drained, read-only** (public-ingress step 4):

```
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public                      # → 1
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format json | jq -r '.ingress.rules[]|"\(.match.path.prefix) -> \(.component.name)"'
curl -sS -D- https://mattbutlerengineering.com/public/v1/venues/x       # → 404 application/json, body includes "Venue not found"
curl -sS -D- https://api.mattbutlerengineering.com/public/v1/venues/x   # → same
curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/api/v1/venues   # → 401 (control)
curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/publicity      # → 200 (SPA)
node scripts/check-api-surface-invariants.mjs      # NO --base
```

The discriminator is the body: `Venue not found` is reservations-api's own
handler; `Route GET:… not found` is the catch-all — a 404 with the wrong body
is the DO gate still shut. LAN-DNS cross-check with `dig @1.1.1.1` before
calling any host down.

**S6 — DO deployment landed, not merely serving:** `doctl apps list-deployments …`
phase `ACTIVE` for the new deployment; `curl -s https://api.mattbutlerengineering.com/api/v1/users/health`
(the DB probe, not `/health`).

**S7 —** `Report Deploy Health` wrote `deploy/infrastructure` = `success`
(read from the run's job/step conclusions; the KV itself is not read locally).

**Failure branches (no retry loops, never `pulumi state delete`):**
S-fail-1 refresh error line naming an orphan with `Insufficient scope` → the
exclusion did not reach the engine at runtime; one dispatch, stop, surface.
S-fail-2 `one or more targets could not be found in the stack` naming an orphan
→ the human already deleted the records; the only correct action is the removal
PR. S-fail-3 `Pulumi Up` tail failure naming an orphan → GAP-2 falsified by a
real run; record the lines, do not re-dispatch. DO App update failure → § Rollback
(c). Concurrency-group cancellation → the superseding run on the same SHA is the
evidence.

## Release log

_Every entry is a command this stage ran, with its result and UTC time._

1. `git rev-parse HEAD` / `git ls-remote origin refs/heads/fix/pulumi-refresh-blocks-apply` before this commit → `61ab775fa` == remote.
2. This file committed on the branch (`docs(pulumi-refresh-blocks-apply): record the release plan and human checklist`) → `359fa90fb`; push verified `git ls-remote` == local (the push took >120 s because the pre-push hook builds the CLI and runs `pnpm regen --check`; the PostToolUse push verifier fired _before_ the push finished and reported `remote BEHIND local` — a false alarm, re-read after completion showed `359fa90fb` on both sides).
3. S0 (pre-PR) at `2026-09-13T07:41:40Z` → `pulumi-up.yml` / `deploy-services.yml` / `deploy-static.yml` in_progress: `[]` `[]` `[]`; queued: `0` `0`; DO deployments: newest `c42c16cc… ACTIVE manual 2026-09-12 22:36:25Z`, then `21f244f8… CANCELED app spec updated`; `origin/main` = `ec25f648b`.
4. P: `gh pr create --base main --head fix/pulumi-refresh-blocks-apply …` at `07:42:25Z` → **PR #5329**, head `359fa90fb`, base `main`. `tier-classifier` (run `34745895058`) labelled it `tier:sensitive` (T3 — `.github/workflows/**` matches the sensitive tier, not critical). Per the standing merge policy (`tier:*` does not block a CI-green, reviewed PR) and the release authorization above, the label is recorded, not gating; Review (`review.md`) was the fresh-context gate. `Secret Scan` `success`.
5. P: `CI Gate` on the PR head → CI run `34745895030` (`pull_request`, head `359fa90fb`): Build, Lint, Typecheck, Architecture Audit, Integrity, Test (Node 22), Migration Dry-Run, Dependency Sync, AI Antipattern Ratchet, Visual Tolerance Change Check, four Container Security Scans all `success`; `CI Gate` `COMPLETED/SUCCESS` at `07:57:33Z` (15 min after open); `mergeStateStatus` `BLOCKED` → `CLEAN`; zero advisory failures.
6. P: `gh pr merge 5329 --squash` at `07:58:11Z` → `MERGED`, squash **`1301adfd081a48361239510b776219da02f68a9a`** at `07:58:13Z`, `mergedBy` `mattbutlerengineering` (the session's `gh` identity). `origin/main` = `1301adfd0`. The merge fired ADR check, Release, Post-Merge Reconciliation, CI (push), Secret Scan, CodeQL — and **no** `Deploy Static Sites`, `deploy-services`, or `pulumi-up` (the push filters excluded every changed path), so no `workflow_run` chain can cancel a later dispatch.
7. S0 (pre-dispatch) at `2026-09-13T07:58:29Z` → `pulumi-up.yml` / `deploy-services.yml` / `deploy-static.yml` in_progress: `[]` `[]` `[]`; queued: `0` `0` `0`; DO deployments unchanged (`c42c16cc… ACTIVE`). Clean.
8. S1: `gh workflow run pulumi-up.yml --ref main` at `~07:59Z` → **DENIED by the harness's auto-mode permission classifier** ("Blocked by classifier"). Not retried and not routed through another tool (the GitHub MCP / `gh api` paths would circumvent the denial's intent). Verified at `08:00:01Z` that no run was created: the newest `pulumi-up` run on `main` is still `34742533377` (`ec25f648b`, `workflow_run`, `failure`) — nothing on `1301adfd0`. **The dispatch is now the human's action** (§ Outcome).
   - 8b. Under a second `/idea-to-prod:autorun` re-invocation at `2026-09-13T19:39Z` the same command was attempted once more and **denied again**; verified no run created (`origin/main` had moved to `3db8810dc`, three metrics commits, bypass intact). Reported, stopped.
   - 8c. **The human executed the dispatch**: Matt ran `gh workflow run pulumi-up.yml --ref main` from the session prompt (`!` prefix) at `~2026-09-14T03:03:50Z`. No S0 was run in the seconds before it (the last S0 was the clean one at `19:38:44Z`); the post-hoc check at `03:05Z` found `deploy-services` / `deploy-static` in_progress `0` queued `0`, so nothing could have cancelled it. `origin/main` = **`b2a1d0c5f`** (12 commits after `1301adfd0`: metrics, a weekly retro, two reservations fixes — `infrastructure/pulumi/**` diff vs `1301adfd0` empty, bypass verified intact: 2/2/1 `exclude:` blocks and markers). Run **`34801283091`**, `event=workflow_dispatch`, `headSha=b2a1d0c5f`, created `03:03:55Z`, completed `03:06:47Z` (**2 min 52 s**, not ~30 min — see S6).
9. S2: `gh run view 34801283091 --json jobs …` → `Deploy Infrastructure` = **`failure`**. Steps: `Pin Pulumi CLI=success`, `Pulumi Cancel + Clear Pending Operations=success`, **`Pulumi Refresh (Sync state with cloud)=success`** — the first passing refresh on `main` since 2026-09-09 — **`Pulumi Up=failure`**. `Report Deploy Health` job = `success` (it wrote `failure`, S7).
10. S3: refresh log — orphan URN lines containing `error`/`forbidden`: **`0`**; total orphan mentions `2`, both in the action's `--exclude` argument echo. `Resources: ~ 1 updated, 15 unchanged, Duration: 2s` — the one `~` is `cloudflare:index:WorkersScript mattbutlerengineering-gen updated (1s)` (live drift read back, not a change). Two warnings, both expected: `refresh operation is using an older version of package 'cloudflare'` / `'auth0'` (the pending provider bumps). **V5 is now verified: `--exclude` reaches the refresh engine and the two Auth0 records are never read.**
11. S4: up log — the action ran `pulumi up --yes --skip-preview --exclude urn:…tenant:Tenant::mattbutlerengineering-tenant --exclude urn:…branding:Branding::mattbutlerengineering-branding`. Rows: `~ cloudflare:index:WorkersScript mattbutlerengineering-gen updated (10s) [diff: ]` (provider 6.19→6.20, no input change); `~ digitalocean:index:App mattbutlerengineering-api-app updated (36s) [diff: ~spec]` (the `/public` ingress rule from #4565) with the expected `warning: Resource does not support customTimeouts, ignoring: update=15m0s`; `~ cloudflare:index:WorkersScript mattbutlerengineering-edge-router **updating failed** [diff: ~bindings,content]` — `PUT "https://api.cloudflare.com/client/v4/accounts/59d5bec2d6e979d474efe54ec76c3658/workers/scripts/mattbutlerengineering-edge-router": 403 Forbidden`, error code **`10089`**: _"You need to enable Analytics Engine. Head to the Cloudflare Dashboard to enable: https://dash.cloudflare.com/59d5bec2d6e979d474efe54ec76c3658/workers/analytics-engine"_. `Resources: ~ 2 updated, 10 unchanged, 2 errored, Duration: 52s`. Neither orphan URN appears in any row; no `deleted`. **Failure class: none of S-fail-1/2/3.** The orphans are not involved. The failing row is #5315's `ANALYTICS` `analytics_engine` binding (`infrastructure/pulumi/index.ts:342`); Cloudflare refuses any Worker upload carrying such a binding until Analytics Engine has been enabled once on the account. Deterministic, so **no re-dispatch by this stage** — it would fail identically.
12. **Second dispatch, same gate.** Matt ran `gh workflow run pulumi-up.yml --ref main` from the prompt again at `2026-09-14T03:29:04Z` (run **`34802756625`**, `workflow_dispatch`, `headSha=b2a1d0c5f`, completed `03:31:35Z`, 2 min 31 s; `deploy-services`/`deploy-static` in_progress `0` queued `0` at `03:29Z`). `Pulumi Refresh (Sync state with cloud)=success` again, 0 orphan error lines; `Pulumi Up=failure` with the **identical** error — the only row touched was `~ cloudflare:index:WorkersScript mattbutlerengineering-edge-router [diff: ~bindings,content]` → `PUT …/workers/scripts/mattbutlerengineering-edge-router: 403`, code `10089` "You need to enable Analytics Engine" (DO App and gen Worker were already applied by run `34801283091`, so no `~` rows for them). This settles it: the failure is deterministic and the gate is the account-level Analytics Engine enable, not a transient. `Report Deploy Health` wrote `deploy/infrastructure = failure` again. **A third dispatch without step 1 of the human steps below will fail the same way.**

## Post-release checks

- S5 `/public` — **DO gate OPEN, edge gate SHUT.** `doctl apps spec get … | grep -c /public` → **`1`**; ingress order `/api/v1/users → users-api, /api/gen, /v1/sessions, /v1/orchestrate, /v1/webhooks → agent-api, /api → reservations-api, /public → reservations-api, / → users-api`. `curl -D- https://api.mattbutlerengineering.com/public/v1/venues/x` → `HTTP/2 404`, `content-type: application/json`, `x-ratelimit-limit: 100`, body `{"type":"about:blank","title":"Not Found","status":404,"detail":"No venue found with slug 'x'."}` — reservations-api's own `createProblemDetails` (users-api's catch-all answers `{"message":"Route GET:/… not found",…}`). `curl -D- https://mattbutlerengineering.com/public/v1/venues/x` → `HTTP/2 200`, `text/html` (the marketing SPA) — unchanged from before the apply, because #4565's edge-router `originRoutes` ride the WorkersScript that failed. Controls: `/api/v1/venues` → `401`, `/publicity` → `200`, `/` → `200`. `node scripts/check-api-surface-invariants.mjs` → 5/7 ok, 2 failed: `public-venue-lookup:reachable-through-edge` `status-mismatch` (200 vs 404 — real, the edge gate); `public-venue-lookup:reachable-at-origin` **`wrong-service` — a probe defect, not a routing defect**: it asserts the body contains `Venue not found` (`scripts/check-api-surface-invariants.mjs:124,138`) but the service emits `No venue found with slug '…'`; the discriminator was written while DO still refused `/public`, so it had never met a real 404 from the right service. Seeded, not fixed here.
- S6 DO deployment — `307e240d` **`ACTIVE`**, cause `app spec updated`, created `03:05:53Z`, updated `03:06:23Z` (30 s: an ingress-only spec change re-routes without rebuilding images — the "~30 min" expectation in this file and the public-ingress plan was for an image rebuild and did not apply); previous `dfe13995` → `SUPERSEDED`. `curl https://api.mattbutlerengineering.com/api/v1/users/health` → `{"status":"ok",…"database":{"status":"ok","latency":11}…}`.
- S7 `Report Deploy Health` — inputs `kv-key: deploy/infrastructure`, `deploy-result: failure` → `CONCLUSION="failure"` → KV **`deploy/infrastructure` = `failure`**. Accurate, and it stays red until the next successful run.

## Outcome

**Shipped with hiccups: the defect this run captured is fixed; the apply it unblocked landed by half.**

- **Fixed, measured:** `Pulumi Refresh` passes on `main` (Done-when 1's refresh clause). The deploy pipeline is no longer dead at the first step; the two orphans are excluded exactly as designed.
- **Landed, measured:** DO App `/public → reservations-api` (Done-when 2, `grep -c /public` = 1, live 404-JSON from the right service); gen Worker provider bump.
- **Not landed:** edge-router Worker — content, `ANALYTICS` binding, and the `/public` `originRoutes`. Blocked by Cloudflare `10089`, a **second human gate, unrelated to the orphans**, belonging to the `rialto-web-usage-instrumentation` run (#5315 added the binding; that run's architecture, verification and review never recorded that Analytics Engine must be enabled per account before a Worker can bind a dataset). Its own Operate should capture this.
- **Done-when 1's `Deploy Infrastructure = success` clause: NOT met** — the job fails on the edge-router row. Done-when 3 (guard green on `main`, CI Gate `34745895030` and main push CI `34746515919`) and 4 (§ Human checklist) met.
- **Rollback: none needed.** The failed `PUT` changed nothing on Cloudflare; the DO `/public` rule is the intended #4565 state; nothing in Pulumi state is half-written (the next run's `Cancel + Clear Pending Operations` step covers any leftover lock).
- **Rediscovered in passing:** `check-api-surface-invariants.mjs`'s body discriminator never matched the real service (S5).

**Human steps — Matt, in order:**

1. Enable Analytics Engine once for the account: https://dash.cloudflare.com/59d5bec2d6e979d474efe54ec76c3658/workers/analytics-engine (Free plan includes it — the rialto-web run's `architecture.md` cites 100,000 data points/day).
2. S0, then exactly one `gh workflow run pulumi-up.yml --ref main`. Expect refresh `16 unchanged`, up `~ 1 updated` (`mattbutlerengineering-edge-router [diff: ~bindings,content]`) and `15 unchanged`; then `curl -sS -D- https://mattbutlerengineering.com/public/v1/venues/x` → `404` JSON with `No venue found with slug`, and `deploy/infrastructure` → `success`.
3. Retire the bypass — § Human checklist above (scopes or `state delete`, then the removal PR in the stated order).

The run closes with `retro.md` on the measured outcome above; Operate treats the apply run as the first real feedback.
