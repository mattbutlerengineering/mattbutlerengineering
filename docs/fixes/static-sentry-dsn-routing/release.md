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

**Status: HALTED, waiting on #5966.** Steps 1 and 2 are done. Nothing is merged or
deployed. The defect is still live. The remaining steps are listed below, in order.

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
- [x] **Target config present.** `VITE_SENTRY_DSN_MBE` was created on
      2026-10-02T23:42:42Z (release log step 2).
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

1. Committed and pushed the pre-flight `release.md` as `71424f89d`. Then
   `git ls-remote origin fix/static-sentry-dsn-routing` returned
   `71424f89df7198ce2168121f42c11271c76e26e8`. **Done.**
2. Ran `gh secret set VITE_SENTRY_DSN_MBE --body "https://3eb05100…@o4510650299842560.ingest.us.sentry.io/4511154257526784"`.
   It exited 0. `gh secret list` then showed `VITE_SENTRY_DSN_MBE 2026-10-02T23:42:42Z`. **Done.**
3. Polled `gh pr view 5966 --json state` every 2 minutes from 23:43Z to 00:29:01Z
   (45 minutes). It stayed `OPEN` the whole time. **Not merged, so Ship halted here as
   authorized.**
   - At 00:29Z, #5966 is not a draft. Its `mergeStateStatus` is `CLEAN`, and its
     `CI Gate` is green (run `36907600636`). It is waiting only on Matt's merge.
   - Ship did not touch #5966.
   - #5990 is still a draft with a red `CI Gate`, and it was not merged.

## Remaining steps (exact, in order)

1. Matt merges #5966.
2. `gh pr update-branch 5990`, then `gh pr ready 5990`.
3. Wait for a check named `CI Gate` to conclude `SUCCESS` on the **new** head SHA
   (`gh pr view 5990 --json headRefOid`). A `fail=0` read is not enough.
4. `gh pr merge 5990 --squash --delete-branch --match-head-commit <new-head-sha> --subject "fix(deploy-static): route marketing and rialto-web Sentry to their own project (#5990)"`
5. `gh workflow run deploy-static.yml --ref main`. Find the run by `--branch main` and
   its headSha. Require the `deploy-marketing` and `deploy-rialto-web` **jobs** to
   succeed. Read the marketing build step log for sentryVitePlugin upload or error lines
   (review Minor 3).
6. Curl `/`, `/rialto/` and `/hospitality/` → their entry JS chunk → grep the DSN key.
   Expect `3eb05100` for the first two and `7faccca5` for hospitality.
7. `gh workflow run sentry-heartbeat.yml --ref main` once. Expect all 5 projects PASS
   and #5941 to close itself. Never close #5941 by hand.

**Deadline:** the third red scheduled heartbeat makes `scheduled-workflow-health` file
a `ci-fix` + `ready` issue at **2026-10-04 08:00Z**. Release before about 07:00Z that
day.

## Post-release checks

None ran, because nothing was released. The "before" baseline is in
`verification.md`: all three live bundles carry `7faccca5…`, and #5941 is OPEN.

## Outcome

**Not shipped yet. Halted at the authorized blocker.** The secret exists. That is
harmless before the merge, since no build on `main` reads it yet. #5990 waits for #5966
and a green `CI Gate` on its updated head.
