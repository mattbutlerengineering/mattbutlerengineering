---
stage: ship
run: feature:localization
date: 2026-10-18
outcome: released
released-at: 2026-10-15
released-commits:
  - "Phase 1 (23 squash merges, 2026-10-15T05:52:20Z → 23:41:21Z): #6591 5c53ebf86 (foundation), #6688 244ec3330, #6685 ae18133c7 (deps), #6692 d29d4aaaa, #6689 2bec613c0, #6703 a878d4f7c, #6708 96dabae9c, #6711 e564a2a36, #6710 aa8eeb225, #6706 2ee6130ac, #6702 0e83dac4d, #6721 a1e3aa532, #6724 7d05cdca5, #6728 304b3518a, #6734 5d0cb8886, #6727 8e5360b43, #6730 925d9f328, #6735 ca1c38606, #6738 8e44d6b82, #6739 0819e5e4d, #6740 95669a8e7, #6741 42f81075f, #6743 7c01d8969 (docs, last Phase 1 merge)"
  - "Post-ship fixes on the same surfaces: #6865 3240235b7 (2026-10-16T16:57:15Z), #6868 dba88e32e (2026-10-16T17:18:29Z), #7016 babc45120 (2026-10-17T16:09:46Z)"
preflight-head: 0f251a015 (branch docs/localization-close, cut from origin/main; carries every commit above)
assumptions:
  - "This Ship stage records a release that already happened (brief § What each stage does → Ship). All 26 PRs were squash-merged to main by mattbutlerengineering between 2026-10-15T05:52Z and 2026-10-17T16:09Z, and Deploy Static Sites deployed them. No release action was taken here: no merge, deploy, tag, publish, `changeset version`, push, PR or issue."
  - "The commit list is the brief's, re-verified rather than trusted: each SHA is an ancestor of this branch's head (`git merge-base --is-ancestor`), and each PR's `merged_at` and `merge_commit_sha` were read from `gh api repos/…/pulls/<n>`. Review found two more commits on the run's paths (#6975, #6976, ChangeBookingDialog); they belong to another run and are not part of this release."
  - "The repo's Ship pre-flight hook (`local-ci-precheck`) ran against this branch's head, 0f251a015, not against the 26 merge SHAs. The hook is defined against the final branch head. Each merge's own gate is recorded from CI (Release log 2)."
  - "The brief says 'the rialto minor changeset'. The run decided otherwise and recorded it: breakdown.md Notes 2026-10-13 makes rialto changesets patch, not minor, per rialto's pre-1.0 convention. All five of the run's rialto changesets are `patch` (read from each commit's `.changeset/*.md`). This record states what was versioned, not what the brief expected."
  - "Rollback default: the preferred rollback is forcing en-US through the locale policy (narrow `SUPPORTED_LOCALES` to en-US), not a whole-run `git revert`. A whole revert conflicts (measured below), and a forced en-US hides every translation while keeping the venue-clock and deposit-currency fixes from #6706. This is the stage's choice, made without live Owner input. The lever was found by reading `locales.ts` and its four importers; it was not built or tested here."
  - "The two-way door call counts the revert conflicts as effort, not risk. The release adds no schema or data migration. The two API tightenings in #6706 reject inputs the old code accepted; reverting them re-accepts those inputs and leaves no stored row invalid. Rialto 0.6.2–0.6.5 were versioned in the repo but never published (Release log 5), so no registry version is a one-way door."
  - "Follow-ups are listed as backlog-seed text inside this artifact only (brief § Tracker: no tracker interaction). docs/backlog.md was not edited."
  - "Post-release checks are unauthenticated and bundle-level, plus verification.md's browser probe of the public guest routes. Staff surfaces are behind Auth0 and are evidenced by CI only; no login was attempted."
---

# Release: Localization — Phase 1 (foundation + hospitality; tracking #6631)

The release already happened. Twenty-three PRs merged to `main` on
2026-10-15 (local time 2026-10-14 22:52 PDT for the foundation), and three
post-ship fixes followed on 2026-10-16 and 2026-10-17. Each push that touched
a deployable path rebuilt the hospitality Worker, and the reservations-service
change in #6706 went out through Deploy Services. Hospitality now ships en-US,
en-GB, es-MX and fr-CA, with locale-aware dates, times and money on the
venue's clock and currency, and rialto reads its built-in text from an optional
locale context (ADR-028). This artifact records the pre-flight, the deploy
evidence, the rialto version state, the post-release checks and the rollback
plan. This stage released nothing.

## Pre-flight

- [x] **Verification green.** `verification.md` (`7150c5fac`) grades all 9
      PRD criteria PASS, with 0 failures. `review.md` (`131b96288`) returns
      **no critical** finding, three majors and six minors. The majors
      contradict verification's PASS on criteria 1, 5 and 7 for strings the
      gates cannot see. The Owner answered them on 2026-10-18: "One fix run,
      all 3", outside this run (brief § Review decisions). They are recorded
      below as open known defects and do not route back to Implement. The six
      minors are deferred to seed text.
- [x] **No secrets in the diff; target config present.** `Secret Scan`
      (`secret-scan.yml`) concluded `success` on all 26 merge SHAs (first:
      run 38689146007 on `5c53ebf86`; last Phase 1: 38825072157 on
      `7c01d8969`; last post-ship: 39048201619 on `babc45120`). Review's
      security pass found no secrets. The release adds no environment
      variable, secret or binding: catalogs are bundled assets, the locale
      choice lives in browser `localStorage`, and #6706's service change reads
      the venue's existing `currencyCode`.
- [x] **Migrations/data changes have a tested forward path.** No migration,
      SQL or Prisma schema path is in the diff (review § Domain passes:
      Migrations not selected). #6706 changed two API contracts with no data
      change: `POST /api/v1/deposits` answers 400 when the body currency
      differs from the venue's, and venue create/update rejects a
      `currencyCode` that is not three letters. Both are covered by
      `deposits.test.ts` and `currency-schemas.test.ts` in that PR, and the
      service deployed (Release log 4).
- [x] **ADRs.** The run added one: ADR-028 (`docs/adr/ADR-028-rialto-localization-through-context.md`,
      added in `5c53ebf86`). It is the only `ADR-028*` file on the base, and
      `docs/adr/README.md:36` carries its index row (status `active`,
      2026-10-13). No collision, no renumber.
- [x] **Rollback plan concrete.** See below, including the measured revert
      conflicts.
- [x] **Launch brief hook.** `python3 <ship skill>/../../launch_demo.py config`
      printed `NONE` and `launch-demo: 0 problem(s)`, exit 0. The repo has no
      launch-demo config, so nothing was run or written.
- [x] **Repo Ship pre-flight hook (`local-ci-precheck`) against 0f251a015.**
      The steps in `.claude/skills/local-ci-precheck/SKILL.md` were run
      directly on node v22.22.3 (`.nvmrc`: 22). Every lane exited 0 (Release
      log 7). The hook ran after the release, so it confirms today's `main`
      plus this run's docs is clean. It is not a gate the merges passed
      through.

## Rollback plan

Door: two-way. The release is client-side text, catalogs, formatting code,
two optional rialto context props and two API input tightenings. It has no
schema or data migration and no published package version (rialto 0.6.2–0.6.5
were never published; Release log 5). Every lever below is a normal PR that
deploys through CI. The whole-run revert conflicts, so the door is two-way but
not a one-command revert.

Blast radius: hospitality (staff dashboard and public guest booking/manage
routes) and rialto's in-repo consumers (hospitality, rialto-web, marketing via
`workspace:*`). If the call is wrong, users in es-MX, fr-CA or en-GB browsers
see en-US again, which is the pre-release state. Option B also reverts #6706,
so deposit creation would again default a missing currency to `usd`. No other
app, data store or external consumer is touched.

**Measured 2026-10-18 on 0f251a015** (`git revert --no-commit <c>` in this
worktree, then `git revert --abort` and `git reset --hard HEAD`;
`git status --porcelain` printed nothing after each):

| Revert                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5c53ebf86` (#6591 foundation) alone                | **conflicts** (exit 1): 11 `UU` (`apps/hospitality/eslint.config.js`, `package.json`, `src/main.tsx`, `packages/rialto/eslint.config.js`, `pnpm-lock.yaml`, six `llms*.txt`) and 10 `UD` (the three hospitality catalogs, `runtime.tsx`, `runtime.test.tsx`, rialto `messages.ts`, `locales/es-MX.ts`, `locales/fr-CA.ts`, `useRialtoLocale.test.tsx`, `breakdown.md`). Later commits build on every one. |
| `7c01d8969` (#6743, last Phase 1 merge, docs) alone | applies cleanly (exit 0), 3 files `M`.                                                                                                                                                                                                                                                                                                                                                                    |
| `42f81075f` (#6741, last Phase 1 code merge) alone  | applies cleanly (exit 0), 17 files `M`.                                                                                                                                                                                                                                                                                                                                                                   |
| `babc45120` (#7016, last post-ship fix) alone       | applies cleanly (exit 0): 3 `A`, 7 `D`, 16 `M`.                                                                                                                                                                                                                                                                                                                                                           |
| all 26, newest first                                | **stops at the 7th** (`0819e5e4d`, #6739) with `CONFLICT (content)` in `en-US.json`, `es-MX.json` and `fr-CA.json`. Commits from other runs (e.g. #6975/#6976) have since added catalog keys.                                                                                                                                                                                                             |

Deploys go through GitHub Actions only. Never run `wrangler` or `doctl` by
hand.

```
# Option A — force en-US everywhere, keep the code (preferred; untested lever)
git fetch origin main
git switch -c revert/localization-force-en-us origin/main
#   apps/hospitality/src/i18n/locales.ts:
#     SUPPORTED_LOCALES = [{ tag: "en-US", endonym: "English (US)", machineTranslated: false }]
#     LANGUAGE_FALLBACK = { en: "en-US" }
#   resolveLocale() then returns en-US for every stored or browser tag.
#   It feeds runtime.tsx (dashboard and, via createLocaleRuntime,
#   WidgetLocaleScope), so both scopes boot en-US; LocalePicker and
#   machine-translation-tags.ts list one locale. Stored es-MX/fr-CA choices in
#   users' localStorage stop matching and are ignored.
#   Update the tests that pin four locales (locales.test.ts, LocalePicker*.test.tsx,
#   StaffLocaleSwitcher.test.tsx, WidgetLocaleScope.test.tsx) and skip or
#   remove e2e/locale-sweep.spec.ts.
pnpm --dir apps/hospitality lint && pnpm --dir apps/hospitality typecheck && pnpm --dir apps/hospitality test
git commit -m "revert(hospitality): force en-US while localization is rolled back"   # push, open a PR
# Merge on a green CI Gate. The push triggers Deploy Static Sites; confirm the
# JOB conclusion "Deploy Hospitality" = success, not the workflow rollup.

# Option B — full removal
git revert --no-commit babc45120 dba88e32e 3240235b7 7c01d8969 42f81075f 95669a8e7 \
  0819e5e4d 8e44d6b82 ca1c38606 925d9f328 8e5360b43 5d0cb8886 304b3518a 7d05cdca5 \
  a1e3aa532 0e83dac4d 2ee6130ac aa8eeb225 e564a2a36 96dabae9c a878d4f7c 2bec613c0 \
  d29d4aaaa ae18133c7 244ec3330 5c53ebf86
#   Resolve each conflict toward origin/main's non-localization code (catalog
#   keys added by later runs must move back into literals or be dropped with
#   their features). Regenerate llms*.txt (pnpm build --filter @mbe/cli... && pnpm regen)
#   and pnpm-lock.yaml (pnpm install). Add a rialto changeset (patch) for the
#   removed RialtoProvider props and ./locales/* subpaths.
#   This also reverts #6706: Deploy Services must then redeploy reservations-api
#   (check job "Deploy API Services" = success, not the rollup).

# Option C — emergency only: roll the hospitality Worker back. This discards
# every hospitality deploy since 2026-10-15. No CI workflow does it on demand
# (deploy-static.yml runs `wrangler rollback` only inside its own job after a
# failed post-deploy verification). A manual rollback breaks the CI-only deploy
# rule and needs Matt's explicit say-so.

# Verify after A or B (unauthenticated)
curl -s https://mattbutlerengineering.com/hospitality/ | grep -oE 'assets/index-[^"]+\.js'
#   Option A: open /hospitality/reservations/manage with an es-MX browser; the
#   heading reads "No Access Link" and <html lang="en-US">.
#   Option B: the entry chunk no longer references es-MX-*.js / fr-CA-*.js.
```

## Release log

1. **Merges.** All 26 PRs were squash-merged by `mattbutlerengineering`
   (Conductor batch turns and post-ship fixes). Merge times and commits are
   from `gh api repos/…/pulls/<n>`; the list is in the frontmatter. First
   merge #6591 at 2026-10-15T05:52:20Z, last Phase 1 merge #6743 at
   2026-10-15T23:41:21Z (tracking #6631 closed 23:41:54Z), last post-ship fix
   #7016 at 2026-10-17T16:09:46Z.

2. **CI on the merge SHAs** (`ci.yml` push runs, filtered by `headSha` in jq;
   `CI Gate` is the only required check, gotchas § CI):
   - 22 of 26 SHAs have their own `CI` run concluding `success`, e.g.
     38700040027 (`244ec3330`), 38824212544 (`42f81075f`), 38825072177
     (`7c01d8969`, `CI Gate` job success), 39048201677 (`babc45120`).
   - **Cancelled (superseded), covered by the next completed main CI:**
     - `5c53ebf86` (#6591): run 38689145933 cancelled with no jobs. Covered by
       38689178585 on `61330001f` (descendant), `CI Gate` job success.
     - `d29d4aaaa` (#6692): run 38747377781 cancelled. Covered by 38752720022
       on `2bec613c0` (#6689), `CI Gate` success.
     - `a878d4f7c` (#6703): run 38753534267 cancelled. Covered by 38753668450
       on `a262b52f3` (#6693, descendant), `CI` success.
   - **Hiccup — red on main for one push:** `7d05cdca5` (#6724) CI run
     38803016913 concluded `failure`: job `Test (Node 22, hospitality)` failed
     one test, `LocalePicker.test.tsx > keeps the trigger enabled and focused
while a switch is pending (focus is not dropped to body)`, and `CI Gate`
     failed with it. The very next main push, `304b3518a` (#6728, 16 minutes
     later, no change to `LocalePicker/`), ran 38805130874 with `CI Gate`
     success, so it was an intermittent timing failure, not a broken tree.
     #6734 (`5d0cb8886`) then gave a sibling LocalePicker test a 10 s load
     timeout for the same loaded-CI-runner reason ("the 50 ms default would
     time the switch out first"); the failing focus test itself was not
     changed.

3. **Deploys of the hospitality Worker** (`Deploy Static Sites`,
   `deploy-static.yml`, found with
   `gh run list --workflow deploy-static.yml --branch main --created 2026-10-15..2026-10-17 --json databaseId,headSha,conclusion,createdAt`
   filtered by `headSha` in jq; job levels from `gh run view <id> --json jobs`).
   Every deploying run below had `Circuit Breaker Check` success,
   `Deploy Blocked` **skipped** (breaker closed), **`Deploy Hospitality`
   success**, **`Post-Deploy Verification` success**, `Rollback Failed Deploys`
   skipped and `Report Deploy Health` success. None is a skipped-job "success"
   (gotchas § Deploy).

   | Merge                     | Deploy run                                                                                                                          | Other deploy jobs                     |
   | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
   | `5c53ebf86` #6591 (first) | 38689145983 (05:52:22Z)                                                                                                             | Rialto Web success, Marketing success |
   | `244ec3330` #6688         | **none** — touches only `packages/cancellation-policy`, outside the path filter; shipped by 38726243956 on `ae18133c7` (descendant) | —                                     |
   | `ae18133c7` #6685         | 38726243956                                                                                                                         | Rialto Web, Marketing skipped         |
   | `d29d4aaaa` #6692         | 38747377057                                                                                                                         | skipped                               |
   | `2bec613c0` #6689         | 38752720259 **cancelled**, `jobs: []`; deployed by **38753668370** on `a262b52f3` (#6693, descendant; Deploy Hospitality 14:49:25Z) | Rialto Web, Marketing success         |
   | `a878d4f7c` #6703         | 38753534145 **cancelled**, `jobs: []`; deployed by the same **38753668370**                                                         | —                                     |
   | `96dabae9c` #6708         | 38761045466                                                                                                                         | skipped                               |
   | `e564a2a36` #6711         | 38763970527                                                                                                                         | skipped                               |
   | `aa8eeb225` #6710         | 38764697009                                                                                                                         | Rialto Web, Marketing success         |
   | `2ee6130ac` #6706         | 38780344923                                                                                                                         | skipped                               |
   | `0e83dac4d` #6702         | 38781040565                                                                                                                         | skipped                               |
   | `a1e3aa532` #6721         | 38784915159                                                                                                                         | skipped                               |
   | `7d05cdca5` #6724         | 38803016843                                                                                                                         | Rialto Web, Marketing success         |
   | `304b3518a` #6728         | 38805130990                                                                                                                         | skipped                               |
   | `5d0cb8886` #6734         | 38807611180                                                                                                                         | skipped                               |
   | `8e5360b43` #6727         | 38808099510                                                                                                                         | skipped                               |
   | `925d9f328` #6730         | 38810017932                                                                                                                         | skipped                               |
   | `ca1c38606` #6735         | 38811173129                                                                                                                         | skipped                               |
   | `8e44d6b82` #6738         | 38814276841                                                                                                                         | skipped                               |
   | `0819e5e4d` #6739         | 38814708920                                                                                                                         | skipped                               |
   | `95669a8e7` #6740         | 38817337373                                                                                                                         | skipped                               |
   | `42f81075f` #6741         | 38824212581                                                                                                                         | Rialto Web, Marketing success         |
   | `7c01d8969` #6743 (last)  | 38825072090 (23:41:24Z)                                                                                                             | Rialto Web, Marketing success         |
   | `3240235b7` #6865         | 38935942538                                                                                                                         | Rialto Web, Marketing success         |
   | `dba88e32e` #6868         | 38938681773                                                                                                                         | Rialto Web, Marketing success         |
   | `babc45120` #7016         | 39048201740                                                                                                                         | skipped                               |

   Note for the next release: `deploy-static.yml`'s path filter has no
   `packages/cancellation-policy/**` (or `packages/types/**`), although
   hospitality depends on it (`apps/hospitality/package.json:83`). #6688 only
   reached users because #6685 deployed 3h40m later.

4. **Deploy of the reservations service for #6706** (`deploy-services.yml`):
   run 38780345029 on `2ee6130ac` — `Circuit Breaker Check` success,
   `Wait for CI` success, `Deploy Blocked` skipped, **`Deploy API Services`
   success**, **`Post-Deploy Verification` success**, `Report Deploy Health`
   success.

5. **Rialto version and publish state.** The run's five rialto changesets
   were all `patch` (breakdown.md Notes 2026-10-13). They were versioned by
   the changesets Version PRs, and their entries are in
   `packages/rialto/CHANGELOG.md`:
   - **0.6.2** (`42b4ca937`, "chore: version packages (#6671)"): #6591 (two
     entries: `RialtoLocaleProvider`/`useRialtoLocale`, and the
     `./locales/{en-GB,es-MX,fr-CA}` subpaths), #6710, #6689.
   - **0.6.4** (`6bb6f8faa`, #6729): #6724.
   - **0.6.5** (`aeadd930c`, #6742): #6741 (`GlobalNav` `labels` prop).
   - The post-ship #6865/#6868 went into 0.7.0 (`74bf4e598`, #6867). The
     repo is at 0.7.1 today. No `.changeset/*.md` is pending (the directory
     holds only `config.json` and `README.md`).

   **None of these versions was published.** `package.json` publishes to
   GitHub Packages (`publishConfig.registry: https://npm.pkg.github.com`), not
   npmjs (`npm view` on npmjs: E404; `npm whoami`: 401). Two reads of GitHub
   Packages agree that the newest published version is **0.2.0**
   (2026-04-25T19:42:48Z): `gh api /users/mattbutlerengineering/packages/npm/rialto/versions`
   and `npm view … versions --registry https://npm.pkg.github.com`. The
   Release workflow run on the 0.6.5 version commit (38826045265, job
   `Release @mattbutlerengineering/rialto` success) logged
   `##[notice]RIALTO_PACKAGES_TOKEN is not set -- skipping publish (publishing intentionally disabled; see docs/SECRETS.md)`.
   That is the repo's deliberate opt-in publish policy
   (`scripts/release-publish.sh`). Every consumer uses rialto through
   `workspace:*`, so the deployed hospitality bundle carries the localized
   rialto regardless; only an external registry consumer would not have it.

6. **Later deploys.** Hospitality has been redeployed since. The newest is
   run 39145301837 on `5f9e049f2` (2026-10-18T16:30Z): `Deploy Hospitality`
   success, `Post-Deploy Verification` success. verification.md's probe and
   the checks below read that build.

7. **Ship pre-flight hook** (`local-ci-precheck`), run 2026-10-18 against
   `0f251a015a0b0ddaa9f5bbb9de6bf7a6f17bce3d` on node v22.22.3. Every lane
   passed:

   ```
   install exit=0                                 (pnpm install --frozen-lockfile)
   [lint]       Tasks: 52 successful, 52 total    (0 errors; warnings only,
                e.g. hospitality 145, rialto 168)
   [typecheck]  Tasks: 52 successful, 52 total
   [arch-audit] Checking codebase against 1 active ADRs...
                ✅ No architectural violations detected.
                ✅ All external dependencies are consistent across the monorepo.
   [drift]      dep-graph regen: git diff --exit-code clean; 27 × "in sync", 0 stale
   lint exit=0 / typecheck exit=0 / arch exit=0 / drift exit=0
   ```

   `git status --porcelain` printed nothing afterwards.

## Post-release checks

Read-only, unauthenticated. No login, booking or email.

- **DNS.** The LAN resolver and `dig @1.1.1.1` both return `172.67.222.73` /
  `104.21.25.32`, so there is no sinkhole artefact.
- **Shell.** `curl https://mattbutlerengineering.com/hospitality/` → `200`
  (4,014 bytes). Entry chunk `index-C8ZcORm3.js` → `200` (122,015 bytes).
- **Locale chunks are served lazily from the entry.** The entry references
  `es-MX-B_8vMCXb.js` (200, 52,261 bytes, contains `Sin enlace de acceso`),
  `fr-CA-CjVkgu4a.js` (200, 55,679 bytes, contains `Aucun lien d’accès`) and
  `en-GB-EK1PYEsx.js` (200, 488 bytes).
- **Rialto dictionaries ship eagerly**, as review's minor says:
  `rialto-vendor-BrEE8F5T.js` (modulepreloaded by `index.html`) contains
  `Ventana emergente` once.
- **Rendered guest routes in production:** verification.md's Playwright probe
  (deploy run 39145301837) showed `book/<absent venue>` and both
  `reservations/manage` error states fully translated in es-MX and fr-CA,
  `<html lang>` and the guest scope `lang` equal to the locale, browser
  fallback (`es-AR`→es-MX, `fr-FR`→fr-CA, `de-DE`→en-US) and a stored guest
  choice winning after reload. The one CSP refusal per page is zod's eval
  probe, present in en-US too, and not caused by this release.
- **Not shown in production, recorded as gaps:** the found-venue booking flow
  (no public venue slug is discoverable), every staff surface (Auth0; CI's
  108 gated sweep tests only), en-GB money/time on a real venue, and the
  production locale switcher.
- **Intake issue to close:** none. This is a feature run; #6631 and its
  children were closed by the Conductor batch (closed 2026-10-15T23:41:54Z).

## Live production defects / open known defects

The Owner answered all three majors together on 2026-10-18: **"One fix run,
all 3."** A separate maintenance run, outside this run, tightens
`mbe-local/no-literal-ui-strings` to catch conditional and logical literals
(RED on the ~9 found today), then moves those strings into en-US/es-MX/fr-CA
catalog keys with a rialto changeset. That run is pending. Ship records the
defects and does not block on them.

1. **English accessible name on the theme toggle, every staff route, es-MX and fr-CA
   — live in production.** `ThemeToggle.tsx:28` renders
   `aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}`
   through `GlobalNav`. Re-measured today: the production
   `rialto-vendor-BrEE8F5T.js` contains `Switch to dark mode` and
   `Switch to light mode` once each. Contradicts PRD criteria 1 and 5.
2. **Five rialto components still render built-in English** (Form error
   summary, TapeChart stat pill/day card/`defaultStrings`, DataTable "Select
   row" fallback, PinInput "Code complete", ChatPanel "Not allowed"
   fallback). Only ChatPanel's fallback is reachable in hospitality (`/chat`);
   the rest affect rialto consumers and PRD criterion 5. Rialto's npm
   consumers are hypothetical today: nothing past 0.2.0 is published.
3. **Neither gate catches a literal inside a conditional or logical
   expression** (`isTextual` in `local-rules.js:166-174` accepts only a bare
   `Literal`/`TemplateLiteral`; the sweep matches only catalog strings).
   PRD criterion 7 holds for bare literals only. Root cause of 1 and 2.

## Follow-ups

None filed. Seed text in the `docs/backlog.md` line format, for Operate to
append at run close (not appended here):

From review's deferred minors:

- `- vite.manualChunks routes /packages/rialto/ (including src/i18n/locales/*) into the eager rialto-vendor chunk, so every hospitality visitor downloads all three Rialto locale dictionaries (~2.8 kB brotli); exclude the rialto locales path so the dynamic import gets its own chunk (from: feature:localization)`
- `- format.ts resolveTimeZone reports invalid venue IANA zones via console.warn only, though architecture.md promised a once-per-zone Sentry report; route defaultReport through the hospitality Sentry client, and record the cloneInstance→createLocaleRuntime and no-venue-USD deviations in breakdown.md Notes (from: feature:localization)`
- `- Record that #6706 made deposit currency server-owned (400 on mismatch, no 'usd' default) and tightened venue currencyCode to 3 letters, which architecture.md said Phase 1 would not change (from: feature:localization)`
- `- LocalePicker menu items: set lang={l.tag} on each endonym and machine-translation tag span (WCAG 3.1.2); render the settings Select options with a lang-capable label or document the gap (from: feature:localization)`
- `- Cancel/no-show dialogs: pass the guest name to <Trans> as a component child instead of a {{name}} value, so markup-like names render verbatim under escapeValue:false (from: feature:localization)`
- `- runtime.tsx bootLocale: give the lean: marker a trigger or report boot catalog-load failures once to Sentry; nav-sections.ts: import defaultT from i18n/default-t.ts instead of redefining it (from: feature:localization)`

From verification:

- `- Provide a stable public demo venue slug so the found-venue guest booking flow can be probed in production in every locale (from: feature:localization)`
- `- Set zod jitless globally in hospitality so its Function('') capability probe stops raising an enforced script-src eval CSP refusal on every page load, which masks real CSP regressions in probes (from: feature:localization)`
- `- onboarding-localization currency test fails when run as the only file (toBeVisible on an option of a not-yet-visible listbox); wait for the listbox or assert presence plus name so a single-file run is green (from: feature:localization)`

From this stage:

- `- deploy-static.yml's path filter omits packages/cancellation-policy/** and packages/types/**, which hospitality bundles; #6688 deployed only because an unrelated push followed (from: feature:localization)`

## For human review

- **The three majors' fix run** is the one open item. Major 1 is live on every
  staff page for screen-reader users in es-MX and fr-CA until it ships.
- **Rialto 0.6.2–0.7.1 are versioned but unpublished.** The newest registry
  version is 0.2.0. That is the repo's deliberate policy
  (`RIALTO_PACKAGES_TOKEN` unset), and it costs nothing while every consumer is
  `workspace:*`; it does mean ADR-028's `./locales/*` subpaths exist for no
  external consumer yet.
- **The rollback is not a one-command revert.** The foundation revert
  conflicts in 21 files and the full-run revert stops at #6739 on the
  catalogs. Option A (force en-US through `locales.ts`) is the realistic undo,
  and it was identified by reading code, not tested.
- **Main went red once** at `7d05cdca5` (one LocalePicker focus test,
  intermittent), green on the next push.
- **No observed non-en-US user yet.** Operate's minimum signal (brief §
  Operate): one Sentry event or Cloudflare hit carrying a non-en-US locale, a
  booking made in es-MX/fr-CA/en-GB, or one ui-quality-loop judgment of a
  translated page.

## Outcome

Shipped with hiccups on 2026-10-15; post-ship fixes through 2026-10-17. Every
merge reached production through a `Deploy Hospitality` job that succeeded at
job level with post-deploy verification passing, and #6706's service change
through `Deploy API Services` success. The hiccups: two hospitality deploy runs
were cancelled (#6689, #6703; both deployed by 38753668370), #6688 had no
deploy run of its own (path filter; shipped by #6685's run), three merge SHAs
had their main CI cancelled (covered by the next completed run), and main CI
was red once at #6724 on an intermittent LocalePicker test. The rialto
changesets were versioned (0.6.2, 0.6.4, 0.6.5) but not published, by policy.
Three review majors ship as open known defects (one live), with the Owner's
single fix run pending. Next stage: Operate.
