---
stage: operate
run: feature:package-consolidation
date: 2026-10-22
users-observed: 0
signal-source: Sentry (0 new issues across agent-api, users-api, reservations-api, firstSeen -5d read 2026-10-23T03:50Z), production health probes 2026-10-23T03:49Z, Deploy Services job telemetry; the run has no human-facing surface
assumptions:
  - "Autorun resume (Owner chose this run live; no live interview inside the stage). The brief's operate section governs: wait 3 days after the last work-item merge (2026-10-19) was satisfied on 2026-10-22; every minimum-signal leg was re-measured by this stage, not taken from release.md."
  - "agent-api exposes no direct health route (release.md post-release checks: /api/v1/agent/health answers 404, re-confirmed 2026-10-23). Its health leg rests on the final merge's Deploy Services run 39200947778 Post-Deploy Verification job success plus zero Sentry issues, exactly as release.md recorded."
---

# Retro: Consolidate `packages/` from 20 to 14

Minimum-signal check (brief § Operate), all three legs met before writing this:

1. `Deploy Services` on the final merge (`47b422d4d`): run 39200947778,
   `Deploy API Services` job conclusion `success` (job-level, re-read
   2026-10-23; `Deploy Blocked` skipped, `Post-Deploy Verification` success).
2. Health, probed 2026-10-23T03:49Z against https://api.mattbutlerengineering.com:
   `/api/v1/users/health` 200 `status: ok` (database ok 10 ms),
   `/ready` 200 `ready: true` (database ok, auth ok),
   `/api/v1/reservations/health` 200 `status: ok` — all reporting version
   `fbd46b547`, a descendant of the final merge. agent-api: no direct route
   (404 on the guessed path), covered per the assumption above.
3. Sentry: 0 issues with `firstSeen:-5d` (window opens 2026-10-18, before the
   first merge at 2026-10-19T02:15Z) in each of agent-api, users-api,
   reservations-api.

## Outcomes vs. intent

### `packages/` has 14 packages and every gate is green (idea.md one-liner, PRD criteria 1-7)

- What happened: `git ls-tree origin/main packages/` lists exactly 14 at
  `838f10d43`; all nine work-item PRs squash-merged 2026-10-19 with CI Gate
  green on each merge result, issues #7098-#7106 closed. (A stale checkout
  can still show 21 dirs on disk: the 7 removed directories linger holding
  only gitignored `dist/`/`node_modules/`; git is the truth.)
- Signal strength: measured

### Prod services deploy healthy with no behaviour change (PRD criterion 11, user story 5)

- What happened: the three legs above. No new Sentry issue in any of the
  three service projects in the 4 days since the first merge; health and
  readiness answer ok on the current deploy. With no one observed this
  records state, not use.
- Signal strength: measured

### `ChatPanel` works from the registry (user story 3, PRD criterion 8)

- What happened: NOT landed for registry consumers. The repo side is done
  (`git grep @mbe/api-client packages/rialto` empty, minor changeset,
  version PR #7114 merged 2026-10-19T05:36Z bumping rialto to 0.8.0), but
  the publish never ran: release run 39205418242 printed
  `RIALTO_PACKAGES_TOKEN is not set -- skipping publish (publishing
intentionally disabled; see docs/SECRETS.md)`, and GitHub Packages still
  serves 0.2.0 (2026-04-25) as the latest version. The workflow concluded
  `success`, so nothing surfaced the skip.
- Signal strength: measured

### Agent sessions find single-caller code beside its caller (user story 2)

- What happened: the moves are on `main`; no later session's navigation of
  the moved code was measured, so whether upkeep actually dropped is
  unknown. The regen/dep-graph/Docker surface it removed is gone by
  construction (fewer manifest entries to maintain).
- Signal strength: unobserved

## Open debt

Issues this run itself filed or deferred — the run's own, counted toward
nothing:

- Rialto 0.8.0 versioned but unpublished — publish skips on unset
  `RIALTO_PACKAGES_TOKEN` (docs/SECRETS.md). Owner decision: provision the
  PAT and re-run release.yml, or retire the registry publish path. (From
  Ship's follow-ups; sharpened here with the run-39205418242 evidence.)
- F1 (review.md Medium): dead `@mbe/api-client` COPY/build lines in
  `services/reservations/Dockerfile`; audit the users Dockerfile too.
- F3 (Low): garbled comments sweep (`packages/sentry/src/node.ts`,
  `node.test.ts`, `knip.jsonc:4`/`:54`, `streaming.ts:6`,
  `CommandPaletteExamplePage.test.tsx:51`).
- F4/F5 (Low, optional): `retry.ts` origin comment / fold
  `reservations/src/notifications.ts`; `useChatStream` unused
  `domainContext`.
- F2 (review.md Medium) is CLOSED by this retro: the JWKS precedence seed
  is now in `docs/backlog.md` (Idea seeds below).
- Tracking issue #7107: closed by this stage with a comment referencing
  this retro.

## Run retrospective

- Keep: the deepen-review to decompose chain with pre-filed issues
  (#7098-#7106) — nine independent, revertable squash merges, each with its
  own reviewer pass and CI Gate on the merge result. Keep release.md's
  job-level deploy table; it made this retro's signal check a re-read, not
  an investigation.
- Change: run the local-ci-precheck steps in workers before the first push —
  5 of 9 PRs needed pre-merge fixes for things CI caught (stale doc rows,
  a self-package import, knip barrel exports, a duplicated literal), all
  catchable locally. And write Review-mandated backlog seeds at Review
  time; F2 slipped exactly because it was recorded as prose instead of
  written.
- Stop: reading a green Release workflow as publish evidence. The publish
  step skips with a notice on a missing secret and the run still concludes
  `success`.

## Environment

| Mistake                                                                                                    | Evidence                                                            | Class      | Proposed carrier                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale doc/README rows after package deletes reddened Integrity on #7111 and #7116                          | release.md, Release log item 3                                      | mechanical | local-ci-precheck steps (regen + Integrity checks) run by the worker before first push                                                                          |
| Self-package import after a move reddened Dependency Sync on #7112                                         | release.md, Release log item 3                                      | mechanical | same local-ci-precheck pass (check-deps) at edit time                                                                                                           |
| knip unused barrel re-exports reddened Lint on #7119                                                       | release.md, Release log item 3                                      | mechanical | knip in the pre-push path, not only CI                                                                                                                          |
| Duplicated tenant literal in a test on #7120                                                               | release.md, Release log item 3                                      | judgement  | reviewer subagent (caught it; keep as the carrier)                                                                                                              |
| Review-mandated seed never written to docs/backlog.md                                                      | review.md, Findings, third Medium                                   | judgement  | review.md template follow-ups: a seed is written in-stage, never deferred as prose                                                                              |
| Publish skip is invisible: release.yml concludes success while release-publish.sh skips on an unset secret | run 39205418242 log; GH Packages latest 0.2.0 vs package.json 0.8.0 | mechanical | a freshness check in the metrics-freshness.mjs family comparing the registry's latest rialto version against main's package.json when no changesets are pending |

Gotcha harvest (CLAUDE.md stage hook): ran
`kb.py harvest <main checkout> --days 5` — 124 transcripts, 10
failed-then-fixed arcs, 27 recurring tool-error patterns. The dominant arc
class (worktree-isolation Bash classifier rejecting heredocs, `git commit
-F`, `gh pr create --body-file`) is already documented by open PR #7323's
gotchas entry; no new gotchas bullet is proposed from this run's sessions.
Zero new findings is the honest result.

## Idea seeds

Appended to `docs/backlog.md`:

- JWKS precedence split: when `AUTH0_JWKS_URL` and `AUTH_AUTHORITY` are both set and differ, `/health` probes the former while `/ready` probes the latter — unify precedence in the service-bootstrap JWKS module (F2).
- Rialto publish pipeline: provision `RIALTO_PACKAGES_TOKEN` or retire the GitHub Packages publish; 0.8.0 is versioned on main while the registry serves 0.2.0, and the skip reads as workflow success.
- Delete the dead `@mbe/api-client` lines from `services/reservations/Dockerfile` and audit the users Dockerfile (F1), plus a guard that flags Dockerfile COPY/build lines naming workspace packages outside that service's dependency closure.

## Run complete

Closed 2026-10-22. Seeds above are the input to the next Idea-stage run.
The rialto npm-consumer outcome is the one unfinished thread; it rides on
the Owner's `RIALTO_PACKAGES_TOKEN` decision, tracked in Open debt.
