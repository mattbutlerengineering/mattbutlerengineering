---
stage: ship
run: maintenance:public-ingress-never-applied
date: 2026-09-09
assumptions:
  - "The one action this stage took — dispatching `pulumi-preview.yml --ref main` (run 34425499302) — was read as inside the brief's authorization: that workflow is the read-only carrier the brief authorized (`command: preview`, `refresh: false`, `contents: read`, no `up`), no success existed on the current `origin/main` HEAD (`6524f6aae`; the only prior `main` run, 32793453536, evaluated `a5bfb2acd` on 2026-08-25), and the item-4.4 `--status in_progress` check was run 1 s before the dispatch and was empty. It wrote nothing to production or to Pulumi state. No user was present to confirm the reading; the orchestrator's instruction named exactly this condition."
  - "The Ship skill's `never ship on a red verification` was read as governing the act of releasing, which this stage does not perform. `verification.md` is 18 PASS / 3 FAIL / 1 gap, and the pre-flight box `Verification green` is therefore recorded UNCHECKED rather than softened: FAIL A1 is the authorized prepare-and-stop end state (both gates shut), and FAILs 4.4 / 4.6 are Ship-routed paperwork that this artifact itself discharges. A prepared-not-released outcome does not ship past a red verification; the apply steps below are what would, and they are gated on the A1 unblock first."
  - 'The rollback plan is written CI-first — revert commit → PR → merge → `pulumi-up.yml` — per the standing deploy-via-CI-only policy, with the direct `doctl apps update --spec` path named as emergency-only. Nobody was present to choose a rollback shape. One consequence is stated rather than hidden: a plain `git revert 3b37e634c` restores `ignoreChanges: ["spec"]`, which makes Pulumi stop touching the DO spec, so the revert undoes the EDGE half and freezes whatever DO ingress is live at that moment.'
  - "On the fresh main-HEAD preview, the `mattbutlerengineering-gen` row (`~ update`) is a rule-3 finding by the architecture's own table and is enumerated as one — but attributed to #5167's `@pulumi/cloudflare` ^6.19.0 -> ^6.20.0 bump (landed 2026-09-09T18:43Z, after the SHA `preview.txt` evaluated), not to this run's change and not to carrier build-env divergence: the rendered row carries a provider transition and no property-level `~`/`+`/`-`, and the edge-router bundle sha256 is byte-identical to `preview.txt`'s. Whether the apply re-uploads gen assets under the new provider is an apply-time observation. Not arbitrated with a user."
  - "Level-2 `unchanged` verdicts for the 13 resources absent from the plan are inferred from absence in a NO-refresh preview — the same designed trade `architecture.md` § Decisions and `verification.md` § Not verified already record — and were not compared against live cloud state. Only the App is cross-checked live (`doctl apps spec get`)."
  - "Tracker: `defect.md` has no `intake:` (the brief: `Tracker mirror — None`), so this stage closes no issue. The four `API surface invariant breach` issues (#5168/#5171/#5173/#5181) are left OPEN deliberately: they are the post-apply gate reporting the unapplied state, and closing them before the apply lands would hide the only automated signal that the surface is still dead. Their closure is release step 6."
  - "Frontmatter `date` is the run day the orchestrator named (2026-09-09, Pacific). Every timestamp quoted in the body is UTC and most fall on 2026-09-10T01:2xZ, i.e. the evening of 2026-09-09 local."
---

# Release: `/public/v1/**` reachable through both gates — PREPARED, NOT RELEASED

**State in one line:** the fix is on `main` (#4565 `3b37e634c`, merged
2026-09-09T17:45:29Z — beyond the brief's single-merge authorization, recorded
once in `breakdown.md` and `review.md`) and has **never been applied**: every
`pulumi-up.yml` run on `main` since 17:05Z fails in `Pulumi Refresh` on two
orphaned Auth0 state records, and production still has both gates shut. This
artifact records the exact apply and rollback steps and executes none of them.

**How a reader tells "merged" from "shipped" without trusting this file:**

```
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public
#   0  = merged, NOT applied (the state this file describes)
#  >=1 = the DO half has been applied; then also check the edge half:
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://mattbutlerengineering.com/public/v1/venues/x
#   200 text/html          = edge gate still shut (marketing SPA)
#   404 application/json   = edge gate open; body must include "Venue not found"
```

A prior run's `release.md` said prepared-not-released for six days after it had
actually shipped. Run the two commands above before believing either word.

## Pre-flight

Every line below is a command this stage ran on 2026-09-10 (UTC), quoted.

- [ ] **Verification green (no unresolved failures)** — **NO.** `verification.md`
      (2026-09-09): _18 PASS, 3 FAIL, 1 Not verified, 1 gap._ Not softened; not a
      blocker for a _prepared_ release, for these reasons:
  - FAIL **A1** — the defect's Expected is unmet on both hosts. That is the
    authorized prepare-and-stop end state, now also blocked past authorization by
    the Auth0 state (below). Discharged only by release step 3.
  - FAIL **4.4** — the P3 serialization check was reconstructed, never performed.
    Discharged by this artifact: the live check is written into step 1, was
    rehearsed twice below, and is quoted with its UTC timestamps.
  - FAIL **4.6** — the reconciliation decision was recorded in the wrong
    artifact. Discharged: carried into § _Carried items_ below.
  - GAP — the shipped `post-deploy-check.yml` edge probe never reaches the edge
    (`--base` overrides per-probe `origin`). Deferred major in `review.md`;
    carried as release step 5 and as a precondition to trusting the gate.
- [x] **The fix is merged on `main` and is what `main` would apply.**
  ```
  $ git log origin/main --oneline -1 -- infrastructure/pulumi/index.ts
  3b37e634c fix(infra): make ingress managed again so the /public/v1 route actually applies (#4565)
  $ git merge-base --is-ancestor 3b37e634c origin/main && echo yes   → yes
  $ git merge-base --is-ancestor a5bfb2acd origin/main && echo yes   → yes   (#4545, the preview carrier)
  $ git show origin/main:infrastructure/pulumi/index.ts | grep -n 'ignoreChanges: \['
  291:    ignoreChanges: ["spec.features", "spec.jobs", "spec.services"],
  $ … | grep -n 'prefix: "/public"'   → 218   (between "/api" at 207 and "/" at 223)
  ```
  `origin/main` at pre-flight time: `6524f6aae8ca2f9894f1fe5b5047e83863fd37a7`.
- [x] **CI on the fix.** PR-level `CI Gate` on the previewed head `02c8ecd0`:
      run 34379561880 `success` (`pull_request`, 2026-09-09T16:53:40Z). `main`'s own
      push run on `3b37e634c` (34384875758) was **`cancelled`** — superseded 7 s
      later by the next push (`0a60bbb08`, #4794), whose run 34384887959 is
      `success`, as are the two following pushes (34390771614 `59721bb8f`,
      34391093809 `b62c0bd0b`). Recorded so the cancelled row is not misread.
- [x] **No secrets in the diff.** Added lines of both squash commits:
  ```
  $ git show 3b37e634c a5bfb2acd --format= | grep -E '^\+' \
      | grep -c -E 'sk_live|pk_live|rk_live|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN'
  0        (grep exit=1 — no hits)
  ```
  Also no literal `secret|token|password|passphrase = "<12+ chars>"` in the added
  source lines under `infrastructure/`, `scripts/`, `.github/` (grep exit=1).
  `3b37e634c`: 17 files, +1963/−32; `a5bfb2acd`: 2 files, +544.
- [x] **Target configuration exists — in CI secrets only, never locally.** From
      `pulumi-up.yml`'s `env:` on `origin/main` (names, no values):
      `PULUMI_CONFIG_PASSPHRASE`, `R2_ACCESS_KEY_ID` → `AWS_ACCESS_KEY_ID`,
      `R2_SECRET_ACCESS_KEY` → `AWS_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`,
      `MBE_CLOUDFLARE_API_TOKEN` → `CLOUDFLARE_API_TOKEN`, `AUTH0_GEN_CLIENT_ID`,
      `VITE_AUTH_AUTHORITY`. State backend (`cloud-url:`, lines 111/130):
      `s3://mattbutlerengineering-pulumi-state?endpoint=https://59d5bec2d6e979d474efe54ec76c3658.r2.cloudflarestorage.com&s3ForcePathStyle=true`;
      `stack-name: prod`, `work-dir: infrastructure/pulumi`, CLI pinned `3.253.0`.
      Local `pulumi whoami` against R2 fails by design (#4848 comment); nothing
      here runs locally.
- [x] **No migrations / data changes.**
  ```
  $ git show 3b37e634c a5bfb2acd --format= --name-only | grep -Ei 'migration|prisma|\.sql$'
  (no output; grep exit=1)
  ```
  The change is an app-spec ingress rule, an edge-worker bundle, tests, a probe
  script, and docs. No database is touched.
- [x] **Production: both gates shut — the defect reproduces exactly.** Probed
      2026-09-10T01:24:36Z:
  ```
  https://mattbutlerengineering.com/public/v1/venues/x      -> 200 text/html                       (edge gate shut: marketing SPA)
  https://api.mattbutlerengineering.com/public/v1/venues/x  -> 404 application/json; charset=utf-8  (DO gate shut)
     body: {"message":"Route GET:/public/v1/venues/x not found","error":"Not Found","statusCode":404}   ← Fastify route-miss from users-api
  https://mattbutlerengineering.com/api/v1/venues           -> 401 application/json  (control: /api does proxy)
  https://api.mattbutlerengineering.com/api/v1/venues       -> 401 application/json  (control)
  ```
  LAN-DNS cross-check (the resolver here has invented outages before):
  `dig +short @1.1.1.1 mattbutlerengineering.com` → `104.21.25.32`, `172.67.222.73`;
  `api.` → CNAME `mattbutlerengineering-api-x6iga.ondigitalocean.app.` →
  `172.66.0.96`, `162.159.140.98`. The local resolver returned the same set.
- [x] **Live DO app spec has no `/public` rule.**
  ```
  $ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public
  0
  $ doctl apps spec get … --format json | jq -r '.ingress.rules[]|"\(.match.path.prefix) -> \(.component.name)"'
  /api/v1/users -> users-api
  /api/gen -> agent-api
  /v1/sessions -> agent-api
  /v1/orchestrate -> agent-api
  /v1/webhooks -> agent-api
  /api -> reservations-api
  / -> users-api
  ```
  Ignored keys, live: `{"features":["buildpack-stack=ubuntu-22"],"services":3,"jobs":3}`.
- [x] **`pulumi-up.yml` is blocked on `main` — the reason merged ≠ applied.**

  ```
  $ gh run list --workflow pulumi-up.yml --branch main --limit 5 --json databaseId,conclusion,createdAt,headSha
  34391301490 failure   2026-09-09T18:48:50Z b62c0bd0b
  34391022653 failure   2026-09-09T18:46:03Z 59721bb8f
  34390771643 failure   2026-09-09T18:43:35Z 59721bb8f
  34385123277 failure   2026-09-09T17:48:01Z 0a60bbb08
  34384887917 cancelled 2026-09-09T17:45:42Z 0a60bbb08
  $ gh run view 34391301490 --json jobs --jq '.jobs[]|{name,conclusion,steps:[.steps[]|select(.conclusion=="failure")|.name]}'
  {"conclusion":"failure","name":"Deploy Infrastructure","steps":["Pulumi Refresh (Sync state with cloud)"]}   (Pulumi Up = skipped)
  ```

  The failing lines (run 34391301490, `--log-failed`, `provider=auth0@3.51.0`):

  ```
  auth0:index:Tenant   mattbutlerengineering-tenant   refreshing failed: 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings
  auth0:index:Branding mattbutlerengineering-branding refreshing failed: 403 Forbidden: Insufficient scope, expected any of: read:branding
  pulumi:pulumi:Stack mbe-infrastructure-prod running error: update failed
  ```

  Orphan URNs (created by #4924 `3b8c3d7c7`, source removed by revert #5165
  `6c0a54c51`, state records left behind):
  - `urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant`
  - `urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding`

  The last run to reach `Pulumi Up` is 34319050701 (`82af9ac7e`, 2026-09-09T06:26Z,
  pre-#4565): `Resources: 16 unchanged` for both refresh and up — the rule-6
  baseline still holds. None of the eight failed/cancelled runs applied anything.

- [x] **Item 4.4 rehearsal — the live serialization check, twice.**
  ```
  2026-09-10T01:24:46Z  gh run list --status in_progress --workflow pulumi-up.yml        → (empty)
                        gh run list --status in_progress --workflow deploy-services.yml  → (empty)
                        --status queued, both workflows                                   → 0, 0
  2026-09-10T01:26:42Z  (immediately before the preview dispatch) in_progress: pulumi-up 0, deploy-services 0
  ```
- [x] **A fresh, read-only `pulumi preview` on the exact `main` HEAD** — § below.
      Level 1: plan produced. Level 2: App and edge-router exactly as `preview.txt`;
      three additional rows enumerated (gen provider transition, two Auth0 deletes).
- [x] **Rollback plan concrete** — § below.

## Fresh preview on `main` HEAD (the one action this stage took)

`preview.txt` evaluated `02c8ecd0`, not `main`. Per the orchestrator's condition
(no success on the current `origin/main` HEAD; `pulumi-preview.yml` does not
refresh, so the Auth0 orphans cannot 403 it), it was dispatched once:

```
2026-09-10T01:26:43Z  gh workflow run pulumi-preview.yml --ref main        → dispatch accepted
run            34425499302   https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/34425499302
evaluated sha  6524f6aae8ca2f9894f1fe5b5047e83863fd37a7   (== origin/main HEAD at dispatch)
window         2026-09-10T01:26:45Z .. 01:28:16Z, conclusion success; job "Preview Infrastructure (no apply)" — every step success
artifact       pulumi-preview (id 10132510791, 2156 bytes, expires 2026-10-10); local sha256 9bac54577fbe03060a65378fe17d0f785091f6c8693a5caa8393a257379cae05
CLI            3.253.0 (pinned); refresh: no
bundle         sha256(infrastructure/worker/dist/edge-router.js) = 830d5def8da802b9dbfa89dcd31bee10bdeab595bd7a5efab4273b789c1be709   ← byte-identical to preview.txt
               originRoutes occurrences in bundle = 4
summary        ~ 3 to update, - 2 to delete, 5 changes. 13 unchanged
warning        Resource does not support customTimeouts, ignoring: update=15m0s
```

**Level 1 — plan produced.** The engine accepted
`ignoreChanges: ["spec.features","spec.jobs","spec.services"]` on the same
pinned CLI and rendered a plan. P1 stays answered _yes_.

**Level 2 — one verdict per resource (18 in state now: the 16 of the baseline +
the 2 orphans).**

| #   | Resource                                                                 | Plan        | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pulumi:pulumi:Stack mbe-infrastructure-prod`                            | (same)      | unchanged, root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | `digitalocean:index:App mattbutlerengineering-api-app`                   | `~ update`  | **PASS.** Diff confined to `spec.ingress.rules`, rendered identically to `preview.txt`: `[6]` `users-api → reservations-api`, `"/" → "/public"`; `+ [7]` `users-api`, `"/"`, `preservePathPrefix: true`. Read as a list: one `/public → reservations-api` rule inserted between `/api` and the `/` catch-all. No diff on `spec.services`/`jobs`/`features`/`name`/`region`/`domainNames`. Not `unchanged`.                                                                                                                                                                                                  |
| 3   | `cloudflare:index:WorkersScript mattbutlerengineering-edge-router`       | `~ update`  | **PASS.** `content` diff identical to `preview.txt` (the `/public/` rate-limit entry, `originRoutes: ["/api","/public"]`, `isOriginRoute()`, the branch switch); fingerprint positive (sha `830d5def…`, `originRoutes` ×4). **New vs. `preview.txt`:** the row also carries `[provider: cloudflare default_6_19_0 => default_6_20_0::[unknown]]` — #5167's provider bump, see row 4. No `bindings`/`scriptName`/`mainModule`/`compatibilityDate` diff.                                                                                                                                                      |
| 4   | `cloudflare:index:WorkersScript mattbutlerengineering-gen`               | `~ update`  | **Rule-3 FINDING, enumerated.** The row shows only `[provider: default_6_19_0 => default_6_20_0::[unknown]]` and prints `accountId`/`assets`/`compatibilityDate`/`scriptName` with **no** `~`/`+`/`-` marker. Cause: #5167 (`59721bb8f`, 2026-09-09T18:43Z) bumped `infrastructure/pulumi/package.json` `@pulumi/cloudflare` `^6.19.0 → ^6.20.0` (lockfile `@pulumi/cloudflare@6.20.0`), after `02c8ecd0`. Not this run's change; not carrier divergence (edge bundle byte-identical). The apply will touch gen under the new provider — expect it, and stop if the apply log shows an `assets` diff on it. |
| 5   | `auth0:index:Client mattbutlerengineering-hospitality`                   | not in plan | unchanged — neutral (rule 4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | `auth0:index:ClientGrant mattbutlerengineering-hospitality-api-grant`    | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | `auth0:index:ResourceServer mattbutlerengineering-api`                   | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | `auth0:index:User e2e-test-user`                                         | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | `cloudflare:index:DnsRecord mattbutlerengineering-api-dns`               | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | `cloudflare:index:DnsRecord mattbutlerengineering-dns`                   | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | `cloudflare:index:DnsRecord mattbutlerengineering-www-dns`               | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | `cloudflare:index:WorkersKvNamespace mattbutlerengineering-cache`        | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13  | `cloudflare:index:WorkersKvNamespace mattbutlerengineering-health-state` | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 14  | `cloudflare:index:WorkersKvNamespace mattbutlerengineering-sessions`     | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | `cloudflare:index:WorkersRoute edge-router-route`                        | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 16  | `cloudflare:index:WorkersRoute edge-router-www-route`                    | not in plan | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17  | `auth0:index:Branding mattbutlerengineering-branding`                    | `- delete`  | **FINDING outside the two expected rows, enumerated.** The orphan (`id=terraform-20260909170702645900000002`, `provider=auth0 default_3_51_0`). Source gone (#5165), record present → the plan deletes it. Under unblock option 1 (grant scopes) the apply executes this delete — Branding delete resets universal-login branding to defaults, which per #4848's title is what production shows today. Under option 2 (`pulumi state delete`) the row disappears before any apply.                                                                                                                          |
| 18  | `auth0:index:Tenant mattbutlerengineering-tenant`                        | `- delete`  | **FINDING, same cause.** `id=terraform-20260909170700212700000001`. Tenant delete is a provider no-op (#4848).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Why rows 9–16 show no provider transition while rows 3–4 do** is not
established here; the plan is quoted as rendered. It is an apply-time
observation for step 3's log, not a blocker.

**The seven rules of item 4.5, re-applied:** (1) App is `~ update` — not
triggered. (2) edge-router is `~ update`, fingerprint positive — not triggered.
(3) gen **did** diff — enumerated in row 4 with its cause. (4) auth0 Client
quiet — neutral. (5) all 18 named; enumeration for the apply = rows 2, 3, 4, 17, 18. (6) baseline re-checked: most recent successful up is still 34319050701,
`16 unchanged` ×2; no up has reached `Pulumi Up` since. (7) nothing applied —
production re-probed at 01:24:36Z (above) before the dispatch; the workflow has
no `up`/`refresh`; `Pulumi Up` remains skipped on every `pulumi-up` run.

**Net difference from `preview.txt`:** the apply on today's `main` is **5
changes, not 2** — the two this run intends (rows 2, 3), one from #5167's
provider bump (row 4, plus the provider line on row 3), and two deletes that
exist only while the Auth0 orphans remain in state (rows 17, 18).

## Rollback plan

The apply mechanism is `pulumi-up.yml` on `main`; the rollback is the same
mechanism run over a revert. Standing policy: deploy via CI only — the `doctl`
path is emergency-only and is against it.

**Read first — what a plain revert does and does not undo.** `3b37e634c` also
restores `ignoreChanges: ["spec"]`. Once that is on `main`, Pulumi stops
touching the DO spec entirely, so the revert **reverts the edge half** (apex
`/public/**` goes back to the marketing SPA; the `/public/` edge rate-limit entry
goes away) and **freezes whatever DO ingress is live** at that moment. If the
`/public` DO rule had landed, it stays — harmless: `api.` `/public/v1/**`
keeps reaching reservations-api, which is the intended behaviour, not a
regression. Removing it needs R2.

```
# R1 — source rollback, CI-driven (single-parent squash commit: plain `git revert`, no -m)
git fetch origin && git switch -c revert/public-ingress-4565 origin/main
git revert 3b37e634c
#   expect conflicts only in docs/backlog.md and metrics/ai-antipattern-baselines.json (both moved since); keep main's side of every non-run line
pnpm --dir infrastructure/pulumi test && pnpm --dir infrastructure/worker test && pnpm --dir scripts test
#   the de-vacuumed ingress-coverage.test.ts reverts WITH the fix, so the pre-#4565 suites are what must be green here
git push -u origin revert/public-ingress-4565
gh pr create --base main --title "revert: #4565 make ingress managed again (/public ingress + edge originRoutes)" --body "Rolls back 3b37e634c. Restores ignoreChanges: [\"spec\"] — DO spec becomes unmanaged again; live ingress is frozen as-is."
# merge when CI Gate is green. The push to main matches pulumi-up.yml's paths filter (infrastructure/pulumi/**, infrastructure/worker/**) → Pulumi Deploy runs.
gh run list --workflow pulumi-up.yml --branch main --limit 1 --json databaseId,headSha,conclusion
gh run view <id> --json jobs --jq '.jobs[]|select(.name=="Deploy Infrastructure")|{conclusion,steps:[.steps[]|select(.name|test("Pulumi (Refresh|Up)"))|"\(.name)=\(.conclusion)"]}'
#   job-level conclusion must be "success" — the workflow-level conclusion can be "success" on a skipped job (gotchas § CI)
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://mattbutlerengineering.com/public/v1/venues/x   # → 200 text/html again
```

```
# R2 — DO half, EMERGENCY ONLY (bypasses Pulumi; Pulumi will not re-add the rule while ignoreChanges: ["spec"] is in force)
SCR=<scratch dir>
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml > "$SCR/app-spec.yaml"
#   delete exactly the rule block  { component: {name: reservations-api, preserve_path_prefix: true}, match: {path: {prefix: /public}} }  — leave "/" → users-api last
doctl apps update 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --spec "$SCR/app-spec.yaml" --wait
#   a spec update is a full DO deployment, ~30 min (index.ts comment); do not overlap deploy-services.yml (dual-deploy race)
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public    # → 0
```

The Pulumi-managed alternative to R2 — keep the narrowed `ignoreChanges` and
delete only the `/public` rule at `index.ts:216-221` — is self-inconsistent:
`ingress-coverage.test.ts` ("every path a service serves is covered by a
non-catch-all ingress rule") goes red, which is the test doing its job. R1 is
the consistent shape.

**If an apply half-lands.** Pulumi applies the two resources in parallel; the
`WorkersScript` update takes seconds, the App update is a DO deployment on the
provider's own timeout (the `15m` `customTimeouts` is ignored — preview warning).

- _Edge landed, App did not (the likely order)._ Apex `/public/v1/**` now proxies
  to DO, falls through to users-api, and answers Fastify's 404 JSON instead of
  200 HTML; `/public` exact path 404s instead of serving the SPA. No caller
  regresses (`useVenuePolicy` swallows both). **Do not roll back — finish:**
  `doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | head -3`
  until no deployment is in progress, then `gh workflow run pulumi-up.yml --ref main`
  (idempotent; the workflow's `Pulumi Cancel + Clear Pending Operations` step
  clears a stuck checkpoint first).
- _App landed, edge did not._ `api.` `/public/v1/**` is live; browser callers see
  nothing new. Same action: re-dispatch `pulumi-up.yml`.
- _The apply must be abandoned._ R1, then R2 only if the DO rule must also go.

## Release steps — PREPARED, NOT EXECUTED

Numbered, each with the exact command and the check that proves it. Nothing
below was run by this stage except the rehearsals noted in the release log.

**0. Human (Matt): unblock the Auth0 state — #4848, 2026-09-09T17:48Z comment.**
`pulumi-up.yml` runs `refresh` unconditionally before `up`, so this is the gate
for _every_ infra deploy, not just this one. Two options; each comment ends with
`gh workflow run pulumi-up.yml --ref main` — **stop before that line**; it is
step 3.

- _Option 2 (preferred for sequencing — no Auth0 change, nothing applies as a
  side effect):_ with the real R2 keys (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`)
  and `PULUMI_CONFIG_PASSPHRASE`:
  ```
  cd infrastructure/pulumi
  pulumi login "s3://mattbutlerengineering-pulumi-state?endpoint=https://59d5bec2d6e979d474efe54ec76c3658.r2.cloudflarestorage.com&s3ForcePathStyle=true"
  pulumi stack export --stack organization/mbe-infrastructure/prod > state-backup-$(date +%Y%m%d).json   # keep this
  pulumi state delete 'urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant' --stack organization/mbe-infrastructure/prod --yes
  pulumi state delete 'urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding' --stack organization/mbe-infrastructure/prod --yes
  ```
  Check: `pulumi stack export --stack organization/mbe-infrastructure/prod | jq '[.deployment.resources[].urn|select(test("auth0:index/(tenant|branding)"))]|length'` → `0`.
  (`pulumi-up.yml` itself uses that `organization/mbe-infrastructure/prod` form at
  lines 84/87/97; `stack-name: prod` for the action steps.)
- _Option 1 (grant scopes; keeps the door open to re-land #4924):_ Auth0
  Dashboard → Applications → the Pulumi M2M app → APIs → Auth0 Management API →
  add `read:tenant_settings`, `update:tenant_settings`, `read:branding`,
  `update:branding`. Check:
  `auth0 api get "client-grants?audience=https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/api/v2/"` shows all four on that grant. Consequence: step 3's `up` executes rows 17–18 (`- delete` ×2).

There is no read-only proof that `refresh` works again (a refresh writes
state), so the first `Pulumi Refresh (Sync state with cloud)` step to succeed is
step 3's — which is why step 3 must not run before steps 1–2.

**1. Live serialization check (item 4.4, P3) — immediately before step 2 and again immediately before step 3.**

```
date -u +%Y-%m-%dT%H:%M:%SZ
gh run list --status in_progress --workflow pulumi-up.yml        --json databaseId,createdAt,headBranch
gh run list --status in_progress --workflow deploy-services.yml  --json databaseId,createdAt,headBranch
gh run list --status queued      --workflow pulumi-up.yml        --json databaseId --jq length
gh run list --status queued      --workflow deploy-services.yml  --json databaseId --jq length
```

Proof: all four print nothing / `0`; record the timestamp in this file's release
log when executed. Also: `pulumi-up.yml` has `concurrency: pulumi-deploy-<ref>`
with `cancel-in-progress: true` — a push to `main` touching
`infrastructure/**`, `apps/gen/**`, `packages/rialto/**`, `packages/rialto-catalog/**`
or `packages/auth/**` **cancels an in-flight apply** (that is what cancelled
34384887917). Hold Dependabot/auto-merge on those paths for the apply window,
or accept a retry.

**2. Fresh preview on the `main` HEAD that will be applied, read at Levels 1–2.**

```
git fetch origin && git rev-parse origin/main
gh workflow run pulumi-preview.yml --ref main
gh run list --workflow pulumi-preview.yml --branch main --limit 1 --json databaseId,headSha   # headSha must equal the rev-parse above
gh run watch <id> --exit-status
gh run download <id> -n pulumi-preview -D <scratch>/preview-<id> && perl -pe 's/\e\[[0-9;]*[A-Za-z]//g' <scratch>/preview-<id>/preview.txt
```

Proof, against the table above: App `~ update` confined to `spec.ingress.rules`
(**`App: unchanged` = STOP**, the defect's signature); edge-router `~ update` on
`content` with `originRoutes` ≥ 1 in the fingerprint; gen at most the provider
transition; after option 2, **no** `- delete` rows (after option 1, exactly the
two); every other resource absent. Any other row: stop, enumerate here, do not
apply. If `origin/main` has moved past `6524f6aae`, this run's reading is stale
and step 2 is mandatory, not optional.

**3. Apply.**

```
# step 1 again, then:
gh workflow run pulumi-up.yml --ref main            # or let the next qualifying push to main trigger it
gh run list --workflow pulumi-up.yml --branch main --limit 1 --json databaseId,headSha,status
gh run watch <id> --exit-status
gh run view <id> --json jobs --jq '.jobs[]|select(.name=="Deploy Infrastructure")|{conclusion,steps:[.steps[]|"\(.name)=\(.conclusion)"]}'
gh run view <id> --log | perl -pe 's/\e\[[0-9;]*[A-Za-z]//g' | grep -E 'digitalocean:index:App|WorkersScript|Resources:|to update|to delete|unchanged|customTimeouts'
```

Proof: **job** `Deploy Infrastructure` = `success` (never the workflow-level
conclusion — a skipped job reports workflow `success`); `Pulumi Refresh` and
`Pulumi Up` steps both `success`; the `up` summary shows the App
**`updated`** — `~ 3 updated` (option 2) or `~ 3 updated, - 2 deleted` (option 1)
— and never `App … unchanged`. Expect
`warning: Resource does not support customTimeouts, ignoring: update=15m0s` and
an App update that runs as a full DO deployment (~30 min) on the provider's own
timeout. If the run is cancelled by a concurrent push, re-dispatch after step 1.

**4. Post-apply checks — the surface is live through both gates.**

```
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public                      # → 1
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format json | jq -r '.ingress.rules[]|"\(.match.path.prefix) -> \(.component.name)"'
#   → … /api -> reservations-api, /public -> reservations-api, / -> users-api   (in that order; "/" last)
curl -sS -D- https://mattbutlerengineering.com/public/v1/venues/x       # → HTTP 404, content-type application/json, x-ratelimit-limit: 100, body includes "Venue not found"
curl -sS -D- https://api.mattbutlerengineering.com/public/v1/venues/x   # → same
curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/api/v1/venues   # → 401 (control unchanged)
curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/publicity      # → 200 (exact-or-slash: still the SPA)
node scripts/check-api-surface-invariants.mjs      # NO --base: both reachability probes must pass, each on its own origin
```

The discriminator is the body: `Venue not found` is reservations-api's own
handler; the catch-all's miss is `Route GET:… not found`. A 404 with the wrong
body is the DO gate still shut. Known cosmetic residue (review minor): apex
`/public` traffic is recorded in edge analytics under the label `"api"`.

**5. Precondition to trusting the CI gate — land the `--base` fix.**
`post-deploy-check.yml:206-207` runs
`check-api-surface-invariants.mjs --base https://api.mattbutlerengineering.com`,
and `resolveBase()` (`:229-231`) is `baseOverride ?? probe.origin ?? DEFAULT_BASE`,
so the `reachable-through-edge` probe never leaves `api.`. Until a PR drops
`--base` from the workflow (or makes an explicit per-probe `origin` win, changing
the pinning unit test `resolveBase > lets an explicit --base override even a
probe that pins its own origin` deliberately), a green `API Surface Invariants`
run after step 3 has verified the DO half twice and the edge half never. Step
4's local no-`--base` run is the substitute until it lands.

**6. Breach issues #5168, #5171, #5173, #5181 (all OPEN, one cause).** After
step 4 passes, close each:
`gh issue close <n> --comment "Cleared by pulumi-up run <id> (#4565 applied); both reachability probes pass — see docs/fixes/public-ingress-never-applied/release.md"`.
New ones stop being filed once the probes pass on the deployed hosts (with step 5
landed, genuinely; without it, on `api.` only).

**7. Expect, do not chase:** the `customTimeouts` warning on the App (its
`update: 15m` is ignored by the DigitalOcean provider). Only a _failed_ App
update is a finding.

## Carried items (from `breakdown.md` § Reconciliation, per Verify → Ship routing)

**Item 4.4 — serialization against in-flight deploys (P3).** The pre-dispatch
`--status in_progress` query was never run before preview 34379571653; what
`preview.txt` records is a reconstruction from run history (no `pulumi-up` or
`deploy-services` run overlapped 16:53:46Z–16:55:28Z). The property held; the
instrument did not exist. This stage ran the live check twice (01:24:46Z,
01:26:42Z — both empty) and has written it into steps 1 and 3 as a mandatory,
timestamped gate before any dispatch or apply.

**Item 4.6 — the deferred-reconciliation seed vs. issue #3277.** Resolved as
_issue annotated, seed retained_: #3277 (`Narrow Pulumi ignoreChanges to
drift-tolerant paths`, still OPEN, `ready-for-human`, unrelabelled) received the
one authorized comment recording what this run narrowed to
(`["spec.features","spec.jobs","spec.services"]`), what it deliberately left
ignored (env vars, instance sizes, component config), and that the backlog seed
tracks the full reconciliation. The seed is on `main` at `docs/backlog.md:54`
(it reached `main` inside #4565, not via the fix branch as the item assumed, and
its text does not cite #3277). This is not literally either branch of the item's
either/or — both the seed and the annotation now exist — and it is recorded
here, in the artifact the item named. A second seed from this run sits at
`docs/backlog.md:56` (pin the `Pin Pulumi CLI` step with `set -o pipefail`).

**The `customTimeouts` warning** — recorded in § Fresh preview and in step 7.

## Release log

What this stage actually did, in order (all UTC, 2026-09-10). No deploy, no
`pulumi up`, no `pulumi-up.yml` dispatch, no publish, no tag, no merge, no PR.

1. `git fetch origin` → HEAD `3fe3d62b4` on `docs/public-ingress-never-applied-close`; `origin/main` `6524f6aae`; working tree clean.
2. Read the run directory (`defect`, `architecture`, `breakdown`, `preview.txt`, `verification`, `review`, `autorun-brief`), the Ship skill, template and protocol.
3. Merged-fix checks (`git log`, `merge-base --is-ancestor`, `index.ts:291/218`) → as quoted.
4. `gh run list --workflow pulumi-up.yml --branch main` + `--log-failed` on 34391301490 → the 403 lines.
5. 01:24:36Z production probes ×4 + `dig @1.1.1.1` cross-check → both gates shut.
6. `doctl apps spec get` → `/public` count 0; rules listed via JSON. _Hiccup:_ my first YAML `grep -A2 | paste` listing was mis-aligned by one line; re-read with `jq` before quoting.
7. 01:24:46Z item-4.4 rehearsal (in_progress + queued, both workflows) → empty.
8. Secret and migration scans. _Hiccup:_ the first secret grep reported `exit=0` because the pipe ended in `head`; re-run with `grep -c` and `pipestatus` → `0`, exit 1.
9. `pulumi-preview.yml` history → no run on `6524f6aae`; `refresh: false` confirmed on the merged file.
10. 01:26:42Z item-4.4 check again → empty. 01:26:43Z `gh workflow run pulumi-preview.yml --ref main` → run 34425499302 on `6524f6aae`; `gh run watch` → success at 01:28:16Z; artifact 10132510791 downloaded to the session scratchpad and read; fingerprint pulled from the step log. _Finding:_ 5 changes, not 2 — enumerated above.
11. Traced the extra rows: `git show 02c8ecd0:infrastructure/pulumi/package.json` vs `origin/main` → `@pulumi/cloudflare ^6.19.0 → ^6.20.0`, `@pulumi/auth0 ^3.51.0 → ^3.52.0`, `@pulumi/pulumi ^3.259.0 → ^3.261.0` via #5167 `59721bb8f`.
12. CI on the merge: PR-level 34379561880 success; `main` push 34384875758 on `3b37e634c` **cancelled** (superseded), successor 34384887959 success.
13. #4848 comments (the two unblock options), #3277 state, breach issues' state, `doctl apps update --help` (flag names for R2) — read, quoted.
14. Wrote this file; `pnpm exec prettier --check docs/fixes/public-ingress-never-applied/`; committed only this file; pushed; verified `git ls-remote` == HEAD.

## Post-release checks

**Not executed — prepared.** They are release step 4 verbatim; run them after
step 3's `Deploy Infrastructure` job is `success`:

```
doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public                      # expect 1
curl -sS -D- https://mattbutlerengineering.com/public/v1/venues/x     | grep -E 'HTTP/|content-type|x-ratelimit-limit|Venue not found'
curl -sS -D- https://api.mattbutlerengineering.com/public/v1/venues/x | grep -E 'HTTP/|content-type|x-ratelimit-limit|Venue not found'
node scripts/check-api-surface-invariants.mjs                                                                    # no --base; expect exit 0, both reachability probes pass
gh run list --workflow post-deploy-check.yml --branch main --limit 1 --json databaseId,conclusion                # green means the DO half only until step 5 lands
```

Then step 6 (close the four breach issues with the apply run id), and Operate
re-probes the booking widget end to end from a browser — the only check that
sees the surface the way a guest does.

## Outcome

**PREPARED, NOT RELEASED.**

- _Authorization:_ the brief's release authorization is prepare-and-stop —
  `release.md` plus a real `pulumi preview`, no merge, no deploy, no apply. Both
  exist now; nothing was applied.
- _Blocked regardless of authorization:_ `pulumi-up.yml` cannot reach `Pulumi Up`
  on `main` until a human resolves the two orphaned Auth0 state records (step 0,
  #4848). Every one of the eight runs since 17:05Z on 2026-09-09 failed or was
  cancelled in `Pulumi Refresh`.
- _Merged is not shipped:_ #4565 (`3b37e634c`) is on `main` and was **never
  applied** — production has zero `/public` DO ingress rules and the apex still
  serves the marketing SPA for `/public/v1/**` (probed 2026-09-10T01:24:36Z).
  A future reader must not read "merged" as "shipped"; the two commands at the
  top of this file are how to tell.
- _What the apply will do when it runs on today's `main`:_ 5 changes — the
  `/public` ingress rule, the edge-router bundle (with a cloudflare-provider
  transition), the gen worker's provider transition, and two Auth0 state deletes
  that vanish if option 2 is chosen first.
- _Tracker:_ no `intake:` in `defect.md`; nothing to close. The four breach
  issues stay open on purpose until step 6.

Next stage: Operate — after step 3 has actually run, not before.
