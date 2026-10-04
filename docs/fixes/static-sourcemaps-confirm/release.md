---
stage: ship
run: maintenance:static-sourcemaps-confirm
date: 2026-10-04
status: IN-PROGRESS
assumptions:
  - "Maintenance-run scale: one squash-merge of PR #6019, then a `workflow_dispatch` of `deploy-static.yml` on main. The merge alone deploys nothing, because `deploy-static.yml`'s push filter covers neither `turbo.json` nor `scripts/**`."
  - "Release authorization and the fail-closed upload policy come from `autorun-brief.md` (Release authorization, Decision)."
---

# Release: static-site source maps reach Sentry (PR #6019)

## Pre-flight

- [x] **Verification green.** `verification.md`: 6 PASS, 0 FAIL, 3 PENDING-SHIP (criteria
      7-9 are this stage's post-release checks).
- [x] **Review clear.** `review.md`: ready to ship. 1 major fixed in `6014af295`, 2 minors
      deferred with reasons, no critical. Repo `reviewer` subagent: PASS 8/10.
- [x] **No secrets in the diff.** `git diff origin/main...HEAD` outside docs has no
      `sntrys_`, `sk_live`, `AKIA` or private-key hits. The workflow references secrets
      only as `${{ secrets.* }}`.
- [x] **Target config present.** `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` were
      already set on the deploy-static build steps and printed masked (non-empty) in run
      `37096660655`. The new "Require deploy secrets" steps check presence before the build.
      Token scope and slug correctness are **untested** until the first real upload below.
- [x] **Migrations / data.** None.
- [x] **Rollback plan concrete** (below).

## Rollback plan

```
# 1. Revert the squash-merge commit on main
git fetch origin && git switch -c revert/static-sourcemaps origin/main
git revert --no-edit <merge-sha>
git push -u origin revert/static-sourcemaps
gh pr create --base main --title "revert: static source-map upload (#6019)" --body "Rollback of #6019"
# merge once CI Gate is green, then
# 2. Redeploy the static sites from the reverted main
gh workflow run deploy-static.yml --ref main
```

**Failure mode under fail-closed.** A failed upload, a failed presence guard or a failed
`verify-sentry-sourcemaps` step stops the job before `wrangler deploy`. The previously
deployed version stays live. The failure mode is "no deploy", not "broken site". Rollback
is needed only to unblock future deploys, not to restore service.

## Release log

_In progress._

## Post-release checks

_In progress._

## Outcome

_In progress._
