---
stage: ship
run: feature:hospitality-above-fold-usability
date: 2026-10-18
outcome: released
released-at: 2026-10-15
released-commits:
  - 5e9fd4333b94f079340e742735fc2d2aacb7baa7 (squash of PR #6541, conductor batch b20261013, merged 2026-10-15T05:34:37Z)
  - f72fb772fb72f8ba10f4fc1713c048a80e537167 (squash of PR #6681, Settings primary-content tag, merged 2026-10-15T06:01:21Z)
  - b652a6723dfe418ec3c035163a4a4df961687ea1 (squash of PR #6705, PageHeader spacing + 312px ratchet, merged 2026-10-15T14:40:56Z)
preflight-head: c21116a50 (branch docs/above-fold-close, cut from origin/main; carries all three merges plus later main commits)
assumptions:
  - "This Ship stage records a release that already happened (brief § Resume 2026-10-18). The Conductor merged #6541, #6681 and #6705 to main on 2026-10-15, and Deploy Static Sites deployed them. No new release action was taken here: no merge, deploy, tag, publish, push, PR or issue."
  - "The repo's Ship pre-flight hook (`local-ci-precheck`) ran against this branch's head, c21116a50, not against the three merge SHAs. The worktree is cut from origin/main, and the hook is defined against the final branch head. Each merge's own gate is recorded from CI (Release log 1-3)."
  - "Versioning and tagging: the hospitality app is deployed per push to main, with no version or tag. The three diffs touch no published package (review: no `packages/rialto` change), so no changeset, version bump or tag applies. This is the repo's own convention; no default was needed."
  - "Rollback default: the preferred rollback is a path-scoped reverse patch of the three product CSS changes, not a whole-commit `git revert`. A whole revert of 5e9fd4333 conflicts (measured below), and a whole revert of b652a6723 would also roll back this run's docs. The CSS patch is the smallest undo that restores the pre-release layout. It is this stage's choice, made without live Owner input."
  - "The two-way door call counts the whole-commit revert's conflicts as effort, not risk. The release is CSS spacing, `data-testid` attributes and tests. It has no data, schema or public interface."
  - "Follow-ups are listed, not filed (brief § Tracker: no tracker interaction). Proposed `docs/backlog.md` seeds are given as text for Operate to append at run close. This stage writes no backlog line."
  - "Post-release checks are bundle-level only. Every touched page is behind Auth0, no E2E credentials exist, and no login was attempted. The rendered pages are evidenced by the Linux CI baselines and the fold-budget spec, not by a production render."
---

# Release: hospitality above-the-fold usability (#6367: PRs #6541, #6681, #6705)

The release already happened. The Conductor merged three PRs to `main` on
2026-10-15, and each push deployed the hospitality Worker within about ten
minutes. Together they remove 40px of wasted space above the content on every
dashboard page (56px on Timeline), tag each page's primary region, and add a
fold-budget E2E guard. This artifact records the pre-flight, the deploy evidence,
the post-release checks and the rollback plan. This stage released nothing.

## Pre-flight

- [x] **Verification green.** `verification.md` (2026-10-15) passes SC-1, SC-2
      and SC-4, and lists no failures. SC-3 (axe at all impacts) is **not run**,
      because it needs E2E credentials. It is recorded as an evidence gap, not a
      failure. `review.md` (2026-10-18, `33ba20c49`) returns
      `pass-with-findings`, with **no critical** finding, two majors and two
      minors. The Owner decided both majors on 2026-10-18 (brief § Review
      decisions). Major 1 is live in production, with a fix pending (see Live
      production defect). Major 2 is deferred to a seed (see Follow-ups).
      Nothing here routes back to Implement.
- [x] **No secrets in the diff; target config present.** `Secret Scan` on
      each merge SHA: run 38687529041 (`5e9fd4333`), 38689991607 (`f72fb772f`)
      and 38753568996 (`b652a6723`), all `success`. Each PR's own
      `Gitleaks Secret Scan` check was `success`. The diffs are CSS,
      `data-testid` attributes, tests and docs. They add no environment
      variable, secret or binding, so the hospitality Worker needs no new
      configuration.
- [x] **Migrations/data changes have a tested forward path.** None exist. The
      diffs touch only `apps/hospitality/**` and
      `docs/features/hospitality-above-fold-usability/**` (review § Scope).
      They change no `*.sql`, `schema.prisma` or API file.
- [x] **ADRs.** The run added no ADR. The reserved ADR-88..90 are unused, and
      review found no decision that needs an ADR.
- [x] **Rollback plan concrete.** See below. It includes the measured finding
      that a whole revert of `5e9fd4333` conflicts.
- [x] **Launch brief hook.**
      `python3 <ship skill>/../../launch_demo.py config` printed `NONE` and
      `launch-demo: 0 problem(s)`, exit 0. The repo has no launch-demo config,
      so nothing was run and nothing was written.
- [x] **Repo Ship pre-flight hook (`local-ci-precheck`) against the final
      head (c21116a50).** The steps in `.claude/skills/local-ci-precheck/SKILL.md`
      were run directly on Node v22.22.3 (`.nvmrc`: 22). Every lane exited 0.
      See Release log 6. The hook ran after the release, so it confirms that
      today's `main` (plus this run's docs) is clean. It is not a gate the merges
      passed through.

## Rollback plan

Door: two-way. The release is hospitality CSS spacing, `data-testid`
attributes and tests. It adds no schema, data, published package or public
interface. Undoing the three CSS edits restores the old layout, and a revert PR
deploys through CI like any other change. The whole-commit revert of
`5e9fd4333` conflicts, so the door is two-way but no longer a one-command
revert.

Blast radius: the hospitality dashboard only. If the call is wrong, every
DashboardLayout page shows its content 40px lower (56px on Timeline), which is
the pre-release state. No data, API, other app or service is touched.

**Measured 2026-10-18 on c21116a50**
(`git revert --no-commit <c>` in this worktree, then `git revert --abort` and
`git reset --hard`; `git status --porcelain` printed nothing afterwards):

| Revert                                                | Result                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b652a6723` alone                                     | applies cleanly (exit 0). It also reverts this run's `audit.md`, `breakdown.md` and `verification.md`, so restore those from `HEAD` before committing.                                                                                                                                                     |
| `f72fb772f` alone                                     | applies cleanly (exit 0).                                                                                                                                                                                                                                                                                  |
| `5e9fd4333` alone                                     | **conflicts** (exit 1): `UD fold-budget.spec.ts`; `UU` `FloorPlansPage.tsx`, `GuestsPage.tsx`, `HomePage.tsx`, `ReservationsPage.tsx`, `WaitlistPage.tsx`; `UD` on five of this run's docs. The page conflicts come from the localization commits since (#6708, #6706, #6728, #6727, #6730, #6739, #6741). |
| all three, newest first                               | **conflicts** (exit 1): the same five page files, plus `UD` on `autorun-brief.md` and `review.md`.                                                                                                                                                                                                         |
| path-scoped reverse patch of the three CSS edits only | `git apply --check` exit 0.                                                                                                                                                                                                                                                                                |

Deploys go through GitHub Actions only. Never run `wrangler` or `doctl` by
hand.

```
# Option A — restore the old layout, keep the landmarks and the guard (preferred)
git fetch origin main
git switch -c revert/above-fold-layout origin/main
{ git diff b652a6723 b652a6723^ -- \
    apps/hospitality/src/components/PageHeader.module.css \
    apps/hospitality/src/pages/TimelinePage.module.css
  git diff 5e9fd4333 5e9fd4333^ -- \
    apps/hospitality/src/components/DashboardLayout.module.css
} | git apply
#   Restores: .content padding-block-start: var(--rialto-space-xl);
#   PageHeader margin-block-start: lg and margin-block-end: lg;
#   Timeline .headerTop margin-block-end: md.
#   Then update the CSS-text unit tests that pin the new values
#   (DashboardLayout.test.tsx, PageHeader.test.tsx) and either relax or remove
#   the < 312px ratchet in e2e/fold-budget.spec.ts. Timeline returns to ~353px,
#   which fails that ratchet.
pnpm --dir apps/hospitality lint && pnpm --dir apps/hospitality typecheck && pnpm --dir apps/hospitality test
git commit -m "revert(hospitality): restore pre-#6367 page spacing"   # then push and open a PR
# Visual baselines move on every page. Regenerate them from the Linux CI
# artifact (visual-actuals-replica-a), never from macOS (gotchas § CI).
# Merge on a green CI Gate. The push to main triggers Deploy Static Sites.
# Confirm the JOB conclusion "Deploy Hospitality" = success, not the rollup.

# Option B — full removal (landmarks, guard and all)
git revert --no-commit b652a6723 f72fb772f 5e9fd4333
#   Resolve the five page conflicts toward origin/main's localized code, minus
#   the data-testid="primary-content" wrapper. Keep this run's docs as they are
#   (git checkout HEAD -- docs/features/hospitality-above-fold-usability/).
#   Then follow the same test, baseline and PR steps as Option A.

# Option C — emergency only: roll the Worker back. This discards every
# hospitality deploy since 2026-10-15 (localization included). No CI workflow
# does this on demand. Deploy Static Sites runs `wrangler rollback` only inside
# its own job, after a failed post-deploy verification. A manual rollback breaks
# the CI-only deploy rule and needs Matt's explicit say-so.

# Verify after A or B
curl -s https://mattbutlerengineering.com/hospitality/ | grep -oE 'assets/index-[^"]+\.js'
#   then find the PageHeader-*.css and DashboardLayout-*.css chunks: the header
#   rule should carry margin-block-start again, and the .content rule should carry
#   padding-block-start:var(--rialto-space-xl).
```

## Release log

1. **Merges.** All three PRs were squash-merged by `mattbutlerengineering`
   (the Conductor's merge turns). PR-head checks, read from
   `gh api repos/…/commits/<head>/check-runs`:

   | PR    | Head        | Merged (UTC)         | Merge commit | `CI Gate` | `Hospitality E2E` | `Visual Regression (hospitality)` |
   | ----- | ----------- | -------------------- | ------------ | --------- | ----------------- | --------------------------------- |
   | #6541 | `2b3d2580a` | 2026-10-15T05:34:37Z | `5e9fd4333`  | success   | **failure**       | failure (advisory)                |
   | #6681 | `6618fa9e9` | 2026-10-15T06:01:21Z | `f72fb772f`  | success   | success           | failure (advisory)                |
   | #6705 | `b42c53172` | 2026-10-15T14:40:56Z | `b652a6723`  | success   | success           | cancelled                         |

   `CI Gate` is the only required check on `main` (gotchas § CI).
   #6541 merged with its own new fold spec red on Settings. Review's minor m-1
   records this, and #6681 fixed it 27 minutes later.

2. **CI on the merge SHAs.**
   - `5e9fd4333`: `CI` run 38687529339, `CI Gate` job `success`. Commit status
     `combined=success` (`CI Gate:success`, `codecov/patch:success`).
   - `f72fb772f`: `CI` run 38689991435 was **cancelled** (superseded on
     `main`), so this SHA has no commit status (`combined=pending`, no
     contexts). The first later `main` CI to complete was run 38700040027 on
     `244ec3330`, which contains `f72fb772f`. Its `CI Gate` job was `success`,
     with commit status `combined=success`.
   - `b652a6723`: `CI` run 38753569117 was **cancelled** (superseded), and the
     commit status is `combined=pending` with no contexts. The next commit,
     `a262b52f3` (#6693), got `CI` run 38753668450: `CI Gate` job `success`,
     commit status `combined=success`.
   - Hiccup, for the next release: two of the three merge SHAs never got a
     main-push CI verdict of their own. Their trees were gated by the PR CI
     (row 1) and by the next completed main CI.

3. **Advisory reds on the merge SHAs.** `Apps Visual Regression` was `failure`
   on all three: runs 38687529149, 38689991394 and 38753569060. PageHeader
   spacing moves every page's snapshot, as verification predicted. #6709
   (`99b14fd00`) regenerated 31 of 38 hospitality baselines from the Linux CI
   artifact, and #7044 (`c4b96e7c2`, "refresh stale hospitality + marketing visual baselines") refreshed stale ones later. `E2E Screenshots` run
   38687529251 on `5e9fd4333` was `failure` (job `Capture E2E Screenshots`). It
   was `success` on the other two SHAs (38689991425 and 38753569135). Neither
   check is required.

4. **Deploys** (`Deploy Static Sites`, `deploy-static.yml`, found with
   `gh run list --workflow deploy-static.yml --branch main --json databaseId,headSha,conclusion,createdAt`
   filtered by `headSha` in jq; job levels from `gh run view <id> --json jobs`):
   - **`5e9fd4333` → run 38687529063** (05:34:40Z → 05:42:55Z, `success`):
     `Circuit Breaker Check` success · `Detect Changes` success ·
     `Deploy Blocked` skipped (breaker closed) · **`Deploy Hospitality`
     success** (05:38:15Z) · `Deploy Rialto Web` skipped · `Deploy Marketing`
     skipped · **`Post-Deploy Verification` success** · `Rollback Failed
Deploys` skipped · `Report Deploy Health` success.
   - **`f72fb772f` → run 38689991472** (06:01:25Z → 06:13:02Z, `success`):
     `Circuit Breaker Check` success · `Detect Changes` success ·
     `Deploy Blocked` skipped · **`Deploy Hospitality` success** (06:10:51Z) ·
     `Deploy Marketing` skipped · `Deploy Rialto Web` skipped ·
     **`Post-Deploy Verification` success** · `Rollback Failed Deploys`
     skipped · `Report Deploy Health` success.
   - **`b652a6723` → run 38753569276 was `cancelled`**
     (14:41:00Z → 14:41:42Z, `jobs: []`). It was superseded before any job
     ran. **It was deployed by run 38753668370** on the next main commit,
     `a262b52f3` (#6693, 14:41:41Z → 14:51:10Z, `success`):
     `Circuit Breaker Check` success · `Detect Changes` success ·
     `Deploy Blocked` skipped · **`Deploy Hospitality` success** (14:49:25Z) ·
     `Deploy Marketing` success · `Deploy Rialto Web` success ·
     **`Post-Deploy Verification` success** · `Rollback Failed Deploys`
     skipped · `Report Deploy Health` success. `a262b52f3` is `b652a6723`'s
     direct child, so this run's build contains #6705. Run 38759380044 on
     `99b14fd00` (#6709 baselines, 15:20Z) redeployed it with
     `Deploy Hospitality` success.
   - None of these is a skipped-job "success" (gotchas § Deploy):
     `Deploy Hospitality` itself ran and succeeded in each deploying run.

5. **Later deploys.** Hospitality has been redeployed many times since. The
   latest is run 39136943793 on `c4b96e7c2` (2026-10-18T14:39Z), with
   `Deploy Hospitality` success and `Post-Deploy Verification` success. The
   post-release checks below read that build.

6. **Ship pre-flight hook** (`local-ci-precheck`), run 2026-10-18 against
   `c21116a504eeb4d6d98a017ff728834bcd012a3b` on node v22.22.3. Every lane
   passed:

   ```
   install exit=0                                  (pnpm install --frozen-lockfile)
   [lint]       Tasks: 52 successful, 52 total     (0 errors; warnings only)
   [typecheck]  Tasks: 52 successful, 52 total
   [arch-audit] Checking codebase against 1 active ADRs...
                ✅ No architectural violations detected.
                ✅ All external dependencies are consistent across the monorepo.
   [drift]      dep-graph regen: git diff --exit-code clean; 27 × "llms.txt is in sync", 0 stale
   arch exit=0 / drift exit=0 / lint exit=0 / typecheck exit=0
   ```

   `git status --porcelain` printed nothing afterwards, so the tree was unchanged.

## Post-release checks

These are read-only, unauthenticated probes. No login was attempted.

- **DNS.** The LAN resolver and `dig @1.1.1.1` both return
  `172.67.222.73` / `104.21.25.32`, so there is no sinkhole artefact.
- **Shell.** `curl https://mattbutlerengineering.com/hospitality/` returns
  `200` (4,014 bytes). The entry chunk is `index-DUnJzRwo.js` (200,
  122,015 bytes).
- **#6541's layout lever is live.** `DashboardLayout-ICwKiHWw.css`:
  `._content_196f0_115{min-width:0;min-height:0;padding:var(--rialto-space-lg);outline:none;flex:1;overflow-y:auto}`.
  There is no `padding-block-start:var(--rialto-space-xl)`.
- **#6705's PageHeader change is live.** `PageHeader-C250u1LD.css`:
  `._header_1fhbj_3{margin-block-end:var(--rialto-space-md)}`. There is no
  `margin-block-start`, which is also Major 1's cause (below).
  `TimelinePage-vyXf4dXp.css`: the desktop `._headerTop_1kl4t_16` rule carries
  no `margin-block-end`. Only the `@media (width<=768px)` rule keeps `xs`.
- **Landmarks are live.** `data-testid="primary-content"` appears once each in
  the production chunks for Home, Reservations, Guests, Timeline, Floor
  Plans, Waitlist, Profile and Settings. In `SettingsPage-DSjdZoo0.js` it sits
  on the layout `div` (`className:A.layout,"data-testid":"primary-content"`),
  which is #6681's fix.
- **Not reachable on production, and recorded as gaps rather than
  estimated:**
  - Every touched page renders only behind Auth0, and no E2E credentials
    exist. The rendered fold positions on production are unproven.
  - The evidence for them is the served CSS above, the Linux CI 1280×720
    baselines (#6709, #7044) and verification's local fold-budget run
    (Timeline 297.1px, every other key page 187–235px).
- **Intake issue to close:** none. This is a feature run. #6367 is owned by
  the Conductor batch and was closed by #6705 at 2026-10-15T14:40:58Z.

## Live production defect: page titles flush against the breadcrumb bar (review Major 1)

- **What:** #6705 removed `PageHeader`'s `margin-block-start`. It was the only
  space between the breadcrumb bar and the page title, because `.content`'s
  top padding is spent above the bar, not below it. On the 9 DashboardLayout
  pages that render `PageHeader` with no padding of their own (Home,
  Reservations, Guests, Waitlist, Profile, Settings, Admin, Briefing, Chat),
  the H1 now starts at the bar's bottom border. This contradicts PRD-1's
  non-goal ("Do not flatten the design").
- **Live:** yes. The production `PageHeader-C250u1LD.css` rule above has no
  top margin. The code comment that justifies it
  (`PageHeader.module.css:1-2`) is false.
- **Status:** the **Owner chose "Fix: 8px gap"** (2026-10-18, live). A
  follow-up PR, **outside this run**, sets `PageHeader`
  `margin-block-start: var(--rialto-space-sm)`, keeps the 312px Timeline
  ratchet unchanged (Timeline is about 305px with 8px), and regenerates
  visual baselines from the Linux CI artifact only. **That PR is pending.**
  Ship records the defect and does not block on it.

## Follow-ups

None were filed. Proposed seeds, in the `docs/backlog.md` line format, for
Operate to append at run close:

1. **The fold guard measures status-chrome wrappers, not data** (review
   Major 2; Owner: "Defer to seed").
   `- Move the hospitality fold-budget primary-content markers from the page wrappers onto the table/data regions (Reservations table, Guests table, Waitlist list, etc.) per architecture.md § Mechanism 1, then re-measure every route and reset the 312px ratchet from CI numbers (from: feature:hospitality-above-fold-usability)`
2. **Floor Plans pads its content twice** (review minor, deferred). Its
   content starts at 235.1px against 187–211px elsewhere.
   `- Drop FloorPlansPage.module.css .container's padding (it doubles DashboardLayout .content's lg padding; content starts at 235px vs 187-211 elsewhere) and regenerate its Linux baselines (from: feature:hospitality-above-fold-usability)`
3. **SC-3 (axe at all impacts on the touched pages) has never run** (review
   minor, deferred to Operate). Operate's minimum signal already reads the
   ui-quality loop's daily judgments for these pages. A seed is only needed if
   that signal is still empty at run close.
   `- Extend apps/hospitality/e2e/a11y.test.ts beyond the home route and the critical/serious filter so the dashboard pages are axe-scanned at every impact (from: feature:hospitality-above-fold-usability)`
4. **Suspicion S-1 (not a finding): the fold guard runs en-US only, and
   Timeline's date row can wrap in longer locales** after #6741. It is
   unproven. Settle it by running `fold-budget.spec.ts` with
   `mbe-hospitality-locale` set to `fr-CA` before seeding anything.
5. **Two of three merge SHAs never got their own main CI verdict, and one
   never got its own deploy** (Release log 2 and 4). Concurrency cancelled
   them, and the next commit carried them. This is normal for the train, and
   it is noted for the next record. It is not a seed.

## For human review

- **Major 1 fix PR** (8px `PageHeader` top margin) is the one open item. The
  defect is live on 9 pages until it merges.
- **The rollback is no longer a one-command revert.** Option A (the
  path-scoped CSS patch) applies cleanly today. A whole-commit revert of
  `5e9fd4333` needs five page conflicts resolved against the localization
  work.
- **No observed human user yet.** The production evidence is bundle-level
  only. Operate's minimum signal is one ui-quality-loop judgment of the
  touched pages dated after 2026-10-15, plus one Owner look at a real
  hospitality page at 1280×720.

## Outcome

Shipped with hiccups on 2026-10-15. All three merges passed `CI Gate`. Each
reached production through a `Deploy Hospitality` job that succeeded at job
level, with post-deploy verification passing. #6705's own deploy run was
cancelled, and the next commit's run 38753668370 deployed it. The hiccups:
#6541 merged with its new spec red (fixed by #6681); two merge SHAs had their
main CI cancelled; the advisory visual-regression job went red (baselines
since regenerated by #6709 and #7044). One live defect, review Major 1, ships
with an Owner-chosen fix pending. Next stage: Operate.
