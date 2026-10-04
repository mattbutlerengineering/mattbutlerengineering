---
stage: ship
run: maintenance:static-sourcemaps-confirm
date: 2026-10-04
status: SHIPPED
merge: 4402db7610dff383535d4026609fd1cd06414b77
assumptions:
  - "Maintenance-run scale: one squash-merge of PR #6019, then a `workflow_dispatch` of `deploy-static.yml` on main."
  - "Release authorization and the fail-closed upload policy come from `autorun-brief.md` (Release authorization, Decision)."
  - "Symbolication of a real bundle frame stays PENDING. No frame-bearing error event existed after the deploy, and per the brief no error was thrown at production to manufacture one. Everything short of that is proven below."
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
- [x] **Migrations / data.** None.
- [x] **Rollback plan concrete** (below).

## Rollback plan

```
# 1. Revert the squash-merge commit on main
git fetch origin && git switch -c revert/static-sourcemaps origin/main
git revert --no-edit 4402db7610dff383535d4026609fd1cd06414b77
git push -u origin revert/static-sourcemaps
gh pr create --base main --title "revert: static source-map upload (#6019)" --body "Rollback of #6019"
# merge once CI Gate is green, then
# 2. Redeploy the static sites from the reverted main
gh workflow run deploy-static.yml --ref main
```

**Failure mode under fail-closed.** A failed upload, a failed presence guard or a failed
`verify-sentry-sourcemaps` step stops the job before `wrangler deploy`. The previously
deployed version stays live. The failure mode is "no deploy", not "broken site". Rollback
is needed only to unblock future deploys, not to restore service. Not needed: every
step below succeeded.

## Release log

1. **Pre-flight commit.** Committed this file's pre-flight as `99682e5ac` and pushed it
   without a pipe (exit 0). `git ls-remote` returned
   `99682e5acaf62c47046a0b33cc95f9ac3febaa95 refs/heads/fix/static-sourcemaps-confirm`.
2. **`gh pr ready 6019`.** Marked ready. The `CI Gate` check run on `99682e5ac` (run
   `37178387619`, `pull_request`) completed `success`. The only red check was
   `Visual Regression (rialto-web)`, which is advisory and was already red on main
   (see `verification.md` criterion 6).
3. **Merge.** Ran
   `gh pr merge 6019 --squash --delete-branch --match-head-commit 99682e5acaf62c47046a0b33cc95f9ac3febaa95 --subject "fix(static): upload Sentry source maps — pass SENTRY_* through turbo and fail closed (#6019)"`.
   - `gh pr view 6019`: `MERGED` at 2026-10-04T05:09:36Z, merge commit `4402db761`.
   - `origin/main` = `4402db7610dff383535d4026609fd1cd06414b77`, and the remote branch
     is gone.
   - Hiccup: `gh` printed `fatal: 'main' is already used by worktree at …/booking-guest-reuse`.
     This is its local branch cleanup failing. The merge itself was unaffected.
4. **Deploy.** `gh workflow run deploy-static.yml --ref main` produced run
   `37179075898` (`workflow_dispatch`, headSha `4402db761`).
   - **Not expected:** the merge also triggered deploy-static on push, as run
     `37179071034` (`push`, same headSha). The PR changed `apps/*/vite.config.ts`,
     which the push filter covers. The earlier claim that "merging this deploys nothing"
     (`defect.md` Implement notes) was wrong: it was true of `turbo.json` and
     `scripts/**`, not of the vite configs.
   - Both runs ran to completion, the dispatch run about 1 min behind. The dispatch run
     deployed last, so its output is what is live.
5. **Both runs: every job concluded `success`.** That covers Circuit Breaker Check,
   Detect Changes, Deploy Marketing, Deploy Rialto Web, Deploy Hospitality,
   Post-Deploy Verification, and Report Deploy Health. `Deploy Blocked` and
   `Rollback Failed Deploys` were `skipped`, as designed.

## Post-release checks

### (a) The build logs show the upload succeeded (verification.md criterion 7): PROVEN

Source: `gh run view <run> --log --job <id>`, per job. Lines are quoted verbatim, and
GitHub masks the hospitality project slug as `***`.

| Run / job                        | Presence guard                                                                           | sentry-cli                                                                                                                                 | Plugin                                        | `verify-sentry-sourcemaps`                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `37179071034` Deploy Marketing   | `All 3 required deploy secret(s) present`                                                | `> Uploaded files to Sentry`, `> Release: 4402db76…`, `> Upload type: artifact bundle`                                                     | `Successfully uploaded source maps to Sentry` | `apps/marketing/dist: all 18 chunk(s) carry a Sentry debug ID and no source maps remain.` |
| `37179071034` Deploy Rialto Web  | `All 3 required deploy secret(s) present`                                                | `> Uploaded files to Sentry`, `> Release: 4402db76…`                                                                                       | `Successfully uploaded source maps to Sentry` | `apps/rialto-web/dist: all 199 chunk(s) carry …`                                          |
| `37179071034` Deploy Hospitality | `All 3 required deploy secret(s) present: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT` | `> Found 135 files`, `> Bundled 135 files for upload`, `> Uploaded files to Sentry`, `> Release: 4402db76…`                                | `Successfully uploaded source maps to Sentry` | `apps/***/dist: all 68 chunk(s) carry …`                                                  |
| `37179075898` Deploy Marketing   | present                                                                                  | `> Found 36 files`, `> Bundled 36 files for upload`, `> Uploaded files to Sentry`, `> File upload complete (processing pending on server)` | `Successfully uploaded source maps to Sentry` | `all 18 chunk(s) carry …`                                                                 |
| `37179075898` Deploy Rialto Web  | present                                                                                  | `> Found 397 files`, `> Bundled 397 files for upload`, `> Uploaded files to Sentry`                                                        | `Successfully uploaded source maps to Sentry` | `all 199 chunk(s) carry …`                                                                |
| `37179075898` Deploy Hospitality | present                                                                                  | `> Bundled 135 files for upload`, `> Nothing to upload, all files are on the server`                                                       | `Successfully uploaded source maps to Sentry` | `all 68 chunk(s) carry …`                                                                 |

- **Hospitality in the dispatch run.** "Nothing to upload" is correct here: the build was
  byte-identical to the push run's, which had already uploaded the same 135 files to the
  same bundle.
- **Credentials.** No job hit a 401, 403 or project-not-found error. So the token's scope
  and the org and project slugs, including hospitality's secret `SENTRY_PROJECT`, are now
  proven against sentry.io. Brief hypotheses 2 and 3 are closed: neither applied.
- **wrangler listed zero `.map` files in all six jobs.** The command was
  `grep -E '\+ /.*\.map'` over each job log, and it counted 0. Before the fix, run
  `37096660655` uploaded 13 maps for marketing and 132 for rialto-web.

### (b) Live chunks carry debug IDs (verification.md criterion 8): PROVEN

- Measured 2026-10-04 at about 05:15Z.
- DNS: `dig` and `dig @1.1.1.1` both return `104.21.25.32 172.67.222.73`, so the LAN
  sinkhole is not involved.
- Same method as the baseline: `curl` every `.js` that each page's HTML references, then
  `grep -q sentry-dbid-`.

| Page            | Baseline (04:11Z) | After deploy |
| --------------- | ----------------- | ------------ |
| `/`             | 0 of 5            | 4 of 5       |
| `/rialto/`      | 0 of 10           | 10 of 10     |
| `/hospitality/` | 0 of 11           | 11 of 11     |

- **The one miss on `/` is `/registerSW.js`.** It is vite-plugin-pwa's root registration
  stub, built outside the rollup bundle. The guard exempts it by design (`defect.md`
  assumption 4), and it was among the 5 in the baseline too.
- **The live marketing entry is the dispatch run's bundle.** `/assets/index-D5xG07g2.js`
  is the file run `37179075898` uploaded. It carries
  `sentry-dbid-a345e6ae-fbde-4f59-b718-1f2d025db4a1` and
  `e.SENTRY_RELEASE={id:\`4402db7610dff383535d4026609fd1cd06414b77\`}`.
- **`.map` URLs still 404.** `/assets/index-D5xG07g2.js.map` and `/x.map` both return
  `404 text/plain;charset=UTF-8`, from the edge router's block. The maps were also never
  uploaded to Cloudflare, per (a).

### (c) A Sentry release exists, and frames symbolicate (verification.md criterion 9): release PROVEN, symbolication PENDING

- **Release.** Sentry MCP
  `find_releases(organizationSlug=mattbutlerengineering, regionUrl=https://us.sentry.io)`
  was queried read-only. The baseline was `{"releases":[]}`. It now returns one release:
  - `version: 4402db7610dff383535d4026609fd1cd06414b77`;
  - `projects: ["mattbutlerengineering","hospitality"]`;
  - `dateCreated: 2026-10-04T05:10:59Z`, `dateReleased: 2026-10-04T05:13:14Z`;
  - `lastCommit` = the #6019 squash commit.
- **Symbolication: PENDING.**
  - `search_events` over `errors` with `release:4402db76…` (24h) found no results.
  - `event.type:error` (2h) found no results either.
  - No frame-bearing event from the new bundles exists yet. The heartbeat cannot prove
    symbolication, because its frames are Playwright-injected rather than bundle code.
  - No error was thrown at production to manufacture one.
  - The release and artifact bundles are present, and the live chunks carry the matching
    debug IDs. That is everything Sentry needs. The first real browser error will be the
    proof, and Operate should check its frames.
- **Not verified: the event `release` tag.** The live entry chunk now injects
  `SENTRY_RELEASE.id`. `packages/sentry` reads `__SENTRY_RELEASE__` or
  `SENTRY_RELEASE?.id` in one code path, and `process.env.SENTRY_RELEASE` in another.
  Whether browser events now carry `release=4402db76…` is not observed, since no event
  has arrived. That belongs to the out-of-scope release-tagging seed.

## Outcome

**SHIPPED.** Upload, debug-ID injection, map deletion, the release record, and the
token's scope and slugs are proven in production for marketing, rialto-web and
hospitality.

There was one hiccup: the merge's push event deployed too, so production received two
identical, successful deploys of `4402db761`. Nothing was harmed.

Still open for Operate:

- symbolication of a real bundle frame, which waits for the first frame-bearing error
  event;
- whether events carry the release tag (out-of-scope seed).

**Nothing needs Matt for this run.** No credential stop was hit.
