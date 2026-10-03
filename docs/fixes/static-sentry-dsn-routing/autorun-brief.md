# Autorun brief: static-sentry-dsn-routing

Collected 2026-10-02 from Matt (two answered questions) plus evidence the orchestrator
measured. This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (defect brief). Slug `static-sentry-dsn-routing`, directory
  `docs/fixes/static-sentry-dsn-routing/`. It enters at Capture.
- **Worktree / branch:** `.claude/worktrees/static-sentry-dsn-routing`, branch
  `fix/static-sentry-dsn-routing`, cut from `origin/main` @ `1a6082f4b`. Never use the main
  checkout: it is stale and has unrelated WIP.
- **Origin:** Review finding M3 and alert issue #5941 from `feature:sentry-silence-alert`
  (`docs/features/sentry-silence-alert/release.md`). There is no backlog seed to claim; if
  one matches, claim it.
- **In-flight check (ran 2026-10-02):** open PRs #5989, #5988, #5985, #5984, #5982, #5980,
  #5977, #5972, #5967, #5966. None of them touch Sentry DSNs or `deploy-static.yml`.
  Nothing matches.
- **Tracker:** issue #5941 is the alert this run must close. It closes itself when a
  heartbeat comes back green; never close it by hand. No other tracker interaction.

## Defect

- **Observed:** marketing and rialto-web report their Sentry errors to the `hospitality`
  project. The `mattbutlerengineering` project, where the heartbeat registry expects them,
  has had 0 events.
- **Expected:** both apps report to `mattbutlerengineering`. hospitality keeps reporting to
  `hospitality`.
- **Reproduction evidence (measured):**
  - Heartbeat runs are red: 36819787202 (dispatch, 10-01), scheduled 10-01 18:56Z, and
    scheduled 10-02 18:33Z. Each reports `mattbutlerengineering | FAIL | marketing:
misrouted → hospitality; rialto-web: misrouted → hospitality`.
  - `scripts/sentry-heartbeat.mjs --dry-run` / the workflow are the regression test that
    already exists.
- **Root-cause hypothesis (a hypothesis; Capture must confirm against the code):**
  - `.github/workflows/deploy-static.yml` passes `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}`
    to all three builds (hospitality, marketing, rialto-web; around lines 148, 199 and 232).
    That one secret is the hospitality project's DSN.
  - `SENTRY_PROJECT` is also a single secret used for the source-map upload, so
    marketing and rialto-web source maps probably upload to the wrong project too. Verify
    this.
  - `scripts/__tests__/deploy-static-sentry-env.test.mjs` pins the current env shape, so
    it must change.
- **Blast radius:** marketing and rialto-web production errors are triaged under the wrong
  project. The heartbeat stays red every day, and at the 3rd red scheduled run (10-03),
  `scheduled-workflow-health` files a `ci-fix` + `ready` issue at **2026-10-04 08:00Z**.
  implement-queue could then "fix" that issue by pointing the heartbeat targets at
  `hospitality`, which would hide this defect. **Hard deadline: release before 2026-10-04
  ~07:00Z.**
- **Ruled out:** the static apps are not blind. Their events do arrive, in the
  `hospitality` project (measured during sentry-silence-alert).
- **Fix shape (hunch):** a new repo secret `VITE_SENTRY_DSN_MBE`, passed only to the
  marketing and rialto-web builds, plus the matching source-map project for those builds
  (literal `mattbutlerengineering` or a secret; Capture/Implement decide from the code).
  Update the env-shape test, TDD. Scoped: expected `re-entry: implement` unless Capture
  finds a design question.

## Facts

- Sentry org `mattbutlerengineering`, region `https://us.sentry.io`.
- `mattbutlerengineering` project DSN, from Sentry MCP `find_dsns` on 2026-10-02 (key id
  `3eb05100486a63c8bcd98a58c8911f36`, "Default"):
  `https://3eb05100486a63c8bcd98a58c8911f36@o4510650299842560.ingest.us.sentry.io/4511154257526784`.
  A DSN is public: it is inlined into every browser bundle.
- Existing secrets: `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`,
  `SENTRY_DSN_{AGENT,RESERVATIONS,USERS}_API`.
- The edge CSP already allows the ingest host, because the same `o4510650299842560` org
  ingest host is already used. Verify after deploy anyway.

## Release authorization: YES (Matt, 2026-10-02)

In order:

1. **Create the repo secret** `gh secret set VITE_SENTRY_DSN_MBE --body "<DSN above>"`. Always
   pass `--body`, never stdin. Verify with `gh secret list`. Before merging, consider
   whether the secret's absence breaks the build: the require-deploy-secrets guard must
   pass.
2. **Squash-merge the PR** once reviewer PASS + `CI Gate` is green on the final head + zero
   unfixed critical findings.
3. **Let `deploy-static.yml` redeploy** marketing and rialto-web through CI. That is the
   only allowed deploy path: no manual wrangler. Confirm the deploy run succeeds.
4. **Dispatch `sentry-heartbeat.yml` once on main** after the deploy is live. Expected: all
   5 projects PASS, and #5941 closes itself with a comment. Record the real outcome.

Any unfixed critical finding, or red CI, means stop and surface. Nothing else external.

## Scope

- **In:** `deploy-static.yml` Sentry env for marketing and rialto-web, its env-shape test,
  the new secret, and the source-map project if it is wrong.
- **Out:**
  - Browser `environment: development` / missing release. Seeded separately.
  - The `packages/sentry/**` paths-filter gap.
  - The hospitality CSP `eval` violation: add a backlog seed for it if none exists.
  - `scheduled-workflow-health` changes.
- **User-facing surface:** none.

## Constraints

Follow the repo gotchas: TDD; `set -o pipefail` in any `run:` block whose exit code
matters; never use `status` as a variable name; stage files by explicit path; never pipe
`git push`; prettier-format docs; and run `pnpm install --frozen-lockfile` in the worktree.

## Correction (orchestrator, after Capture, 2026-10-02)

Merging does NOT redeploy: `deploy-static.yml`'s push `paths:` excludes `.github/**`. Release
step 3 is therefore a `gh workflow run deploy-static.yml --ref main` dispatch — still the
CI-only deploy path Matt authorized (no manual wrangler); it redeploys all three apps,
hospitality with unchanged env. Order is binding: secret exists → merge → dispatch deploy →
deploy green → dispatch heartbeat.
