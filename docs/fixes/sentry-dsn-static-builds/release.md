---
stage: ship
run: maintenance:sentry-dsn-static-builds
date: 2026-08-17
---

# Release: Sentry build env for the marketing and rialto-web deploys (PR #4351)

## Pre-flight

- [x] **Verification green** — `verification.md` records 2 PASS, 0 FAIL, and 1
      criterion deliberately open (the deployed-surface check, which is this
      stage's post-release step). No unresolved failures.
- [x] **No secrets in diff; target config present** — the workflow references
      `${{ secrets.* }}` indirections only. All four secrets
      (`VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`)
      already existed in the repo secret list before this run; none were
      created, modified, or read.
- [x] **Migrations/data changes** — none. Build-time environment only; no
      schema, no data, no runtime API surface.
- [x] **Rollback plan concrete** — below.
- [x] **CI Gate green on both channels** at head `d2a31614e` — check-run
      `completed/success` and commit status `CI Gate = success`, rollup
      `success`, `mergeStateStatus: CLEAN`. Zero failing checks (unlike the
      previous two PRs, `codecov/patch` passed here too).

## Rollback plan

Revert the **whole squash commit**, not just the workflow hunk:

```bash
git revert --no-edit d3333144df565f16597ed63c02d7ba818df94cc0
git push origin main

# The revert touches only .github/**, which is NOT in deploy-static.yml's
# push path filter — so it will not redeploy either. Force it:
gh workflow run deploy-static.yml --ref main

# Confirm the rollback actually reached users:
curl -s https://mattbutlerengineering.com/assets/index-*.js \
  | grep -c 'ingest\.us\.sentry\.io'   # expect 0 again
```

**Do not revert only `.github/workflows/deploy-static.yml`.** The guard test
`scripts/__tests__/deploy-static-sentry-env.test.mjs` asserts against that
file, so removing the env without removing the guard leaves `main` red
(`2 failed | 2 passed`). This is the same coupling the `rialto-web-fonts` run
hit, where reverting `index.html` alone left its guard failing.

There is nothing to roll back at the infrastructure layer: no resource was
created and no secret changed.

## Release log

1. `gh api -X PUT .../pulls/4351/merge -f merge_method=squash` →
   `merged=true sha=d3333144df565f16597ed63c02d7ba818df94cc0`
2. `git checkout main && git fetch && git reset --hard origin/main`; deleted
   `fix/sentry-dsn-static-builds` → local clean at `d3333144d`
3. **Confirmed the merge shipped nothing** (this was expected, and is the whole
   reason step 4 exists). `deploy-static.yml`'s `push` trigger is path-filtered
   to `apps/**` plus a few packages and does not include `.github/**`:

   ```
   2026-08-17T21:53:23Z push success a29a4ae8d   <- latest run, an OLDER sha
   2026-08-17T20:04:53Z push success 28edc0593
   ```

   No run exists for merge sha `d3333144d`. Production was still serving the
   Sentry-less bundles at this point.

4. `gh workflow run deploy-static.yml --ref main` → dispatched as run
   `32087998083`. `workflow_dispatch` sets `marketing/hospitality/rialto-web`
   all `true`, bypassing the path filter.
5. Run `32087998083` → `completed/success`:

   ```
   success  Circuit Breaker Check
   success  Detect Changes
   success  Deploy Rialto Web
   success  Deploy Hospitality
   success  Deploy Marketing
   success  Post-Deploy Verification
   success  Report Deploy Health
   skipped  Deploy Blocked
   skipped  Rollback Failed Deploys
   ```

   `Rollback Failed Deploys` skipped, i.e. the workflow's own post-deploy
   verification did not trip.

No hiccups. Nothing was retried.

## Post-release checks

**1. The deployed bundles now carry the DSN** — work item 3's acceptance
criterion, measured against production, not against a build artifact:

| Site        | Bundle before       | before | Bundle after        | after |
| ----------- | ------------------- | ------ | ------------------- | ----- |
| marketing   | `index-BX5NGZF2.js` | **0**  | `index-J66E3MDa.js` | **1** |
| rialto-web  | `index-q8BxDpz1.js` | **0**  | `index-C7F-t8Ma.js` | **1** |
| hospitality | `index-DrccHO7c.js` | 1      | `index-DrccHO7c.js` | 1     |

Two independent signals that this is the real change and not a coincidence of
redeployment:

- Both fixed apps got **new content hashes**, so their bundles genuinely
  changed.
- Hospitality's hash is **byte-identical** across the deploy. It already had
  the env, so its build output was unchanged — exactly the control result. A
  change in hospitality's hash would have meant something else moved.

**2. The inlined value is a real DSN, not an empty string** — the criterion
above only proves the ingest host appears. Extracted and shape-checked:

```
marketing:  host=o4510650299842560.ingest.us.sentry.io/4511413547040768  key=7faccc...(32 chars)
rialto-web: host=o4510650299842560.ingest.us.sentry.io/4511413547040768  key=7faccc...(32 chars)
```

Same org and project as hospitality's, and the same origin already present in
production's CSP `connect-src` — so the transport path is known-good rather
than assumed.

**3. Post-deploy verification job** — `deploy-static.yml`'s own `verify` job
passed for all three sites, and `Rollback Failed Deploys` was skipped.

## Not checked

- **An actual error event arriving in Sentry.** Everything up to the network
  boundary is verified — DSN inlined, well-formed, CSP-allowed, same project as
  a working app. Confirming ingestion would mean deliberately throwing an
  error on the production site, which is not worth doing to close this run.
  Recorded as a residual gap, not as a pass.
- **Source-map upload producing readable stack traces.** The three `SENTRY_*`
  variables are now supplied and `sentryVitePlugin` should therefore be
  enabled, but whether a symbolicated trace appears in Sentry needs a real
  error from a real build. Seeded to the backlog rather than claimed.

## Outcome

**Shipped cleanly.** Merged, deployed by explicit dispatch, and confirmed on
the deployed surface: marketing and rialto-web went from 0 → 1 occurrences of
the Sentry ingest host with new bundle hashes, while the hospitality control
stayed byte-identical. After ~4.5 months, both sites now report client-side
errors.

The one thing worth carrying forward: **the merge did not ship this.** A
reviewer reading only "PR merged, CI green" would have concluded the fix was
live while production still served the old bundles. That gap is now this run's
main seed.
