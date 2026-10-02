---
stage: ship
run: maintenance:static-sentry-dsn-routing
date: 2026-10-02
pr: 5990
assumptions:
  - "Release authorization is autorun-brief.md (explicit YES from Matt, 2026-10-02) plus its Correction section. The order is binding: secret exists, then merge, then dispatch deploy-static, then deploy green, then dispatch heartbeat."
  - "PR #5966 (basic-ftp audit override) belongs to Matt. Ship never merges, approves, or touches it; it only polls its state."
---

# Release: marketing and rialto-web report to their own Sentry project

**Status: PRE-FLIGHT.** Written before any release step ran. The release log below is
filled in as each step happens.

## Pre-flight

- [x] **Verification green, except one external blocker.** `verification.md` has 6 of 6
      local criteria PASS. PR CI is red only on Build's `pnpm audit` (basic-ftp
      `GHSA-c475-qrg2-pj4r`), and `main` fails the same way. The fix is PR #5966, which
      Matt merges. #5990 does not merge until `CI Gate` = SUCCESS on its final head SHA.
- [x] **Review clean.** `review.md` has no critical or major findings. Its three minors
      are accepted or deferred. Minor 1 (create the secret before merging) is release
      step 1 below. Minor 3 (source-map upload) is checked in the deploy log.
- [x] **No secrets in the diff.** The DSN is passed as `${{ secrets.VITE_SENTRY_DSN_MBE }}`.
      The project slug `mattbutlerengineering` is a literal, and it is not a credential.
- [ ] **Target config present.** `VITE_SENTRY_DSN_MBE` does not exist yet. Step 1
      creates it.
- [x] **Migrations / data changes.** None.
- [x] **Rollback plan concrete.** See below.

## Rollback plan

The secret can stay. It is inert unless a build reads it.

```
# 1. Revert the squash-merge commit on main through a PR, so CI Gate gates it
git fetch origin main
git switch -c revert/static-sentry-dsn-routing origin/main
git revert --no-edit <merge-sha>
git push -u origin revert/static-sentry-dsn-routing
gh pr create --base main --title "revert: static-sentry-dsn-routing (#5990)" --body "Rollback per docs/fixes/static-sentry-dsn-routing/release.md"
gh pr merge <N> --squash --delete-branch   # once CI Gate is green

# 2. Redeploy. A .github/** change does not trigger deploy-static's push paths.
gh workflow run deploy-static.yml --ref main
# then watch the run: deploy-marketing, deploy-rialto-web and deploy-hospitality must all succeed
```

After the rollback, marketing and rialto-web go back to reporting into `hospitality`.
That is the known pre-release state, not an outage.

## Release steps (planned)

1. Commit and push this pre-flight `release.md`.
2. `gh secret set VITE_SENTRY_DSN_MBE --body "<mattbutlerengineering DSN>"`, then verify
   with `gh secret list`.
3. Wait for Matt to merge #5966 (poll for up to 45 minutes).
4. `gh pr update-branch 5990`, then `gh pr ready 5990`. Wait for `CI Gate` = SUCCESS on
   the new head SHA.
5. `gh pr merge 5990 --squash --delete-branch --match-head-commit <sha>`.
6. `gh workflow run deploy-static.yml --ref main`. Require the marketing and rialto-web
   deploy jobs to succeed at job level. Read the marketing build log for source-map
   upload lines.
7. Probe the live bundles. `/` and `/rialto/` should carry key `3eb05100…`.
   `/hospitality/` should carry `7faccca5…`.
8. Dispatch `sentry-heartbeat.yml` once. Expected: all 5 projects PASS, and #5941
   closes itself.

## Release log

_(pending)_

## Post-release checks

_(pending)_

## Outcome

_(pending)_
