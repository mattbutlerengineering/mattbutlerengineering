---
stage: ship
run: feature:hospitality-service-ux
date: 2026-09-11
assumptions:
  - "Merge mechanism. The brief specifies `gh pr merge <N> --auto --squash --delete-branch`. A `CLEAN` PR refuses `--auto` in this repo (recorded gotcha), so the direct `gh pr merge <N> --squash --delete-branch` was used instead — same squash, same branch deletion, same merge-on-green intent, one fewer moving part. No autorun user was available to confirm the substitution."
  - "Where Review's deferred findings go. The brief's Tracker section defines a convention for findings routed OUT of the cluster (`[Audit] UX: …`, `ready` + `audit` + `ux`, de-duplicated against open issues) but is silent on findings Review defers at the end of the run. That same convention was applied: all 6 majors and all 8 minors are filed as `ready` issues, individually except where two groups of tightly-related specialist minors were bundled (5 E2E drifts → one issue, 2 CommandPalette contract gaps → one issue). Nothing was dropped."
  - "Tracking parent. The brief assigns Ship the closing of work-item issue #5035 but says nothing about the tracking parent #5037. Ship closed it too: all 17 items are complete and shipped, and a tracking issue left open past its own run is the recorded 'stale tracking issue' failure mode."
  - "AI-antipattern ratchet during push. `scripts/check-ai-antipatterns.mjs` reports 5 regressions when run in this worktree, caused entirely by the git-excluded `.ux-audit` harness the run kept outside the repo on purpose. Rather than `--update` the baseline (which would ratchet the repo against files that do not exist in it) or `git push --no-verify` (which would skip the regen and destructive-migration gates too), the harness directory was moved aside for the duration of the push and restored immediately after, so every pre-push hook ran for real against the committed tree. Proof of cause is in the release log."
---

# Release: hospitality service UX — the service night on the Timeline

PR **#5269** — `worktree-hospitality-service-ux` → `main`.
44 commits, 163 files, **+16,277 / −1,667**. Base `origin/main` `2d8f69b2a`,
merge-base `5b1f1309f`, head `c874f8bff` (the PR opened at `cfc8590c4`; the
extra commit is the CI-red fix in release-log step 5).
Merged as **`e0816489007c45db91ca3c22ba9ce281432cbac7`**, deployed via
`deploy-static.yml`.

## Pre-flight

- [x] **Verification green (no unresolved failures).** `verification.md` grades the
      PRD's 42 committed criteria **37 PASS / 5 PARTIAL / 0 FAIL**. The five
      PARTIALs (A6.2, A7.1, A9.1, B1.1, NF5) are each a _recorded_ limit of
      measurement or an out-of-scope clause, not a failure; Review agreed with all
      five with no softening and no upgrades. The one red E2E spec
      (`realtime-collaboration.spec.ts`) is a characterised pre-existing harness
      flake proven not to be this run's doing, and it passed in CI on this PR anyway.
- [x] **Review gate met.** `review.md` verdict: **"CRITICAL: NO. Zero critical
      findings. Nothing blocks Ship."** The brief's release authorization bars
      "any merge past an unfixed critical review finding"; there is none.
- [x] **No secrets in the diff.** A high-confidence scan of the full
      `git diff origin/main...HEAD` (Stripe live keys, AWS key ids, PEM private-key
      headers, JWTs) returned **0** matches, and CI's `Gitleaks Secret Scan` job
      passed. Review's security pass was independently clean: no new `fetch(`,
      `EventSource`, `dangerouslySetInnerHTML`, `eval`, `document.cookie`, or token
      in `localStorage` anywhere in the diff.
- [x] **Required configuration exists in the target environment.** The release adds
      no new environment variable, secret, or binding. `deploy-static.yml` already
      supplies everything `apps/hospitality` needs (`VITE_API_URL`,
      `VITE_AUTH_AUDIENCE`, `VITE_AUTH_REDIRECT_URI`) and is unchanged by this PR.
- [x] **Migrations / data changes have a tested forward path** — _vacuously_: there
      are **none**. `git diff --name-only origin/main...HEAD` matches nothing under
      `prisma`, `migration`, `.env`, `infrastructure/`, `services/`, or
      `.github/workflows`. CI's `Migration Dry-Run` and `Validate Migrations` jobs
      both passed. The blast radius is the hospitality Worker bundle plus two
      **additive** rialto props.
- [x] **Rollback plan concrete** — below.

### Local gates run by this stage, before the push

| Gate                 | Command                                                            | Result                                                    |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Typecheck            | `pnpm typecheck` (root)                                            | `Tasks: 48 successful, 48 total` — exit **0**             |
| Generated artifacts  | `pnpm regen --check` (after `pnpm build --filter @mbe/cli...`)     | `All generated artifacts are up to date.` — exit **0**    |
| Docs formatting      | `pnpm exec prettier --check docs/features/hospitality-service-ux/` | `All matched files use Prettier code style!` — exit **0** |
| Secret scan          | grep over the full diff for live-key / PEM / AKIA patterns         | `0` matches                                               |
| agent-core freshness | `node scripts/agent-core-build-freshness.mjs check`                | `{"trusted":true,"state":"fresh",…}`                      |
| Worktree state       | `git status --short`                                               | empty, before and after the push                          |

Carried forward from Verify, not re-run here: `apps/hospitality` **169 files /
2287 tests passed**, `packages/rialto` **148 files / 2300 tests passed**, both
lints **0 errors**.

## Rollback plan

The release is a single squash commit on `main` plus the Cloudflare Worker deploy
`deploy-static.yml` performs from it. To undo it:

```bash
# 1. Revert the squash commit on main (no -m: a squash merge is not a merge commit).
cd /Users/mbutler/github/mattbutlerengineering
git fetch origin && git checkout -B revert/hospitality-service-ux origin/main
git revert --no-edit <MERGE_SHA>
git push -u origin revert/hospitality-service-ux

# 2. Open and merge the revert PR — CI Gate is the only required check.
gh pr create --base main --head revert/hospitality-service-ux \
  --title "revert: #5269 hospitality service UX" --body "Rollback of #5269."
gh pr merge <N> --squash --delete-branch

# 3. The revert's own push to main re-triggers deploy-static.yml, which rebuilds
#    and redeploys the hospitality Worker from the reverted tree. Deploy is via CI
#    only — never run wrangler by hand (recorded repo policy).

# 4. Confirm the rollback landed:
curl -s -o /dev/null -w "%{http_code}\n" https://mattbutlerengineering.com/hospitality/
gh run list --branch main --limit 5   # deploy-static.yml should be green
```

There is nothing else to undo: no migration to reverse, no infrastructure state,
no npm package published (`rialto` npm publish is explicitly **not authorized** by
the brief and was not performed), no feature flag, no data backfill. The two
rialto changes are additive (`Drawer` gains a `size` option; `CommandPalette`
gains an export), so reverting them cannot orphan a consumer.

## Release log

Every command below was run from the run's worktree
(`.claude/worktrees/hospitality-service-ux`), never from the main checkout.

### 1. Pre-flight gates

```
$ pnpm exec prettier --check docs/features/hospitality-service-ux/
Checking formatting...
All matched files use Prettier code style!
prettier exit: 0

$ pnpm typecheck
 Tasks:    48 successful, 48 total
Cached:    5 cached, 48 total
  Time:    31.505s
TYPECHECK_EXIT=0

$ pnpm regen --check
All generated artifacts are up to date.
REGEN_EXIT=0
```

### 2. Hiccup: the AI-antipattern ratchet failed locally, and the cause was not in the repo

```
$ node scripts/check-ai-antipatterns.mjs
REGRESSION: 5 pattern(s) increased:
  magicTimeouts: 29 → 30 (+1)
  emptyCatch: 5 → 6 (+1)
  noopTestAssertions: 19 → 73 (+54)
  anyType: 291 → 292 (+1)
  consoleLogs: 711 → 712 (+1)
```

`noopTestAssertions +54` was the tell: nothing in a 163-file UI diff adds
fifty-four assertion-free tests. The scanner walks `process.cwd()` and skips
`node_modules` / `dist` / `generated` / `.turbo` — but **not** `.gitignore**d**
directories generally. This run deliberately kept its UX audit harness
git-excluded (`apps/hospitality/e2e/.ux-audit/`, 21 `.ts`/`.mjs` files of
probe specs that log JSON rather than assert). The scanner could see them; CI,
on a clean checkout, cannot.

Proved rather than assumed — park the harness, re-run, restore:

```
$ mv apps/hospitality/e2e/.ux-audit "$SCRATCH/ux-audit-parked"
$ node scripts/check-ai-antipatterns.mjs
  OK       magicTimeouts: 29 (baseline: 29)
  OK       emptyCatch: 5 (baseline: 5)
  OK       noopTestAssertions: 19 (baseline: 19)
  OK       hardcodedRoutes: 693 (baseline: 693)
  OK       anyType: 291 (baseline: 291)
  OK       consoleLogs: 711 (baseline: 711)
  OK       unusedParams: 4 (baseline: 4)
  OK       mockShapeMismatch: 18 (baseline: 18)
All patterns within baseline. No regressions detected.
EXIT_WITHOUT_HARNESS=0
$ mv "$SCRATCH/ux-audit-parked" apps/hospitality/e2e/.ux-audit
```

Every committed pattern sits **exactly** at baseline. The baseline was not
touched, `--no-verify` was not used, and CI's own `AI Antipattern Ratchet` job
passed on the PR — which is the independent confirmation.

### 3. Push (harness parked, all hooks live)

```
$ git push origin worktree-hospitality-service-ux    # never into a pipe
PUSH_EXIT=0
No new migration files found — skipping destructive check.
All patterns within baseline. No regressions detected.
pre-push: building CLI for regen...      Tasks: 6 successful, 6 total
pre-push: regenerating generated artifacts...   Done. All artifacts regenerated.
All generated artifacts are up to date.
To https://github.com/mattbutlerengineering/mattbutlerengineering.git
   fad6723d4..cfc8590c4  worktree-hospitality-service-ux -> worktree-hospitality-service-ux

$ git ls-remote origin worktree-hospitality-service-ux
cfc8590c4205140c6b154c2d07a6690f29461767	refs/heads/worktree-hospitality-service-ux
$ git rev-parse HEAD
cfc8590c4205140c6b154c2d07a6690f29461767
```

Pushed SHA verified against local HEAD rather than trusting the command's own
output. The repo's `verify-push-sha.sh` PostToolUse hook fired a **false alarm**
here — it read `CLAUDE_PROJECT_DIR`, which points at the _main_ checkout, and
complained that `docs/hospitality-animations-retro` (that checkout's branch) was
missing from `origin`. Unrelated to this push; the `git ls-remote` above is the
real verification.

### 4. PR opened

```
$ gh pr create --base main --head worktree-hospitality-service-ux --title "feat(hospitality): …"
https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5269
```

CI fired on the real `pull_request` event — PR author is `mattbutlerengineering`,
not `github-actions[bot]`, so the `GITHUB_TOKEN` anti-recursion trap does not
apply and no `workflow_dispatch` rescue was needed.

### 5. Hiccup: `CI Gate` went **red** on the first run — a real defect this run introduced

`Test (Node 22)` failed at `cfc8590c4`. Not a flake, not an environment problem:

```
 FAIL  scripts/__tests__/phantom-tokens.test.mjs > monorepo CSS custom-property resolution
       > hospitality references only custom properties defined in rialto or the app itself
AssertionError: phantom tokens in hospitality:
  --timeline-header-height referenced in:
    apps/hospitality/src/components/timeline/TimelineEmptyNight.module.css
  --timeline-table-column-width referenced in:
    apps/hospitality/src/components/timeline/TimelineEmptyNight.module.css
  expected [ '--timeline-header-height', …(1) ] to deeply equal []

 Test Files  1 failed | 163 passed (164)
      Tests  1 failed | 3168 passed (3169)
```

**Why every earlier gate missed it.** Verify and Review ran
`pnpm --dir apps/hospitality test` and `pnpm --dir packages/rialto test`; this
stage ran `pnpm typecheck` and `pnpm regen --check`. The guard lives in the
**`@mbe/scripts`** package (`scripts/vitest.config.mjs`), which none of those
commands reaches — it is a repo-level check on app CSS, and the first thing that
ran it against this branch was CI. Vitest does not typecheck and typecheck does
not run vitest; neither would have caught a CSS-token reference either way.

**Root cause.** `TimelineEmptyNight.module.css` positions the overlay with
`var(--timeline-header-height, 40px)` and
`var(--timeline-table-column-width, 120px)`. Both are set — but only _inline_,
on the overlay's anchor element in `TimelineGrid.tsx:339-340`. The guard reads
**stylesheets**, not React `style` props, so both resolved to nothing and it
reported them as phantom. At runtime the values were always correct; the defect
is that the CSS never declared them, which is exactly the shape the guard exists
to catch (a `var()` silently falling back to its literal, ignoring the design
system) — it simply could not tell this case from that one.

**Fix — RED already existed, so the cycle was honest.** Reproduced locally first:

```
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/phantom-tokens.test.mjs
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
```

Then `TimelineGrid.module.css` gained an `.emptyNightAnchor` class declaring both
properties with the desktop geometry (40px / 120px, tracking `HEADER_HEIGHT` and
`TABLE_COLUMN_WIDTH`), and the anchor `<div>` gained that `className`. The
element's own inline style still wins, so the mobile column narrowing is
unchanged — this adds a CSS-visible default, it does not move the source of
truth. GREEN:

```
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/phantom-tokens.test.mjs
 ✓ scripts/__tests__/phantom-tokens.test.mjs (11 tests) 17ms
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ pnpm exec vitest run --config scripts/vitest.config.mjs        # the whole guard package
 Test Files  162 passed (162)
      Tests  3115 passed (3115)

$ pnpm --dir apps/hospitality test
 Test Files  169 passed (169)
      Tests  2287 passed (2287)

$ pnpm --dir apps/hospitality typecheck   →  exit 0
$ pnpm --dir apps/hospitality lint        →  127 problems, 0 errors
$ pnpm typecheck                          →  Tasks: 48 successful, 48 total
```

Committed as `c874f8bff` — _fix(hospitality): declare the empty-night overlay's
two custom properties in CSS_ — and pushed:

```
$ git push origin worktree-hospitality-service-ux
PUSH_EXIT=0
   cfc8590c4..c874f8bff  worktree-hospitality-service-ux -> worktree-hospitality-service-ux
$ git ls-remote origin worktree-hospitality-service-ux
c874f8bff75b221b8a8a3041ec13af57c064d2be	refs/heads/worktree-hospitality-service-ux
```

The `synchronize` event re-ran CI on `c874f8bff`.

### 6. `CI Gate` green on the fixed head

```
$ gh pr checks 5269 --json name,state
SUCCESS  (45)  CI Gate · Test (Node 22) · Build · Integrity · Typecheck · Lint ·
               Architecture Audit · Migration Dry-Run · Validate Migrations ·
               AI Antipattern Ratchet · Dependency Sync · Gitleaks Secret Scan ·
               CodeQL · Trivy · Hospitality E2E · Marketing E2E ·
               Functional (rialto-web) · codecov/patch · …
FAILURE   (2)  Visual Regression (rialto-web) · Visual Regression (Storybook)
SKIPPED   (5)  Report CI Health · Accessibility AI Attribution · deploy ·
               Cleanup Preview · auto-merge
```

`CI Gate` is the **sole required** status check on `main`, and it was verified
twice over — as a check run in the rollup above, and as a commit **status** on
the exact head SHA, which is what branch protection actually evaluates:

```
$ gh api repos/mattbutlerengineering/mattbutlerengineering/commits/c874f8bff75b221b8a8a3041ec13af57c064d2be/status
{ "state": "success", "total_count": 1, "statuses": [ { "context": "CI Gate", "state": "success" } ] }
```

Naming the advisory checks rather than rolling them up, per the brief:

| Advisory check                   | Result      | Why it did not block                                                                                                                                                                                                                        |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codecov/patch`                  | **SUCCESS** | Patch coverage met.                                                                                                                                                                                                                         |
| `Hospitality E2E`                | **SUCCESS** | Passed on both CI runs, including the one at `cfc8590c4`.                                                                                                                                                                                   |
| `Visual Regression (Storybook)`  | **FAILURE** | One snapshot, `overlay-drawer--right.png` — open issue **#5119**. The branch's only `Drawer.stories.tsx` change _adds_ a `BottomCompact` story and widens an `argTypes.size.options` list; it cannot alter the `right` variant's rendering. |
| `Visual Regression (rialto-web)` | **FAILURE** | **46** snapshots — open issue **#5091** ("46/49 snapshots cascading… since #5087"). `Rialto Visual Regression` has been `failure` continuously on `main` since **2026-09-07**, i.e. before this branch existed.                             |

Both visual reds are pre-existing conditions of `main`, established by history
rather than asserted. Neither is a required check.

### 7. Merge

`--auto` was not used: a `CLEAN`/`UNSTABLE` PR refuses auto-merge in this repo
(recorded gotcha), and the brief says to merge directly. Nothing was stacked.

```
$ gh pr merge 5269 --squash --delete-branch
$ gh pr view 5269 --json state,mergedAt,mergeCommit,mergedBy
{
  "state": "MERGED",
  "mergedAt": "2026-09-11T21:19:02Z",
  "mergeCommit": { "oid": "e0816489007c45db91ca3c22ba9ce281432cbac7" },
  "mergedBy": { "login": "mattbutlerengineering", "is_bot": false }
}

$ git log --oneline -2 origin/main
e08164890 feat(hospitality): the service night on the Timeline — seating, quiet nights, errors that say something (#5269)
00251ffd4 fix: give guests a real link out of venue-not-found, not history.back() (#5283)

$ git ls-remote origin worktree-hospitality-service-ux
(empty — branch deleted)
```

**Merge commit: `e0816489007c45db91ca3c22ba9ce281432cbac7`.**

Two things worth recording about the merge:

- `--delete-branch` switched this worktree onto `main` as a side effect
  (`4bc319a07..e08164890`, fast-forward). Harmless — the worktree's branch no
  longer existed — but it means the worktree is no longer on the run's branch.
- **The known auto-close trap was checked before relying on it.** This repo's
  squash settings are `squash_message: COMMIT_MESSAGES`, so the squash commit
  body is the concatenation of all 44 commit messages, **not** the PR body.
  Scanning every commit for closing keywords found them only for
  `#5023/#5024/#5025/#5026` (already closed). Nothing auto-closed **#5035** or
  **#5037** — both were closed by hand below, then re-read to confirm rather
  than assumed.

### 8. Deploy — via CI only

No `wrangler` and no `doctl` were run by hand. The push to `main` triggered
`deploy-static.yml` (run **34648764153**), which matched `apps/hospitality/**`
and `packages/rialto/**`:

```
$ gh run view 34648764153 --json status,conclusion,jobs
Circuit Breaker Check ......... success
Detect Changes ................ success
Deploy Blocked ................ skipped      (the breaker did not trip)
Deploy Hospitality ............ success
Deploy Marketing .............. success
Deploy Rialto Web ............. success
Post-Deploy Verification ...... success
Report Deploy Health .......... success
Rollback Failed Deploys ....... skipped
```

The Worker deploy itself, quoted from the job log:

```
Run npx wrangler@3.114.17 deploy --config apps/***/wrangler.toml
 ⛅️ wrangler 3.114.17
Uploaded 112 of 112 assets
✨ Success! Uploaded 112 files (50 already uploaded) (2.80 sec)
Total Upload: 0.34 KiB / gzip: 0.25 KiB
Uploaded ***-*** (4.97 sec)
Deployed ***-*** triggers (0.09 sec)
Current Version ID: 3ae7ac04-8212-4283-964f-ddc40280ca7c
```

and the workflow's own verification step:

```
Hospitality app OK (HTTP 200)
Marketing site OK (HTTP 200)
Rialto web OK (HTTP 200)
```

**No npm publish happened**, which the brief forbids. The `Release` workflow
(run 34648764147) ran and concluded `success`, but its publishing steps are all
skipped:

```
- Check for publish credential: success
- Warn on missing publish credential: success
- Version packages: skipped
- Build rialto: skipped
- Publish to npm: SKIPPED
- Push version commit and release tags: skipped
```

### 9. Hiccup: the docs commit's own push was rejected on pre-existing `llms.txt` drift

This artifact ships as a follow-up docs commit to `main`. Its first push was
**rejected** by the pre-push gate:

```
$ git push -u origin docs/hospitality-service-ux-release
All patterns within baseline. No regressions detected.
pre-push: no generated-artifact sources changed — skipping CLI build + regen (fast path)
$ pnpm regen --check
Stale artifacts detected (1):
  [llms-txt]  llms.txt context files (.)
ERROR: generated artifacts are out of sync
husky - pre-push script failed (code 1)
error: failed to push some refs
```

Note the shape of that failure: the command's own `PUSH_EXIT` read **0** because
the push was piped — the exact masked-exit-code trap the brief warns about. The
rejection is only visible in the text. The `verify-push-sha.sh` hook fired its
usual false alarm alongside it (it reads `CLAUDE_PROJECT_DIR`, which points at
the _main_ checkout, and reported a branch from that checkout as missing).

**The drift is not this artifact's.** After `pnpm build --filter @mbe/cli... &&
pnpm regen`, the only changed file is root `llms-full.txt`, and the whole diff is
`services/agent`'s SSE catch-up route — the paging loop, `MAX_CATCHUP_EVENTS`,
and the `events:truncated` event. A grep of the regenerated diff for
`hospitality-service-ux` returns **0** matches. It reproduces identically after
rebasing onto the then-current `origin/main` (`da0a01943`), so `main`'s committed
`llms-full.txt` is stale against `main`'s own source — a condition this push
surfaced rather than created, and one that would have failed the next code PR's
`Integrity` job.

Fixed the documented way — regenerate and commit, **not** `git push --no-verify`
(which would also skip the destructive-migration and antipattern gates). The
regenerated `llms-full.txt` therefore rides along with this artifact. The
`.ux-audit` harness was parked for the push and restored immediately after, same
as in step 3.

## Post-release checks

Every check below is a live probe of production run from this machine _after_ the
deploy, not a restatement of CI's own verification.

### The deployed bundle actually changed

The only way to tell a deploy that landed from a deploy that was a no-op. A
fingerprint was captured **before** the merge, so the comparison is real:

```
                         before merge                 after deploy
main bundle    assets/index-BBZ9eZRn.js      →   assets/index-WcYMgWlZ.js
etag           "21d5200b6ee2ce46060e131f46b7772b" → "13912b9beff871f581548bab7d05a2fd"
```

The new code is being served.

### Every public surface this run touched

The run's public-facing changes are the booking widget's error copy
(`WaitlistJoinView.tsx`, `useBookingFlow.ts`, both adopting `describeApiError`).
`ManageReservationPage.tsx` was **not** changed by this run; it is probed anyway
because the brief asks for every public surface. `HomePage.tsx` did change, but
it lives at `/dashboard`, behind Auth0 — see Gaps.

| Surface                                    | HTTP | Real-browser render                                                           | CSP refusal |
| ------------------------------------------ | ---- | ----------------------------------------------------------------------------- | ----------- |
| `/hospitality/` (front door)               | 200  | Auth gate renders — “Your session ended” + “Sign back in”, global nav, footer | **none**    |
| `/hospitality/book/the-oak-table` (widget) | 200  | Branded not-found: “Venue not found” + the full guest copy + a working action | **none**    |
| `/hospitality/reservations/manage`         | 200  | “No Access Link” / “Please check the link in your confirmation email.”        | **none**    |

Probed with a real browser, not curl — **a CSP refusal is client-side only**: no
4xx, no server log, no Sentry event (CSP blocks Sentry too). Console on all three
pages carried exactly one non-application error, addressed next, plus (on the
widget) the expected `404` from the venue lookup.

### The LAN DNS sinkhole, ruled out rather than reported as an outage

The single console error on every page is
`static.cloudflareinsights.com/beacon.min.js net::ERR_CONNECTION_REFUSED`. That
is **this network**, not production:

```
$ dig +short static.cloudflareinsights.com A                  # LAN resolver
0.0.0.0
$ dig +short @1.1.1.1 static.cloudflareinsights.com A
104.16.80.73
104.16.79.73
$ curl --resolve static.cloudflareinsights.com:443:104.16.79.73 \
       -o /dev/null -w 'HTTP %{http_code}\n' https://static.cloudflareinsights.com/beacon.min.js
HTTP 200
```

`ERR_CONNECTION_REFUSED` is also the wrong shape for a CSP block, which reads
`Refused to load the script … because it violates the following Content Security
Policy directive`. The site host itself is **not** sinkholed — it resolves
identically on both resolvers (`104.21.25.32`, `172.67.222.73`), so the HTTP
probes above are trustworthy.

### The booking widget's happy path is still not live-verifiable

```
$ curl https://mattbutlerengineering.com/api/v1/venues/by-slug/the-oak-table
{"type":"about:blank","title":"Not Found","status":404,"detail":"Venue not found"}
HTTP 404
```

The endpoint is reachable and answers a well-formed RFC 7807 `ProblemDetails`
(ADR-008), but **no venue slug resolves on production** — tried `the-oak-table`,
`test-venue`, `the-grand-bistro`, `the-grand`. This is open issue **#4974**, not
a regression from this release. Consequence, stated plainly: the widget's
_not-found_ path is verified in production; its _booking_ path is not.

### Post-merge workflow state on `main`

| Workflow on `e08164890`                                                                                                                   | Result      | Reading                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deploy Static Sites`                                                                                                                     | **success** | This release's deploy.                                                                                                                                                                                      |
| `Push on main`                                                                                                                            | **success** | Full CI on the merge commit.                                                                                                                                                                                |
| `Post-Merge Reconciliation`, `Secret Scan`, `ADR check`, `E2E Screenshots`, `Deploy Storybook`, `Tracking Checklist`, `Auto-Merge Policy` | **success** | —                                                                                                                                                                                                           |
| `Post-Deploy Check`                                                                                                                       | failure     | **Known, unrelated.** Its `Post-Deploy Smoke Test` and `Playwright Smoke Tests` jobs both **passed**; only `API Surface Invariants` failed, on 2 of 7 probes — the `/public/v1` ingress defect (see below). |
| `Pulumi Deploy`                                                                                                                           | failure     | Pre-existing and blocked on a human: every `pulumi-up` on `main` fails in `refresh` on two orphaned Auth0 state records. This release touches no infrastructure.                                            |
| `Rialto Visual Regression`                                                                                                                | failure     | #5091, failing continuously on `main` since 2026-09-07.                                                                                                                                                     |
| `Rialto Web E2E`                                                                                                                          | failure     | Failing on `main` on **8 of the last 8 runs**, back to 2026-09-09 — before this branch existed.                                                                                                             |

The `Post-Deploy Check` failure, quoted so it is not mistaken for this run's:

```
2 of 7 probes failed:
  wrong-service  public-venue-lookup:reachable-at-origin
  wrong-service  public-venue-lookup:reachable-through-edge
    answered 404 as expected, but the body does not contain "Venue not found" —
    a different service is serving this path. Check the DO ingress rules and the
    edge worker's originRoutes, not the service.
    body: {"message":"Route GET:/public/v1/venues/... not found", ...}
```

That is the `/public/v1` ingress rule merged in #4565 but never **applied**,
because Pulumi is blocked — the same root cause as the `Pulumi Deploy` row. No
part of it is in this release's diff.

## Deferred findings → issues

`review.md` deferred **6 majors** and its minors, none of them a stop. A previous
run in this repo shipped with deferred findings that never became issues; that is
a recorded defect of this pipeline, so nothing was dropped here.

De-duplicated first: the full `gh issue list --state open --limit 200` plus
keyword searches for `occupiedCaption`, `rankCommandMatch`, `aria-controls`,
`role=alert`, `useFocusAfter`, `api-mocks`, `WalkInDialog`. **No duplicate
existed** — the run's earlier `[Audit] UX:` issues (#4970–#4992) are the
_out-of-cluster_ findings routed at audit time and cover none of these.

### Majors — one issue each

| #   | Finding (`review.md`)                                                                                                                                               | Issue | Labels               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------- |
| M1  | `occupiedCaption` tells the Host to turn a table the party is still sitting at — `seat-guest.ts:38-45` guards on `seated`, which `seated.ts:26` clamps at `endTime` | #5270 | `ready` `audit` `ux` |
| M2  | B3.2's “never `<body>`” does not hold in the phone viewport — `TimelineMobileView` has **zero** `data-testid`, so `blockTestId` never resolves                      | #5271 | `ready` `audit` `ux` |
| M3  | Dialog dismissal drops focus to `<body>` on all three paths, and the proposed one-line fix targets the wrong opener (there are two)                                 | #5272 | `ready` `audit` `ux` |
| M4  | The hand-written `CommandPalette` mock in `apps/rialto-web` is 26/26 green while no longer mirroring the ranking it claims to mirror                                | #5273 | `ready` `audit`      |
| M5  | `timeline.spec.ts:269` is the one spec in this run without the `role="alert"` collision guard its four siblings carry                                               | #5274 | `ready` `audit`      |
| M6  | The E2E mock re-dates the day but not the clock, so blocks fall outside the grid west of UTC−7 — and it fails as a _pass_                                           | #5275 | `ready` `audit`      |

**M1 and M2 are the two user-facing defects in code this run shipped.** Per the
brief, both issue bodies carry file:line, the source excerpt, and a step-by-step
reproduction.

### Minors

| #      | Finding (`review.md`)                                                                                                                                                                                                                           | Issue | Labels               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------- |
| m1     | Briefing's segment labels and its buckets disagree for 20:00–20:59 — a signed-off `ux.md:89` decision, filed so it is decided rather than inherited                                                                                             | #5276 | `ready` `audit` `ux` |
| m2     | `ReservationSheet.tsx:156` points `aria-controls` at an id that does not exist while collapsed                                                                                                                                                  | #5277 | `ready` `audit` `ux` |
| m3     | Six new E2E error mocks send the retired pre-ADR-008 `{"error":…}` envelope                                                                                                                                                                     | #5278 | `ready` `audit`      |
| m4–m8  | `e2e-selector-drift-reviewer`'s five remaining minors — unscoped `getByText("Live")`; a row-name filter matching every row; module-load vs request-time day; the by-id handler reading the raw fixture; the unexercised Seat Guest success path | #5279 | `ready` `audit`      |
| m9–m10 | `rialto-prop-drift-detector`'s two `CommandPalette` contract gaps — `rankCommandMatch` contradicts its own JSDoc (no trim, `0` not `null`); the new ArrowDown + Enter test is vacuous                                                           | #5280 | `ready` `audit`      |

Two groups were bundled rather than split further because each is one reviewer's
set of same-class findings in the same files, wanting a single pass — the brief's
“group tightly-related minors” allowance. All ten minor findings are enumerated
**individually inside** #5279 and #5280, so none is silently dropped.

**A count discrepancy, recorded rather than smoothed over.** `review.md`'s
verdict says “six majors and **eight** minors”, but its four `### Minor` headings
enumerate **ten** distinct minor findings (2 general + 1 `adr-compliance` + 5
`e2e-selector-drift` + 2 `rialto-prop-drift`), and its own specialist table on
line 45-47 adds up to the same ten. The verdict line appears to count the last
heading's “five further E2E drifts” while omitting its “two rialto contract
gaps”. Ship filed **every finding under every Minor heading**, so the mandate is
satisfied on either count — but the artifact should not pretend the two numbers
agree.

**11 issues filed: #5270–#5280.** Review's recommended routing is preserved:
#5274, #5275 and #5278 (the three E2E fixes) with #5271 and #5272 (the two focus
fixes) make one Implement pass; #5270 and #5273 make a second, separable one.

## Issues closed

| Issue | Why                                                  | Confirmed                                                     |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------- |
| #5035 | Work item 15/17 complete and shipped in #5269        | `state=CLOSED reason=COMPLETED closedAt=2026-09-11T21:20:08Z` |
| #5037 | Tracking parent — all 17 items complete, run shipped | see below                                                     |

Neither closed itself. Both were closed with a completion comment naming PR
#5269 and merge commit `e08164890`, then **re-read** to confirm the state
actually changed.

## Gaps

Recorded, not implied away.

1. **No production evidence exists for the authenticated dashboard.** There are
   **no Auth0 E2E credentials** in this environment — open on Matt since
   **2026-08-31**. Every surface this run's work primarily targets —
   `/timeline`, the Briefing, the waitlist, `/reservations`, `/dashboard` — sits
   behind the Auth0 gate, and the front-door probe above gets exactly as far as
   “Your session ended”. The dashboard's behaviour in production is **unverified
   by this release.** What _is_ verified: 2287 hospitality unit tests, 101
   committed E2E specs against a synthetic OIDC session, and a green CI
   `Hospitality E2E` job — none of which is production.
2. **The booking widget's happy path is unverified in production** — no venue
   slug resolves (#4974). Only the not-found path was exercised live.
3. **Two advisory visual-regression checks are red**, both pre-existing on `main`
   (#5119, #5091). This release neither caused nor fixed them, and merging with
   them red continues an existing main-red streak rather than starting one.
4. **`Post-Deploy Check`, `Pulumi Deploy`, `Rialto Visual Regression` and
   `Rialto Web E2E` are red on `main` after this merge** — all four established
   above as pre-existing conditions with causes outside this diff. The
   green-main policy is nonetheless not satisfied on `main` today, and that is a
   fact this release inherits rather than one it resolves.
5. **`realtime-collaboration.spec.ts`** remains a characterised pre-existing
   harness flake. It passed in CI on this PR; it is not fixed, only not
   blocking.
6. **The `.ux-audit` harness stays outside the repo.** It is what tripped the
   antipattern ratchet locally, and keeping it git-excluded means the ratchet's
   local verdict will keep disagreeing with CI's for anyone working in this
   worktree until the directory is removed.

## Outcome

**Shipped, with three hiccups, all recorded above.**

PR #5269 merged to `main` as `e0816489007c45db91ca3c22ba9ce281432cbac7` with
`CI Gate` — the sole required check — green on head `c874f8bff`, and
`deploy-static.yml` deployed the hospitality Worker from it
(Version ID `3ae7ac04-8212-4283-964f-ddc40280ca7c`). The deploy is confirmed by a
changed bundle fingerprint, not assumed. All three public surfaces return 200 and
render correctly in a real browser with no CSP refusal.

The hiccups were an antipattern-ratchet false positive caused by a
git-excluded harness (diagnosed, proved, worked around without touching the
baseline or skipping hooks) and a genuine defect this run introduced — two CSS
custom properties set only inline, which the repo's phantom-token guard correctly
flagged and which no earlier gate could have caught; and — on this artifact's
own push — a pre-existing root `llms.txt` drift belonging to `services/agent`,
which the gate surfaced and which was repaired rather than bypassed. None of the
three was worked around with `--no-verify` or a baseline edit.

What this release does **not** establish is the authenticated dashboard's
behaviour in production. That is gap 1 above and it is the largest one.

Next stage: **Operate**.
