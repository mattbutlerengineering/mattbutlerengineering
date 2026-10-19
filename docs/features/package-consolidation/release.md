---
stage: ship
run: feature:package-consolidation
date: 2026-10-19
outcome: released
released-at: 2026-10-19
assumptions:
  - "outcome is `released` because the nine squash merges are on main and the three services deployed through CI (`Deploy Services`, job-level success; DO deployment ACTIVE 21/21 per the orchestrator). The rialto npm publish is NOT part of this outcome: it is an Owner-triggered Release workflow (brief: the run adds a changeset and never publishes), and Release PR #7114 is open and untouched."
  - "release.md is written after the release actions, as a record. The orchestrator executed them; this stage re-ran none. Merge times, merge SHAs, PR/issue states, the three Deploy Services job conclusions and the production health bodies were re-confirmed read-only on 2026-10-19 (see log); the pre-merge fix narratives, infra-flake reruns, the DO deployment id/21-of-21, the advisory-check state, and the Verify-stage pre-flight claims are taken from the orchestrator and the run artifacts, not re-checked."
  - "No migrations in this run, so the migration pre-flight item is vacuously met (no schema or data change)."
  - "No ADR was added by this run, so the ADR-number pre-flight item does not apply (not re-derived with a tool)."
  - "Launch brief: `launch_demo.py config` printed `SHIP` / `launch-demo: 0 problem(s)`. This is an internal refactor with no user-facing surface and the stage was instructed to write only release.md, so the launch-demo skill was not run; a deliberate skip, logged below, not a failure."
  - "Secrets pre-flight rests on the PreToolUse secret-scan hook and CI Gitleaks being green on each merge result; the diffs were not re-scanned here."
---

# Release: Consolidate packages/ from 20 to 14

## Pre-flight

- [x] Verification green (`verification.md`: gates green on origin/main `cc000687e`, a descendant of the final merge; deploy criterion was marked pending there and is closed by this file).
- [x] No secrets in diff; no new configuration needed (pure moves/deletes; OTel deps moved into `service-bootstrap`). Taken from CI Gate (incl. Gitleaks) green on every merge result.
- [x] Migrations/data changes: none in this run, nothing to roll forward.
- [x] Review has no unfixed critical or high findings (`review.md`: three Medium, rest Low, deferred as F1-F5, listed below).
- [x] Rollback plan concrete (below).

## Rollback plan

Door: two-way for the services. Each PR is a self-contained squash and reverts cleanly, and no data or schema moved. Not two-way for rialto once 0.8.0 is on npm (a published version cannot be unpublished); that has not happened.

Blast radius: all three Fastify services (agent-api, users-api, reservations-api) are rebuilt from the moved code, so a bad call would show as failed deploys or a failed `/health`. Behaviour was meant to be unchanged. The one public-API change is rialto `ChatPanel`'s required `stream` prop, which only reaches consumers if Release PR #7114 is merged.

```
# revert in reverse merge order, each as its own PR, newest first
git revert 47b422d4d   # #7122 observability into service-bootstrap
git revert d60a2b7f1   # #7120 JWKS unify
git revert 63ebdef3f   # #7119 notifications into reservations
git revert 22f91d1a8   # #7116 jobs into reservations
git revert 02dc74217   # #7115 ChatPanel stream adapter
git revert 34a68fc82   # #7113 test-fixtures -> ui-quality-capture
git revert e556c13be   # #7109 supply-chain-scanner delete
git revert e9ca789c6   # #7112 agent-test-utils into agent-core
git revert a46734c53   # #7111 mcp-server delete
# then pnpm regen (build CLI first) and merge through CI Gate
# redeploy happens through the normal Deploy Services workflow on push to main
# if the circuit breaker is open: gh workflow run circuit-breaker.yml -f force=true
#   then gh workflow run deploy-services.yml
# DB: no migrations in this run, nothing to roll back
# rialto: do not merge #7114 (or close it) to keep 0.8.0 unpublished
```

## Release log

1. Launch brief: `python3 launch_demo.py config` -> `SHIP`, `launch-demo: 0 problem(s)`. Not run: internal refactor, no user-facing surface, this stage writes only release.md. Skipped on purpose.
2. Nine PRs squash-merged one at a time with `gh pr merge --squash --subject "... (#N)" --delete-branch`, each with `CI Gate` green on the merge result and a per-PR `reviewer` pass (CI/reviewer facts from the orchestrator; merge facts confirmed with `gh api repos/.../pulls/<n>`):

   | Order | PR    | Merge SHA | Closes | Merged (UTC) |
   | ----- | ----- | --------- | ------ | ------------ |
   | 1     | #7111 | a46734c53 | #7098  | 02:15:55Z    |
   | 2     | #7112 | e9ca789c6 | #7100  | 02:27:13Z    |
   | 3     | #7109 | e556c13be | #7099  | 02:51:33Z    |
   | 4     | #7113 | 34a68fc82 | #7101  | 03:06:53Z    |
   | 5     | #7115 | 02dc74217 | #7102  | 03:26:33Z    |
   | 6     | #7116 | 22f91d1a8 | #7103  | 03:39:29Z    |
   | 7     | #7119 | 63ebdef3f | #7104  | 04:02:34Z    |
   | 8     | #7120 | d60a2b7f1 | #7105  | 04:16:28Z    |
   | 9     | #7122 | 47b422d4d | #7106  | 04:43:57Z    |

   All on 2026-10-19. Confirmed: all nine `merged=true`; issues #7098-#7106 all `closed`. #7109 (supply-chain-scanner delete, #7099) was merged by a peer Claude session, not by this run; it had passed review 8/10 and CI. (The API reports every merger as `mattbutlerengineering`, so the peer-session attribution is the orchestrator's account.)

3. Hiccups fixed before merge, after CI or review caught them (orchestrator's account):
   - #7111: stale line in `tools/cli/CLAUDE.md` (Integrity) and a stray "(infra MCP server)".
   - #7112: a self-package import (Dependency Sync) and the restored no-type-escape guard.
   - #7116: stale README row (Integrity).
   - #7119: knip unused barrel re-exports (Lint).
   - #7120: duplicate tenant literal in a test.
4. Infra flakes, re-run and green on the second attempt (orchestrator's account; both are cold-cache effects of `pnpm-lock.yaml` changing, see gotchas): turbo cache server timeout (#7116 Build) and the tools/cli pack-helpers ts-morph 30s timeout (#7113 Test rest).
5. Advisory checks red throughout, not required, also red on main (orchestrator's account): Apps Visual Regression (hospitality) and Hospitality E2E (fails at "Wait for backend health", before any spec). Required context is `CI Gate` only.
6. Deploys, via CI only, no manual doctl or wrangler. Checked at job level with `gh run view <id> --json jobs`; the workflow-level `success` is not trusted (a skipped deploy also reads `success`):

   | Run         | Merge             | Circuit Breaker Check | Wait for CI | Deploy Blocked | Deploy API Services | Post-Deploy Verification | Report Deploy Health |
   | ----------- | ----------------- | --------------------- | ----------- | -------------- | ------------------- | ------------------------ | -------------------- |
   | 39197517860 | 63ebdef3f (#7119) | success               | success     | skipped        | success             | success                  | success              |
   | 39198648470 | d60a2b7f1 (#7120) | success               | success     | skipped        | success             | success                  | success              |
   | 39200947778 | 47b422d4d (#7122) | success               | success     | skipped        | success             | success                  | success              |

   DO deployment `a64c38ad-b72b-489b-881a-fcea80c3d28d` ACTIVE 21/21 for the final merge (orchestrator's account, not re-queried).

7. Rialto: `.changeset/chatpanel-injected-stream.md` (minor) added by #7115. Release PR #7114 "chore: version packages" is `open`, unmerged (confirmed), rialto 0.8.0 including "#7115 ChatPanel now takes a required `stream` prop". This run did not merge it and did not run `npm publish`.
8. Tracking issue #7107: still `open` (confirmed). Left open for the Owner / Operate.

## Post-release checks

Re-run by this stage at 2026-10-19T05:11Z against https://api.mattbutlerengineering.com:

- `/api/v1/users/health` -> 200, `status: ok`, `version` `47b422d4d52e7e9733689880f5841a290a603c9b`, database ok (10 ms), slow_queries ok, auth0 ok (24 ms), pool ok, error_rates not degraded.
- `/ready` -> 200, `{"ready":true,...}` with database ok and auth ok.
- `/api/v1/reservations/health` -> 200, `status: ok`, same version `47b422d4d52e...`, database ok (10 ms), auth0 ok (20 ms).
- agent-api: NOT independently probed. It has no known health route under that prefix (guesses 404), so it is covered only by the ACTIVE 21/21 deployment and the Post-Deploy Verification job. Do not read this file as a direct health reading of agent-api.
- Sentry has not been read yet. That is the Operate signal.
- Intake issue: not applicable (feature run, no `intake:`).

## Outcome

Shipped with hiccups, all listed above and none open: five pre-merge fixes after CI or review caught them, and two cold-cache infra flakes that passed on rerun. `packages/` is 14 packages on main; three services deployed through CI and answer 200 on the final merge SHA.

`outcome: released` covers the services only. The rialto npm publish is a separate Owner-triggered release and has not happened.

## Follow-ups for the Owner

- Rialto 0.8.0: merge #7114 when the Owner wants it published. Decision to flag: `ChatPanel`'s `stream` is a required prop shipped in a minor. `review.md` grades it Medium and recommends keeping it (the component was unusable from npm before, since it imported a private package).
- F1: delete the dead `@mbe/api-client` lines in `services/reservations/Dockerfile`, and check the users Dockerfile.
- F2: write the `/health` vs `/ready` JWKS precedence seed to `docs/backlog.md`.
- F3: reword the garbled comments in `packages/sentry/src/node.ts` and `node.test.ts`; sweep the stale text (`knip.jsonc:4` and `:54`, `streaming.ts:6`, `CommandPaletteExamplePage.test.tsx:51`).
- F4/F5: optional items per `review.md`.
- Close tracking issue #7107.
- Merge the run branch's docs PR (opened by the orchestrator after this stage); it awaits the Owner.

## Operate

Per the brief: wait 3 days after the last merge (47b422d4d, 2026-10-19 ~04:44Z), so the earliest is 2026-10-22. Minimum signal: `Deploy Services` job-level success on the final merge (already true), health green on all three services, and a Sentry read for agent-api, users-api and reservations-api since the first merge. The run stays ACTIVE until `retro.md`.
