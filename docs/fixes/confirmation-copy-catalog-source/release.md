---
stage: ship
run: maintenance:confirmation-copy-catalog-source
date: 2026-10-17
assumptions:
  - "Run scale: a maintenance fix to one hospitality component, three catalogs and their tests. Ship scaled to that blast radius: full pre-flight (the local-ci-precheck lanes, run sequentially), no ADR work, no launch brief."
  - "Who releases: the brief makes the merge of PR #7016 the release, and the orchestrator executes it through the implement-queue gate after this stage. This stage prepared the release and did not merge, tag or deploy. The Release log records the release step as pending, not as done."
  - "Merge form: `--auto` by default. GitHub reported `mergeStateStatus: BLOCKED` at pre-flight because CI Gate had not reported yet. If GitHub reports CLEAN or UNSTABLE-mergeable at merge time, `gh pr merge` without `--auto` (the repo memory note: CLEAN PRs refuse `--auto`)."
  - "Reviewed head for `--match-head-commit`: the head after this release record lands. This commit is docs-only (`docs/fixes/...`). The code reviewed in review.md is unchanged from `eb7b6ebe7`, so the orchestrator matches the final branch head, not an older SHA."
  - "No version or tag: hospitality is a private app deployed by Deploy Static Sites on merge. No changeset, because no published package changed."
  - "Launch brief: `launch_demo.py config` printed `NONE` (no config in this repo), so the skill's default is to do nothing and write nothing."
---

# Release: one source for the Special Requests copy (PR #7016)

## Pre-flight

All against branch head `3a83be1f7` (equal to `origin/fix/confirmation-copy-catalog-source`; 0 commits behind `origin/main` `6ede6b9df`), Node v22.22.3, worktree `.claude/worktrees/confirmation-copy-catalog-source`. The local-ci-precheck lanes ran one at a time, as the repo's Ship hook requires.

- [x] **Verification green.** `verification.md`: `10 criteria checked, 10 PASS, 0 FAIL`. review.md verdict: **Ready to ship**, no critical or major findings. Review's three test-only fixes (`eb7b6ebe7`) were re-checked in verification.md: `Tests 2983 passed`, E2E `21 passed` on :3061.
- [x] **local-ci-precheck lanes** (`.claude/skills/local-ci-precheck/SKILL.md`, run in order):
  - `pnpm install --frozen-lockfile`: `Done in 3.7s`, exit 0
  - `pnpm lint`: `Tasks: 52 successful, 52 total`, exit 0
  - `pnpm typecheck`: `Tasks: 52 successful, 52 total`, exit 0
  - architecture audit (`@mbe/cli` build, `check-adr`, `check-deps`): `✅ No architectural violations detected.` / `✅ All external dependencies are consistent across the monorepo.`, exit 0
  - drift: `pnpm graph` + `pnpm generate:dep-graph`, then `git diff --exit-code` on both graph files, was clean (exit 0). `mbe pack <dir> --check` was in sync for all 27 `llms.txt` packages. `pnpm regen --check`: `All generated artifacts are up to date.` `git status` was clean afterwards.
- [x] **No secrets in diff.** The added lines in `git diff origin/main...HEAD` have no match for live Stripe keys, AWS key ids, PEM private-key headers or JWTs. The diff is copy, catalogs, tests and generated `llms*.txt`. It needs no new configuration in the target environment: Deploy Static Sites uses its existing secrets.
- [x] **Migrations/data changes.** None. No schema, API, storage or package boundary changed.
- [x] **ADRs.** The run added none (the `git diff --name-only origin/main...HEAD` list has no `docs/adr/` path).
- [x] **Rollback plan concrete** (below).
- [ ] **CI Gate on the PR head:** `node scripts/ci-gate-status.mjs check --pr 7016` → `{"state":"pending","reason":"CI is running but CI Gate has not reported yet"}`, at head `3a83be1f7` (CI run `39047319939` in progress). Pushing this release record starts a new CI run on the new head. **The merge gate must see `green` on the final head before merging.** This stage does not certify that. (CI Gate was green on the earlier head `cd876177a`, per verification.md.)
- **Advisory, pre-existing red:** `Apps Visual Regression` (`Visual Regression (hospitality)`) concluded `failure` on `3a83be1f7` (run `39047319963`). It is not in `ci-gate`'s needs; the required contexts are `["CI Gate"]`. It is pre-existing. review.md has the evidence: PR run `39045775211` and main push run `39018517789` fail on the same nine snapshots, and `apps-visual.yml` was red on main pushes `546d1d44b`, `53e882fdd` and `1bb58e903` before this PR existed. `visual.spec.ts` builds reservations with `notes: null` and never opens one, so `SpecialRequestsTicket` appears in no baseline.
- PR state at pre-flight: `OPEN`, not draft, `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED` (CI Gate pending), label `tier:standard`, auto-merge not armed.

## Rollback plan

Door: two-way. A revert undoes it. The change is hospitality UI copy and test code only: no data, no migration, no published package, no public interface.

Blast radius: hospitality staff who use the Timeline Special Requests ticket. If the call is wrong, the ticket's label or caption reads wrong or shows a raw key, in one or more staff locales (en-US, en-GB, es-MX, fr-CA). Guest pages read the same `bookingWidget.specialRequests` keys, so a broken acknowledgement key would also show on the guest confirmation and manage pages. Nothing else changes, and no data is touched.

```
# 1. Revert through CI (never a manual deploy: deploys go through GH Actions only)
gh pr view 7016 --json mergeCommit --jq .mergeCommit.oid      # -> <merge-sha>
git fetch origin && git switch -c revert/confirmation-copy-catalog-source origin/main
git revert --no-edit <merge-sha>
git push -u origin revert/confirmation-copy-catalog-source
gh pr create --base main --title "revert: one source for the Special Requests copy (#7016)" \
  --body "Reverts #7016. Reason: <observed defect>."
# merge once CI Gate is green; the merge to main triggers Deploy Static Sites

# 2. Confirm the redeploy took: read the JOB, not the workflow rollup
gh run list --workflow deploy-static.yml --branch main --limit 5 \
  --json databaseId,headSha,conclusion
gh run view <run-id> --json jobs \
  --jq '.jobs[] | select(.name=="Deploy Hospitality" or .name=="Deploy Blocked" or .name=="Post-Deploy Verification") | [.name,.conclusion] | @tsv'
#    Deploy Hospitality must be `success`. If `Deploy Blocked` ran and Deploy
#    Hospitality is `skipped`, the circuit breaker is open: the run reads green
#    but deployed nothing. Reset it with
#    `gh workflow run circuit-breaker.yml -f force=true`, then re-dispatch.
```

`deploy-static.yml` also has its own `Rollback Failed Deploys` job (`Rollback hospitality`), which runs when the deploy itself fails. That covers a failed deploy, not a deploy that succeeds with wrong copy, which is why the revert path above is the plan.

## Release log

1. Pre-flight lanes (above) → all green at `3a83be1f7`. CI Gate pending (CI run in progress).
2. `python3 <plugin>/launch_demo.py config` → `NONE` / `launch-demo: 0 problem(s)`. No launch brief; nothing written.
3. This release record committed (docs-only) and pushed. The final head is the one the orchestrator's merge gate reviews.
4. **Pending (orchestrator, after this stage):** the implement-queue gate (fast-path classifier, or the universal `reviewer` plus the diff-matched `e2e-selector-drift-reviewer`, since `e2e/special-requests.spec.ts` changed), then CI Gate `green` on the final head (`node scripts/ci-gate-status.mjs check --pr 7016`), then:

   ```
   gh pr merge 7016 --squash --auto --match-head-commit <final reviewed head> \
     --subject "fix(hospitality): one source for the Special Requests copy; localize the host ticket (#7016)" \
     --delete-branch
   ```

   Drop `--auto` if GitHub reports `CLEAN`, or `UNSTABLE` and mergeable. The explicit `--subject` follows the gotcha that GitHub may take the squash subject from a stale PR title. The merge to `main` triggers Deploy Static Sites (job `Deploy Hospitality`), and that deploy is the release.

## Post-release checks

To run after the merge. None has run yet.

- **Deploy job, not rollup.** Find the `Deploy Static Sites` run whose `headSha` equals the merge SHA (`gh run list --workflow deploy-static.yml --branch main --json databaseId,headSha,conclusion`, filtered on `headSha`, not `--commit`). In `gh run view <id> --json jobs`, `Deploy Hospitality` must be `success` and `Post-Deploy Verification` must be `success`. `Deploy Blocked` running with `Deploy Hospitality` `skipped` means nothing deployed.
- **Prod serves the new strings.** Fetch `https://mattbutlerengineering.com/hospitality/`, follow its script and lazy-chunk URLs, and confirm:
  - the es-MX chunk contains `Los invitados ven esto con:` and the fr-CA chunk contains `Les clients voient ceci avec :`, each followed by `$t(bookingWidget.specialRequests.acknowledgement)`
  - the acknowledgement literal appears **exactly once per locale** across the deployed assets: en-US `Noted. It's on your reservation for the team.`, es-MX `Anotado. Ya está en tu reserva para el equipo.`, fr-CA `C’est noté. C’est inscrit à votre réservation pour l’équipe.`
  - no asset contains `CONFIRMATION_COPY`

  Cross-check DNS with `dig @1.1.1.1` if a fetch fails: the local LAN resolver sinkholes some hosts.

- **Sentry.** Look for no new hospitality errors from the Timeline or booking-widget surfaces in the hour after deploy.

## Follow-ups

Proposed backlog lines, not yet written to `docs/backlog.md`:

- `docs: point remembered-on-arrival/architecture.md (~lines 6, 37, 52, 84, 154) at the en-US catalog key bookingWidget.specialRequests.acknowledgement (nested by hostCaption) instead of the deleted constants/confirmation-copy.ts, with a dated note. architecture.md is an implement-queue gate path, so this is a docs-only PR that a human merges. (from confirmation-copy-catalog-source review, deferred minor)`
- `test(hospitality): extend the SC8 honesty word list to the es-MX and fr-CA Special Requests copy (acknowledgement, hostCaption, contact line), for example "garantizado" and "confirmé", so a machine retranslation cannot add an overclaim unseen. (remembered-on-arrival review finding 3; deferred again here)`
- `lint: no-literal-ui-strings cannot see UI strings imported from constants/* modules (how the English host ticket passed). Make the rule follow constants/* imports, or ban copy literals in constants/. constants/session-lapse-copy.ts may hide the same gap. (confirmation-copy-catalog-source defect.md Notes)`
- The manage-page error copy that still mentions a confirmation email already has a `docs/backlog.md` seed (owner Matt). No new line.

## Outcome

**Prepared, not yet released.** Pre-flight is green locally and the rollback plan is concrete. The release, which is the merge of PR #7016 followed by the Deploy Static Sites `Deploy Hospitality` job, belongs to the orchestrator's implement-queue gate and waits on CI Gate `green` on the final head. Post-release checks are listed above and still to run. Next stage after release: Operate.
