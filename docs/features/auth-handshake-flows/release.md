---
stage: ship
run: feature:auth-handshake-flows
date: 2026-08-31
assumptions:
  - "Release scope: the production release is the eleven squash merges already on main (base 1d6189203, in-run head 14af05e3c), each deployed by CI on its own merge under the brief's merge-on-green authorization — so Ship's release action is the docs-landing PR plus pre-flight/post-release evidence, not a new code deploy. Out-of-run merges since (through 2ccbdea50 at ship time) are not part of this release."
  - "Deploy evidence is read at job level, not workflow level (per the skipped-run gotcha): deploy-static run 33361706667 on 14af05e3c shows Deploy Rialto Web=success with Marketing/Hospitality skipped by Detect Changes — correct, since #4772 touched only apps/rialto-web; the run's hospitality surfaces shipped on their own earlier merges and were probed on production at 500affc76 by verification.md."
surfaced:
  - "Human step, still open (restated from every stage; NOT attempted here — Auth0 tenant changes are explicitly unauthorized for automation): on tenant dev-ytbgmz5ls3wh4xdx.us.auth0.com, add https://mattbutlerengineering.com/hospitality/callback and http://localhost:3002/hospitality/callback to Allowed Logout URLs, and confirm the discovery document exposes end_session_endpoint. Until done, a real production sign-out cannot reach the signed-out state (Auth0 stops on its own error page) and review.md m2's sign-in-worded failure screen is the likelier first experience of a failed sign-out."
  - "Human step, not performed (explicitly unauthorized): rialto npm publish. Nothing is pending from this run anyway — none of the eleven PRs touched packages/rialto/src, so no changeset awaits a release."
---

# Release: Auth handshake flows

The run's code is fully on `main` and deployed: eleven squash merges (ten
breakdown items + verify-fix #4772), base `1d6189203`, in-run head
`14af05e3c` — the per-PR table is in review.md § Scope. Under the brief's
release authorization (merge-on-green; deploys only via CI on main push),
each merge already produced its deploy. This stage therefore records
pre-flight evidence for that state, probes the deployed surface the review
flagged, and lands the run directory on `main` via a docs-only PR — the one
release action Ship itself performs.

## Pre-flight

- [x] **Verification green** — verification.md: 12/12 PRD criteria PASS
      after the § Re-verification at `14af05e3c` (the one FAIL, criterion 11,
      was fixed by #4770 → PR #4772 and re-verified from the merged tree);
      review.md verdict "Ready to ship", 0 critical / 0 major / 6 minor, all
      deferred with logged reasons.
- [x] **No secrets in diff; target config present** — review.md security
      pass: clean ("no secrets, no new storage, no new network calls
      anywhere in the diff"). The docs landed here carry only the public
      tenant domain, no credentials. The one absent piece of target
      configuration is the Auth0 logout allow-list — a human step outside
      the repo, restated under `surfaced:`; in-repo behavior is deliberate
      either way (review.md rider 1).
- [x] **Migrations/data changes** — none. Frontend-only run
      (`packages/auth` react layer, `apps/hospitality`, `apps/rialto-web`);
      no Prisma schema, migration, or data change in any of the eleven PRs.
- [x] **Rollback plan concrete** — below.

Pre-flight commands run at ship time (2026-08-31, ~17:15–17:25Z), real
output:

```
$ git merge-base --is-ancestor 14af05e3c origin/main && echo "14af05e3c IS ancestor of origin/main"
14af05e3c IS ancestor of origin/main        # origin/main at 2ccbdea50

$ gh run list --workflow=ci.yml --branch main --limit 5
pending          feat(hospitality): launch-sequence.ts …          CI  main  push  33418531325   (out-of-run, in flight)
queued           feat(hospitality): add floor-plan-templates.ts … CI  main  push  33417482729   (out-of-run, in flight)
completed success fix(rialto): PinInput renders every cell …      CI  main  push  33417169248
completed success chore(acmm): daily audit 2026-08-31 (#4779)     CI  main  push  33414918134
completed success fix(rialto-web): … signup created-phase … label CI  main  push  33361706646   # 14af05e3c

$ gh run view 33361706667 --json jobs   # Deploy Static Sites on 14af05e3c, 2026-08-31T05:46:17Z
Deploy Rialto Web: success · Post-Deploy Verification: success · Report Deploy Health: success
Deploy Marketing: skipped · Deploy Hospitality: skipped   (Detect Changes — #4772 touched only apps/rialto-web)
```

Main is green through the last completed push runs; the two in-flight runs
are out-of-run hospitality feature merges (#4781, #4774's sibling) that
postdate this release and do not gate it.

## Rollback plan

```
# Full rollback of the run (revert the eleven squash merges, newest first),
# from a scratch clone — never a branch inside the main checkout:
git clone --shared /Users/mbutler/github/mattbutlerengineering <scratch> && cd <scratch>
git checkout -b revert/auth-handshake-flows origin/main
git revert --no-edit 14af05e3c 5c102dfc3 8d0579abe e97d1db03 ad18c502d \
  500affc76 3986a98e4 f8dca42a2 9e1ff69e0 fb67f7b11 e06b2951d
pnpm install --frozen-lockfile && pnpm build --filter @mbe/cli... && pnpm regen   # re-settle llms artifacts
git push -u origin revert/auth-handshake-flows          # foreground, no pipes; verify remote SHA
gh pr create --base main …                              # merge on CI Gate green
# The merge redeploys hospitality + rialto-web via deploy-static.yml — deploys go via CI only.

# Partial rollback (one surface misbehaving): revert only that surface's
# commit(s) from the review.md § Scope table, same flow.

# Docs-landing rollback: git revert <docs merge SHA>   (docs-only; no deploy runs).
```

## Release log

1. 2026-08-30 → 2026-08-31T05:46Z — eleven code PRs merged on green
   (review-gate pass + `CI Gate` success each; #4736 #4737 #4733 #4748
   #4755 #4765 #4747 #4734 #4750 #4749 #4772), each squash merge deploying
   via CI per the brief. Final in-run merge: `14af05e3c` (#4772) at
   2026-08-31T05:46:15Z. → done before Ship; recorded, not repeated.
2. Deploy for the release head: `Deploy Static Sites` run 33361706667 on
   `14af05e3c` → completed success (job-level evidence quoted in
   Pre-flight). Earlier in-run merges each carried their own green
   deploy-static run (e.g. 33358630413 on `500affc76`, the run
   verification.md probed production against).
3. Ship pre-flight commands run → output quoted above; all green.
4. Post-release probe of the deployed `/rialto/demos/signup` bundle → #4772
   fix confirmed live (evidence below).
5. Docs-landing PR (this directory, including this file) opened from scratch
   clone branch `docs/auth-handshake-flows` → **PR #TBD** — number recorded
   in a follow-up commit on the PR branch once assigned; merged on
   `CI Gate` green via auto-merge (squash). Low-risk classification
   (docs-only) checked via `qualifiesForLowRiskFastPath` against a fresh
   `agent-core` dist before enqueueing.

## Post-release checks

- **Deployed `/demos/signup` carries the #4772 label (review.md rider 2)** —
  probed 2026-08-31 ~17:20Z against production:

  ```
  $ curl -sS https://mattbutlerengineering.com/rialto/demos/signup   → HTTP 200
  entry bundle /rialto/assets/index-BC_VsllI.js → 201 referenced chunks, incl. assets/SignUp-BzOb5rC0.js
  $ grep -oF 'Account created — your browser and Identity agree' SignUp-BzOb5rC0.js | sort | uniq -c
        1 Account created — your browser and Identity agree
  # context: created:{state:`settled`,status:`Account created`,ariaLabel:`Account created — your browser and Identity agree`}
  # sibling SignIn-BrHFLpjK.js: status:`Verified`,ariaLabel:`Signed in — your browser and Identity agree`
  ```

  Label ≠ status on the deployed bundle — criterion 11 holds where users
  get it. Caveats, per the probe's own limits: this checks bundle content,
  not runtime behavior (a CSP block would be invisible to curl — none is
  expected; verification.md drove the page in a real browser at
  `500affc76`), and the string is a static literal with no runtime branch.

- **Hiccup, recorded:** the first probe hit
  `https://mattbutlerengineering.com/demos/signup` (no `/rialto` prefix) and
  got HTTP 200 from the **marketing** worker's SPA fallback — its chunk list
  (AcmmPage, MetricsPage, WeeklyIntakePage…) gave it away before any false
  conclusion. rialto-web is served under the `/rialto/` path via the edge
  router's service binding (`infrastructure/worker/wrangler.toml`,
  `service = "mattbutlerengineering-rialto-web"`). A 200-with-wrong-app is
  what `not_found_handling = "single-page-application"` makes of a bad URL —
  worth remembering for future probes.
- **Hospitality surfaces** — no re-probe needed: unchanged since
  verification.md's production checks at `500affc76` (signed-out landing on
  `/hospitality/callback`, in-place failure with working retry, banner
  copy), and no hospitality deploy has run between `500affc76`'s and
  `14af05e3c`'s merges from this run.
- **Tracker mirror** — no `intake:` issue exists (feature run, not
  maintenance); the ten work-item issues + tracking parent #4731 were closed
  at Implement item boundaries per the protocol.

## Outcome

**Shipped cleanly** (one probe hiccup, recorded above — wrong URL first, no
false conclusion drawn). All eleven code PRs live on `main` and deployed by
CI; the deployed rialto-web bundle demonstrably carries the final fix. Two
human steps remain open and are restated under `surfaced:` — the Auth0
logout allow-list (gates a real production sign-out reaching the signed-out
state) and the unperformed, unauthorized rialto npm publish (nothing
pending). Six review minors stay deferred for Operate to seed. Next stage:
**Operate**.
