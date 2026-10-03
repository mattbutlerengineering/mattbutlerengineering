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

**Status: SHIPPED 2026-10-03.** #5990 merged as `2de5105b6`. deploy-static run
`37096660655` succeeded. marketing and rialto-web now ship the `mattbutlerengineering`
DSN. The heartbeat came back 5 of 5 PASS, and #5941 closed itself.

## Pre-flight

- [x] **Verification green.** `verification.md` has 6 of 6 local criteria PASS. The
      only red check was Build's `pnpm audit` (basic-ftp `GHSA-c475-qrg2-pj4r`), and
      `main` failed the same way. #5966 was closed unmerged as superseded. The same
      override landed on `main` as #5991 (`d9773dc9a`), and #5996 (`6339d0843`) added
      the GHSA-ch52 ignore. `CI Gate` then went green on #5990's final head (log step 4).
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
git revert --no-edit 2de5105b6974246d57bd30b5540901a92eb54c5c
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
   - Resolved later. #5966 was closed unmerged as superseded, and its override landed
     on `main` as #5991. `main` push CI was green on `c87c6d93d` at 2026-10-03T04:14Z.
4. Ran `gh pr update-branch 5990` and `gh pr ready 5990`. Both exited 0. The new head is
   `815ad53930035fa8beae797a4b53ed9fe87dad39`. On that exact SHA, the `CI Gate` check
   concluded `success` at 04:28:10Z (run `37095891150`), with no failed check runs.
   `mergeStateStatus` was `CLEAN`. **Done.**
5. Ran `gh pr merge 5990 --squash --delete-branch --match-head-commit 815ad539… --subject "fix(deploy-static): route marketing and rialto-web Sentry to their own project (#5990)"`.
   The merge landed at 2026-10-03T04:28:22Z as
   `2de5105b6974246d57bd30b5540901a92eb54c5c`. `git ls-remote origin refs/heads/main`
   returned that SHA, and the remote branch is deleted. The command exited 1 only on
   local cleanup (`'main' is already used by worktree …/booking-guest-reuse`), which is
   harmless. **Done.**
6. Ran `gh workflow run deploy-static.yml --ref main`. That started run `37096660655`
   (`workflow_dispatch`, headSha `2de5105b6`), which concluded `success`. Job results:
   Deploy Hospitality, Deploy Marketing and Deploy Rialto Web all `success`.
   Post-Deploy Verification and Report Deploy Health were `success`. Deploy Blocked and
   Rollback Failed Deploys were `skipped`. Wrangler uploaded `…-marketing` (29 new
   assets) and `…-rialto-web` (265 new assets). **Done.**
   - **Review Minor 3 (source maps): not confirmed from the log.** The marketing and
     rialto-web build steps both received `SENTRY_ORG`, `SENTRY_PROJECT` and
     `SENTRY_AUTH_TOKEN`. The log masks their values. The vite build output has no
     `sentryVitePlugin` lines at all: no upload line and no error line. The plugin is
     quiet unless it fails or debug is on. So the log does not prove an upload went to
     `mattbutlerengineering`. It also shows no upload error.
7. Probed the live bundles on 2026-10-03 at about 04:31Z. Public DNS (`dig @1.1.1.1`)
   and the local resolver returned the same Cloudflare IPs.
   - `/` → `/assets/index-DOa0iccL.js` → `https://3eb05100486a63c8bcd98a58c8911f36@o4510650299842560.ingest.us.sentry.io/4511154257526784`
   - `/rialto/` → `/rialto/assets/index-8o4lCRrj.js` → `https://3eb05100486a63c8bcd98a58c8911f36@o4510650299842560.ingest.us.sentry.io/4511154257526784`
   - `/hospitality/` → `/hospitality/assets/index-BCZjMWsI.js` → `https://7faccca51daa0d1c8dae179686042ab8@o4510650299842560.ingest.us.sentry.io/4511413547040768`
     (same chunk hash as before the release, as expected, since its env did not change)

   Before the release, all three carried `7faccca5…`. **Done, as expected.**

8. Ran `gh workflow run sentry-heartbeat.yml --ref main` once. That started run
   `37096854810` (headSha `2de5105b6`), which concluded `success`:

   | Project               | Verdict | Detail                                      |
   | --------------------- | ------- | ------------------------------------------- |
   | users-api             | PASS    | users-api: confirmed                        |
   | reservations-api      | PASS    | reservations-api: confirmed                 |
   | agent-api             | PASS    | agent-api: confirmed                        |
   | hospitality           | PASS    | hospitality: confirmed                      |
   | mattbutlerengineering | PASS    | marketing: confirmed; rialto-web: confirmed |

   #5941 is `CLOSED` (`COMPLETED`) as of 2026-10-03T04:33:24Z. github-actions closed it
   and commented: "The Sentry heartbeat is green again for **mattbutlerengineering** in
   …/runs/37096854810. Closing." Ship did not close it by hand. **Done.**

## Post-release checks

- [x] marketing and rialto-web bundles carry `3eb05100…`. hospitality still carries
      `7faccca5…` (log step 7).
- [x] The heartbeat is 5 of 5 PASS, and the `mattbutlerengineering` row is the one
      that used to FAIL (log step 8).
- [x] #5941 closed itself. This was before the 2026-10-04 08:00Z third-red deadline.
- [ ] Source-map uploads to `mattbutlerengineering` are not proven (log step 6). Check
      a symbolicated stack trace on the next real marketing or rialto-web error. To
      check sooner, add a debug flag to the plugin in a separate run.

## Outcome

**Shipped.** marketing and rialto-web report into the `mattbutlerengineering` Sentry
project. hospitality still reports into `hospitality`. The heartbeat is green across all
5 projects, and alert #5941 closed itself. One thing is still open: the build log cannot
show whether source maps uploaded to the new project.
