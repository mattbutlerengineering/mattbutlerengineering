---
stage: ship
run: feature:remembered-on-arrival
date: 2026-10-16
released-commit: f3725682c31d54298f1162b849158bdd27782917 (squash of PR #6355, merged 2026-10-12T00:59:29Z)
preflight-head: 0bc8f0c27 (branch docs/remembered-on-arrival-close, cut from origin/main; carries f3725682c plus later main commits)
assumptions:
  - 'This Ship stage records a release that already happened (brief § Resume 2026-10-16). PR #6355 merged under the brief''s release authorization (answer 7, "Merge on green"), and Deploy Static Sites run 38190128781 deployed it. No new release action was taken here: no deploy, merge, push, tag, publish or issue.'
  - "The repo's Ship pre-flight hook (`local-ci-precheck`) ran against this branch's head, 0bc8f0c27, not against f3725682c. The brief's worktree is cut from origin/main, and the hook is defined against the final branch head. f3725682c's own gate is recorded from CI on that SHA (Release log 2-3)."
  - "Versioning and tagging: the hospitality app is deployed per push to main, with no version or tag. The run touched no published package (verification SC10), so no changeset, version bump or tag applies. The convention is the repo's own; no default was needed."
  - "The two-way door call below counts a hand-resolved revert as two-way. A clean `git revert f3725682c` no longer applies (Rollback plan), but the change is UI copy and layout only, with no data, schema or public interface, so undoing it costs effort, not data."
  - "Follow-ups are listed, not filed (brief: no issue creation). Proposed `docs/backlog.md` seeds are given as text in Follow-ups for Operate to append at run close, per the seed-backlog convention. This stage writes no backlog line."
---

# Release: Remembered on arrival (PR #6355, `f3725682c`)

The release already happened. PR #6355 merged on 2026-10-12. The push to
`main` deployed the hospitality Worker in about two minutes. This artifact
records the pre-flight, the deploy evidence, the post-release checks and the
rollback plan. Nothing below was released by this stage.

## Pre-flight

- [x] **Verification green.** `verification.md` (2026-10-16): 11 of 12 PRD
      criteria pass. SC11 passes with a recorded evidence gap. SC4 **fails as
      written**. That failure is drift after merge, caused by the
      localization series (#6735), not by #6355. A passing test pins the
      wording, and it routes to a human decision, not back to Implement
      (see Pending Owner decision). Review (`review.md`) found no critical
      and no major findings, and four minors, all deferred. No unresolved
      failure blocks this record. The release had shipped before either
      artifact existed (brief § Resume). The brief says a critical finding
      would be reported as a live production defect, and there are none.
- [x] **No secrets in the diff; target config present.** `Secret Scan`
      (Gitleaks) on `f3725682c`: run 38190128860 `success`. The PR's own
      `Gitleaks Secret Scan` passed too. The diff adds no environment
      variable, secret or binding: 44 files, all under `apps/hospitality/`,
      `docs/` and the llms pairs (verification SC10). The hospitality Worker
      needs no new configuration.
- [x] **Migrations/data changes have a tested forward path.** None exist.
      `git show --name-only f3725682c` lists no `*.sql`, `schema.prisma` or
      `packages/types` file. The feature reads the existing
      `Reservation.notes` field and writes nothing.
- [x] **ADRs.** The run added no ADR. No `docs/adr/` path is in the diff, and
      review found no decision that passes the ADR test.
- [x] **Rollback plan concrete.** See below. It includes the finding that a
      plain `git revert` now conflicts.
- [x] **Launch brief hook.**
      `python3 <ship skill>/../../launch_demo.py config` printed `NONE` and
      `launch-demo: 0 problem(s)`, exit 0. The repo has no launch-demo
      config, so nothing was run and nothing was written.
- [x] **Repo Ship pre-flight hook (`local-ci-precheck`) against the final
      head (0bc8f0c27).** The steps in `.claude/skills/local-ci-precheck/SKILL.md`
      were run directly on Node v22.22.3 (`.nvmrc` 22). All four lanes are
      green: `install exit=0`, `lint exit=0`, `typecheck exit=0`,
      `arch exit=0`, `drift exit=0`. See Release log 6. The hook ran after
      the release, because the release predates this stage. It confirms
      that today's `main` is clean. It is not a gate the merge passed
      through. The merge's own gate is CI on `f3725682c` (Release log 2).

## Rollback plan

Door: two-way — the change is hospitality UI copy and layout only. It adds no
schema, data, published package or public interface. A revert PR undoes it,
and so does the Worker's previous version. The door is two-way, but it no
longer swings freely: a plain `git revert f3725682c` conflicts (see below).

Blast radius: the hospitality app only. That means the booking widget's
confirmation view, the public manage-reservation page, the host Timeline
ticket (sidebar, phone drawer, tablet sheet) and the Briefing card. If the
call is wrong, guests and hosts see the Special Requests block wrong or not
at all. No other app, service or data is touched. Bookings are written by
`reservations-api`, which this release did not deploy.

**Measured 2026-10-16:**
`git merge-tree --write-tree --merge-base f3725682c HEAD f3725682c^` (the
revert, simulated on 0bc8f0c27) reports `CONFLICT` in 14 paths:
`ConfirmationView.tsx` and its test, `GuestDetailsForm.tsx`,
`ReservationSheet.tsx`, `BriefingPage.tsx`, `ManageReservationPage.tsx`,
`TimelinePage.tsx`, `confirmation-copy.ts` and its test (modify/delete), the
four llms files, and `docs/backlog.md`. The cause is 57 later commits under
`apps/hospitality/`, chiefly the localization series (#6706, #6721, #6728,
#6735, #6739). Those commits rewrote the same blocks and moved the copy into
`i18n/catalogs/*.json`.

Deploys go through GitHub Actions only. Never run `wrangler` or `doctl` by
hand.

```
# Option A — undo the feature, keep everything after it (preferred)
git fetch origin main
git switch -c revert/remembered-on-arrival origin/main
git revert --no-commit f3725682c
#   Resolve each conflict toward origin/main's current code minus the
#   Special Requests blocks:
#   - Remove the Special Requests group from ConfirmationView,
#     ManageReservationPage, BriefingPage and the Timeline ticket
#     (SpecialRequestsTicket usage in ReservationDetails / ReservationSheet).
#   - Restore the staff note's pre-#6355 placement in ReservationDetails/Sheet.
#   - KEEP the honest contact line ("No confirmation email or text is sent…").
#     Reverting it would put back the false "A confirmation has been sent"
#     line, which the brief's answer 13 removed on purpose.
#   - Keep the i18n catalog keys that #6735 owns. Remove only the
#     bookingWidget.specialRequests.* uses, or the keys too if nothing reads them.
pnpm build --filter @mbe/cli... && pnpm regen     # llms pairs
pnpm --dir apps/hospitality lint && pnpm --dir apps/hospitality typecheck && pnpm --dir apps/hospitality test
git commit -m "revert: remembered on arrival (#6355)"   # and push, open PR
gh pr create --base main --title "revert: remembered on arrival (#6355)" ...
# Merge on a green CI Gate. The push to main triggers Deploy Static Sites
# (path filter apps/hospitality/**). Confirm the run's JOB conclusion
# "Deploy Hospitality" = success, not the workflow rollup.

# Option B — emergency only: roll the Worker back to the version before
# f3725682c. That version is the one Deploy Static Sites built for the main
# commit before it. This also discards every hospitality deploy since
# 2026-10-12, including the localization series, so it is NOT the default.
# No CI workflow does this on demand today. Deploy Static Sites runs
# `wrangler rollback` only inside its own job, after a failed post-deploy
# verification. A manual wrangler rollback breaks the CI-only deploy rule,
# so it needs Matt's explicit say-so.

# Verify after either option
curl -s https://mattbutlerengineering.com/hospitality/ | grep -oE 'assets/index-[^"]+\.js'
#   then fetch that chunk and confirm "Noted. It's on your reservation for the team." is absent
#   and "A confirmation has been sent to" is still absent.
```

## Release log

1. **Merge.** PR #6355
   (`feat(hospitality): remembered on arrival — guest Special Requests said back on confirmation, manage page and host ticket`),
   head `eb6687bb2`, was squash-merged by `mattbutlerengineering` at
   2026-10-12T00:59:29Z as `f3725682c31d54298f1162b849158bdd27782917`, under
   the brief's answer 7, "Merge on green". The PR's rollup had `CI Gate`
   SUCCESS (both check run and commit status), `Hospitality E2E` SUCCESS and
   `Visual Regression (hospitality)` FAILURE (advisory; see 3).
2. **CI on the merge SHA.** `CI` run 38190128798 (push, `main`), job level:
   `Prepare`, `Lint`, `Typecheck`, `Build`, `Test (Node 22)`, `Integrity`,
   `Architecture Audit`, `AI Antipattern Ratchet`, `Dependency Sync`,
   `Validate Migrations`, `RLS Integration`, `Dockerfile Lint`, the four
   container scans, `Report CI Health` and **`CI Gate`**, all `success`.
   `Docs Formatting`, `Migration Dry-Run`, `Visual Tolerance Change Check` and
   `Accessibility AI Attribution` were `skipped` (conditional jobs). The
   commit status on `f3725682c` is `state=success`, with `CI Gate: success`
   and `codecov/patch: success`. Branch protection on `main` requires only
   `CI Gate` (`strict: false`, measured 2026-10-16). Also on that SHA:
   `Secret Scan`, `ADR check`, `Release`, `E2E Screenshots`,
   `Post-Merge Reconciliation`, `Push on main` and `Auto-Merge Policy`, all
   `success`.
   - Hiccup, for the next release: `gh run list --branch main --limit 1000`
     filtered by `headSha` returned **no runs** for this SHA. The
     reliable lookup was the REST API:
     `gh api "repos/mattbutlerengineering/mattbutlerengineering/actions/runs?head_sha=f3725682c31d54298f1162b849158bdd27782917"`.
     This is also why verification could not find the CI run.
3. **Advisory red on the merge SHA.** `Apps Visual Regression` run
   38190128757: `Visual Regression (hospitality)` = `failure`
   (`home@1280x720.png`, `admin@1280x720.png`, `admin@375x812.png`,
   `booking_widget@1280x720.png`, …). The check is not required. It is also
   pre-existing main drift, not this change. This workflow had been red on
   every main push since `30f6f2128` (2026-10-11T17:50Z), apart from a single
   green at `1a2e42df6`, and it went red again at `73dc06091` and `a86c3a4bd`
   before #6355 merged. It stayed red until #6870 (`6e1d85903`,
   "regenerate visual baselines (28 snapshots)") turned it green on
   2026-10-17T01:50Z.
4. **Deploy.** `Deploy Static Sites` run 38190128781 (push,
   headSha `f3725682c31d…`, 2026-10-12T00:59:32Z → 01:01:32Z), job level:
   `Circuit Breaker Check` success · `Detect Changes` success ·
   `Deploy Blocked` **skipped** (breaker closed) · **`Deploy Hospitality`
   success** (01:01:16Z) · `Deploy Marketing` skipped · `Deploy Rialto Web`
   skipped (not changed) · **`Post-Deploy Verification` success** ·
   `Rollback Failed Deploys` skipped (nothing to roll back) ·
   `Report Deploy Health` success. The run is not a skipped-job
   "success" (gotchas § Deploy): `Deploy Hospitality` itself ran and
   succeeded.
5. **Later deploys.** Hospitality has since been redeployed by later main
   commits. The most recent was run 38992523685 on `6e1d85903`
   (2026-10-17T01:50Z, `Deploy Hospitality` success). The served entry chunk
   is still `index-Bd9I8AYX.js`, the same hash verification saw, so the
   feature's code is what production serves now.
6. **Ship pre-flight hook** (`local-ci-precheck`) run 2026-10-16 against
   0bc8f0c27. Every lane passed:
   ```
   → pnpm install --frozen-lockfile      install exit=0
   [lint]       Tasks: 52 successful, 52 total   (0 errors; warnings only, e.g. @mbe/rialto-web 163, @mbe/gen 94)
   [typecheck]  Tasks: 52 successful, 52 total
   [arch-audit] Checking codebase against 1 active ADRs... ✅ No architectural violations detected.
                ✅ All external dependencies are consistent across the monorepo.
   [drift]      dep-graph regen: git diff --exit-code clean; 27 × "llms.txt is in sync", 0 stale
   arch exit=0 / drift exit=0 / lint exit=0 / typecheck exit=0
   ```
   The working tree was unchanged afterwards. `git status` showed only this
   run's docs.

## Post-release checks

These are read-only probes. No reservation was created and nothing was sent.

- **Production serves the feature.**
  - `curl https://mattbutlerengineering.com/hospitality/` → `200`. The entry
    chunk is `/hospitality/assets/index-Bd9I8AYX.js` (200, 120,935 bytes).
  - DNS checked against `dig @1.1.1.1`: `104.21.25.32` / `172.67.222.73`,
    the same as the LAN resolver, so there is no sinkhole artefact.
  - In `index-Bd9I8AYX.js`: `"Noted. It's on your reservation for the team."`
    ×1, `"No confirmation email or text is sent"` ×1,
    `"A confirmation has been sent to"` ×0.
  - In `TimelinePage-BuzUz77Z.js` (200): `"Guests see this with:"` ×1.
- **Public pages in a real browser** (verification SC11, 2026-10-16,
  Playwright at 375×812). `/hospitality/reservations/manage` with no token
  rendered "No Access Link" with 0 console messages and no CSP refusal. The
  booking page shell loaded with no CSP refusal. Its only error was the
  expected 404 for the unknown slug `the-oak-table`.
- **Not reachable on production, and recorded as gaps rather than
  estimated:**
  - The rendered ConfirmationView card (needs a real booking).
  - The rendered manage-page card (needs a real manage token).
  - Every host surface (behind Auth0).
  - No live venue slug is recorded in the repo.
  - The evidence for these is the served bundle above plus the local tests
    and E2E in `verification.md`.
- **Intake issue to close:** none. This is a feature run, and no `intake:`
  is recorded.

## Pending Owner decision (not chosen here)

**How to fix SC4 ("one copy source").** Since #6735, the acknowledgement is a
literal in both `constants/confirmation-copy.ts` and
`i18n/catalogs/en-US.json`. A test pins them equal. The committed guard
(`confirmation-copy.source.test.ts`) scans only `.ts`/`.tsx` and cannot see
the JSON copy.

- **(a)** Amend SC4 so that the en-US catalog is the guest source and
  `CONFIRMATION_COPY` must equal it. Widen the guard to scan `.json` and
  allow-list `en-US.json`.
- **(b)** Make `en-US.json` the only literal. Retire `CONFIRMATION_COPY`'s
  strings in favour of catalog keys, including the host label and a caption
  key that nests the acknowledgement. Review recommends this option, because
  it also fixes the untranslated host ticket (Follow-up 2).

Either option also updates the guard's doc comment and `architecture.md`'s
copy-source decision. **This is pending Matt. Ship does not choose.**

## Follow-ups

None were filed. Proposed seeds, in the `docs/backlog.md` line format, for
Operate to append at run close:

1. **SC4 guard and contract decay** (review minor 1, verification Failures).
   Waits on the Owner decision above.
   `- Resolve remembered-on-arrival SC4: choose (a) widen confirmation-copy.source.test.ts to scan .json and amend SC4, or (b) make en-US.json the only acknowledgement literal and retire CONFIRMATION_COPY's strings; update architecture.md's copy-source decision either way (from: feature:remembered-on-arrival)`
2. **The host ticket is untranslated, and its caption quotes en-US whatever
   the guest saw** (review minor 2, verification "Not verified"). This goes
   to the localization run (`docs/features/localization`), and option (b)
   fixes it.
   `- Translate SpecialRequestsTicket's label and host caption through t() in the dashboard locale; the caption must quote the acknowledgement in that same locale (from: feature:remembered-on-arrival)`
3. **`no-literal-ui-strings` cannot see UI strings imported from
   `constants/*`** (review minor 2, recommendation). Other copy constants,
   e.g. `constants/session-lapse-copy.ts`, may hide untranslated text. This
   was not audited.
   `- Make no-literal-ui-strings (or a test) catch user-visible strings imported from apps/hospitality/src/constants/* modules (from: feature:remembered-on-arrival)`
4. **SC8 honesty limits are checked for en-US only** (review minor 3).
   es-MX and fr-CA are clean today by a manual scan. This goes with the
   localization run.
   `- Add per-locale honesty tests (banned overclaim / false-send word lists) for the es-MX and fr-CA bookingWidget acknowledgement, caption and contact line (from: feature:remembered-on-arrival)`
5. **Manage-page error copy still cites a confirmation email that does not
   exist** (review minor 4). This is already covered by the existing seed at
   `docs/backlog.md:265` ("Send a confirmation email on the booking widget's
   path, or stop the product implying one exists"). The owner is Matt, so no
   new seed is needed.
6. **`briefing.spec.ts:101` is timezone-dependent** (verification regression
   sweep). It fails when the machine timezone is not America/New_York,
   because every time shifts by 3 h. The likely cause is #6706's venue clock.
   It is not this run's code.
   `- Make apps/hospitality/e2e/briefing.spec.ts:101 independent of the machine timezone (fails off America/New_York; suspected #6706 venue clock) (from: feature:remembered-on-arrival)`
7. **`gh run list --branch main` + `headSha` filter missed every run on the
   merge SHA** (Release log 2). The REST `?head_sha=` query found them. This
   could be a gotchas candidate for the knowledge-base harvest at Operate,
   not a seed.

## For human review

- **SC4 (a)/(b) decision** (above). This is the only open decision.
- **The rollback is no longer a one-command revert.** If the feature ever has
  to come out, budget a hand-resolved revert PR across 14 conflicting paths,
  and keep the honest contact line.
- **No observed human user yet.** Production evidence is bundle-level only.
  The rendered guest cards and every host surface are unproven in
  production. Operate should look for a real booking with Special Requests
  before it calls the loop closed.

## Outcome

Shipped cleanly on 2026-10-12. The merge, CI Gate and hospitality deploy all
succeeded at job level, and post-deploy verification passed. There were two
recorded hiccups, and neither affected users: the advisory hospitality
visual-regression red, which was pre-existing and has been fixed on main by
#6870, and the `gh run list` lookup gap. Production serves the feature
today. Next stage: Operate.
