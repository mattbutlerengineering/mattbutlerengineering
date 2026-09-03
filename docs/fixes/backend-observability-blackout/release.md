---
stage: ship
run: maintenance:backend-observability-blackout
date: 2026-09-03
---

# Release: backend Sentry reporting, Milestone 1

Shipped as four squash merges to `main` and one DigitalOcean App Platform
deployment. No package version, no tag: the deliverable is a running
configuration, and "production" here is the `mattbutlerengineering-api` app.

| PR    | Merge SHA   | What                                                      |
| ----- | ----------- | --------------------------------------------------------- |
| #4920 | `b5ccb5122` | redaction, per-service DSNs, fail-closed delivery         |
| #4927 | `84c7f3230` | remove `tracesSampleRate: 0` (the deploy-crash follow-up) |
| #4930 | `397e4aa3f` | `verification.md` + the prior brief's correction          |
| #4931 | `93d5c3c53` | `review.md` + both review fixes                           |

## Pre-flight

- [x] **Verification green (no unresolved failures)** — with one recorded
      exception, shipped deliberately. `verification.md` carries a single FAIL:
      T2, "a successful request leaves a durable record". That is the descoped
      Milestone 2/3 access-log leg, gated on a Grafana Cloud account that does
      not exist yet, and it routes to the follow-up run rather than back to
      Implement. Everything the run actually built verified green: 11 PASS, 1
      PARTIAL (`sentry-round-trip.mjs`'s `main()` — see the run's residuals).
      Shipping past it is a scope decision already taken on 2026-09-02, not a
      waiver of a broken check.
- [x] **No secrets in diff; target config present.**
      `scanForSecrets()` (the same function the PreToolUse hook uses) over all
      2844 added lines of `37a1c1662..93d5c3c53` returned
      `{"matched":false,"type":null}`. Gitleaks concluded `success` on
      `08bc5817e` (#4927 head), `397e4aa3f` (#4930) and `93d5c3c53` (#4931);
      #4920's head `d00cfec47` carries no separately attributable Gitleaks
      check-run, which the local scan above covers. Target config confirmed
      against the live spec: `SENTRY_DSN`, `type: SECRET`, on all three API
      services — and the deploy's own guard printed
      `All 3 required deploy secret(s) present` before patching.
- [x] **Migrations/data changes have a tested forward path** — not applicable,
      and checked rather than assumed:
      `git diff --name-only 37a1c1662..93d5c3c53 -- '*migrations*' '*.prisma'`
      is empty. This run changes configuration and error reporting only.
- [x] **Rollback plan concrete** — below.

No tracker intake to close: `defect.md` frontmatter carries no `intake:` field.

## Rollback plan

The blast radius is one env var and one `beforeSend`. Two independent levers,
smallest first.

**1. Undo the code (full revert of the run):**

```bash
# newest first — each is a squash commit on main
gh pr create --base main --head revert/observability-blackout --title "revert: backend observability blackout"
git checkout -b revert/observability-blackout origin/main
git revert --no-edit 93d5c3c53 397e4aa3f 84c7f3230 b5ccb5122
git push origin revert/observability-blackout
# merging that PR re-triggers deploy-services.yml, because packages/sentry and
# packages/service-bootstrap are now in its paths: filter (this run's own fix)
```

Caveat that must not be missed: reverting `b5ccb5122` also removes the
production boot check, so a service with no DSN would boot silently again —
which is the pre-run state, i.e. the revert is safe but restores the blackout.

**2. Undo just the deploy (faster, no code change):**

```bash
APP=5dbdcf45-4053-4518-a97b-f1e2b3122a61
doctl apps list-deployments $APP --format ID,Phase,Created --no-header | head -5
doctl apps create-deployment $APP --wait          # redeploy current spec, or:
# roll back to the last known-good image by re-running its deploy workflow:
gh workflow run deploy-services.yml --ref <known-good-sha>
```

**3. If the boot check itself is what is wedging a deploy** (a service
crash-looping on `Missing SENTRY_DSN in production`), the unblock is to supply
the secret, not to remove the check:

```bash
gh secret set SENTRY_DSN_USERS_API --body "<dsn>"   # --body is mandatory; without it gh silently sets ""
gh workflow run deploy-services.yml --ref main
```

## Release log

1. `gh pr merge 4930 --squash --delete-branch` → **MERGED** as `397e4aa3f`. The
   CLI printed `Please commit your changes or stash them before you switch
branches. Aborting` — that is only the local branch-delete declining on a
   working tree dirtied by other runs; the merge itself succeeded.
2. `gh pr merge 4931 --squash --delete-branch` → **MERGED** as `93d5c3c53`,
   same benign local message.
3. Merge of #4931 **auto-triggered** deploy run `33698493783` on a `push` event.
   This is the first push-triggered deploy of the entire run — #4927's merge
   triggered nothing at all and needed a manual dispatch, which is precisely the
   defect review Fix 2 addressed. The fix demonstrated itself on its own merge.
4. `Wait for CI` blocked on the push CI's `Build` job for ~14 minutes
   (00:12 → 00:26 UTC). Not a hiccup — that gate is the workflow behaving as
   designed — but it is the dominant cost of a deploy and worth recording.
5. DigitalOcean deployment `6b68de11-3266-4f64-9cc6-2257cae5379a`:
   `BUILDING` 00:26 → `DEPLOYING` 00:32 → **`ACTIVE` 00:34**.
6. Deploy workflow run `33698493783` → **`success`**, `event: push`,
   `headSha: 93d5c3c53…`.

No retries, no cancelled deployments, no rollback. (For contrast, the earlier
#4927 release in this same run took five attempts — two DO `InternalError`
cancellations and three `DeployContainerExitNonZero` rollbacks — all recorded in
`breakdown.md`'s Notes.)

## Post-release checks

- **The deployed commit is the shipped commit.** `DEPLOY_SHA` in the live app
  spec reads `93d5c3c53ab5868160bb258168620be38b5d1933`. Checked because a
  `success` workflow conclusion and a running old container look identical from
  outside.
- **Deployment reached ACTIVE, not merely "deploy said success".**
  `doctl apps get-deployment … 6b68de11…` → `ACTIVE`, cause `manual`, created
  `2026-09-03 00:26:22 UTC`. Phase checked directly, per the standing rule that
  a health 200 is not proof a deploy succeeded.
- **All three services answer.**

  ```
  /api/v1/users/health             200
  /api/v1/reservations/health      200
  /api/gen/health                  200
  ```

- **Error reporting still works on the new containers.** Provoked a marked 429
  against `users-api`; event `210f93b7e0374254b33bf4eb47fdcc39` landed in
  `USERS-API-6` carrying `requestId: mbe-ship-smoke-20260903T003456077Z` and
  `app_start_time: 2026-09-03T00:32:34.958Z` — a container generation that did
  not exist before this release. The issue now spans **four** events across
  **three** container generations (22:38, 23:18, 00:32), each one a deploy that
  destroyed the DigitalOcean log window.
- **The redaction fix is live and not breaking capture.** That smoke request
  carried `Cookie: session=SHIPSMOKECOOKIEVALUE`. The stored event contains no
  cookie value and no `request` section at all — consistent with the review
  finding that `normalizedRequest` is unpopulated while tracing is off, so this
  confirms capture survived the change rather than proving the new `cookies`
  rule fired. That rule is pinned by unit test; its live exercise belongs to the
  M2 run that turns OTel on.

## Outcome

**Shipped cleanly.** One deployment, no retries, no rollback, and the
release's own trigger was the review fix it carried.

Two things ship knowingly incomplete and are recorded rather than smoothed
over: T2 (successful requests still leave no durable record — the descoped
M2/M3 leg), and `scripts/sentry-round-trip.mjs`'s `main()`, which has still
never executed and must be wired into CI where `SENTRY_AUTH_TOKEN` exists.
Both carry forward to Operate.
