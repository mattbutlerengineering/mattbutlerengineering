---
stage: ship
run: feature:zone-batch-nonstrict-main
date: 2026-10-18
outcome: released
released-at: 2026-10-19
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7110
assumptions:
  - "Two releases are in play. The feature itself (#6678 `d1047723e`, merged 2026-10-15T05:37:59Z, with ADR-027 via #6661 `14c71bc53`) already reached users, so that part is released and needs no release action here. WO-30 (`39204320e`, Review's Major) is new code on this branch and has not merged. The outcome is therefore `prepared`, not the `released` the brief's Resume section expected; it becomes `released` when this PR merges."
  - "Release authorization: the brief grants none for merge or deploy, but its Resume section says the orchestrator opens the PR and leaves it for the Owner. Push plus PR is taken as authorized; merge, auto-merge and deploy are not done."
  - "Deploy surface: `scripts/issue-zone.mjs` is run from a checkout by implement-queue's compose hook. It ships to users by merging to `main`; there is no deploy step and no published package."
  - "Pre-flight ran the local-ci-precheck steps directly (the skill is disable-model-invocation), plus `pnpm regen --check`, prettier on the run directory and the touched scripts, and the three zone test files."
---

# Release: same-zone batching when `main` is not strict, plus WO-30

## Pre-flight

Final head before this artifact: `0d1e7fb25`. Node v22.22.3 (matches
`.nvmrc`).

- [x] Verification green. `verification.md` has 6/6 PRD criteria PASS,
      re-verified at `39204320e` after WO-30 (§ Re-verification after
      WO-30).
- [x] Review: no critical finding. The one Major was fixed in-run as
      WO-30 at the Owner's decision. Five Minors are deferred (listed
      below).
- [x] No secrets in the diff. The code diff is `scripts/issue-zone.mjs`
      and its test file. No configuration is needed in any environment.
- [x] No migrations or data changes.
- [x] No new ADR in this branch. ADR-027 merged earlier via #6661 and has
      its README index row.
- [x] Rollback plan concrete (below).
- [x] `pnpm install --frozen-lockfile` → exit 0.
- [x] `pnpm lint` → exit 0 (52/52 tasks).
- [x] `pnpm typecheck` → exit 0 (52/52 tasks).
- [x] Architecture audit (`@mbe/cli` build, `check-adr`, `check-deps`) →
      exit 0, "No architectural violations detected."
- [x] Drift lane: `pnpm build --filter "@mbe/cli..."`, `pnpm graph`,
      `pnpm generate:dep-graph`, then `git diff --exit-code` on both graph
      files → clean. `mbe pack <dir> --check` for every `llms.txt`
      package → no stale package.
- [x] `pnpm regen --check` → exit 0, "All generated artifacts are up to date."
- [x] `pnpm exec prettier --check docs/features/zone-batch-nonstrict-main/
scripts/issue-zone.mjs scripts/__tests__/issue-zone.test.mjs` →
      exit 0, "All matched files use Prettier code style!"
- [x] Zone tests (`issue-zone`, `main-strictness`, `zone-vocabulary`) →
      3 files, 109 passed.

## WO-30: the fix in this PR

Review found that the path-token pattern `[\w.-]+` kept a sentence-final
`.` or `...`. So `a.ts.` and `a.ts` compared as different files. Two
issues that named the same file could share a batch, and the
shared-registry hotspot lock could be dodged in both `strictMain` modes.
Real issue #7042 has exactly that shape (`.claude/rules/gotchas.md.`).

The fix adds `matchPathTokens`, which strips trailing `.` and `,` from each
token at extraction. `pathsOverlap` and `hotspotLocks` both read the
normalised tokens. Interior dots (`a.ts`, `.claude/`, `llms-full.txt`)
are untouched.

RED/GREEN, from `verification.md` § Re-verification after WO-30. The same
cases ran through the real module before the fix (`5ed44c0db`) and after
(`39204320e`):

```
case                     before (5ed44c0db)   after (39204320e)
E1 strictMain:false      [1,2]                [1]
E2 strictMain:false      [1,2]                [1]
hotspot strictMain:true  [1,2]                [1]
hotspot strictMain:false [1,2]                [1]
```

`issue-zone.test.mjs` went from 82 to 87 tests: E1, E2, the hotspot case
in each mode, and "real dotted paths survive normalisation". Full
`pnpm --dir scripts test`: 5680 passed.

The fix only makes more pairs defer. It cannot make a pair batch that
deferred before.

## Rollback plan

Door: two-way. The change is a pure function in a script read from a
checkout; reverting the squash commit restores the old behaviour on the
next compose call.

Blast radius: implement-queue batch composition only. If the call is
wrong, the worst case is fewer issues per batch (over-deferral). Nothing
in production services, apps or data reads this module.

```
git revert <squash-sha-of-this-PR>
git push origin HEAD:refs/heads/revert-wo30   # then open a PR to main
```

To roll back the whole feature (#6678), revert `d1047723e` the same way.
ADR-027 then needs a status line saying it was reverted.

## Release log

1. Pre-flight above → all green.
2. Commit `docs(zone-batch-nonstrict-main): ship — prepared` → this file.
3. `git push -u origin docs/zone-batch-close` → new branch, remote SHA `e191ed4e6` == local (`git ls-remote`).
4. PR opened to `main` → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7110. Not merged, auto-merge not
   enabled, nothing deployed.

## Post-release checks

- #6678 (already released): `node scripts/main-strictness.mjs` in a git
  checkout → `{"strictMain":false}` (verification.md, 2026-10-19T01:16Z).
  The relaxed mode is live. The probe must run inside a git checkout:
  `gh api repos/{owner}/{repo}/…` resolves those placeholders from the
  working directory's git remote, so run outside a checkout it fails and falls back (correctly) to
  `strictMain: true`.
- Real implement-queue use since ship: exactly one batch was composed by
  the selector with the probe, and it held 0 same-zone pairs. Operate's
  minimum (5 such batches) has not arrived.
- WO-30: not yet released. Its check is the four cases above, which pass
  on the branch head.

## Deferred minors (from review.md)

1. **ADR-027's Decision section contradicts the default mode.** #6811
   inserted a cross-zone shared-registry lock into ADR-027's Decision. That
   lock applies in `strictMain: true` too, so the default no longer
   reproduces ADR-023's rule exactly. Needs a short amending ADR, plus an
   "amended by" line on ADR-027.
2. **The probe cannot tell "strict" from "could not read".** Both print
   `{"strictMain":true}`. Reading branch protection needs
   Administration:read. Cloud implement-queue routines may be falling back
   to strict on every iteration with no signal. Unmeasured; settled by
   running `node scripts/main-strictness.mjs` once in a Claude Code Remote
   session. Fix: add a `source` field (`measured` vs `unavailable`).
3. **Generated `llms*.txt` files are invisible to the overlap check.** Most
   same-zone source changes also rewrite the package's `llms-full.txt`. No
   conflict observed yet.
4. **Stale "main is strict" premise.** `.claude/implement-queue.md:42` and
   the `scripts/issue-zone.mjs` header still state it unconditionally.
   ADR-027 Consequences' "never correctness" overstates the safety: an
   under-estimate costs conflicts and rework, not just throughput.
5. **Out-of-zone-only paths still stack.** An issue whose only extracted
   paths lie outside its own zone counts as non-pathless and can batch.
   Seen 0 times in 31 sampled zoned issues.

## Open for the Owner

**Which dispatch paths should route through the selector?** Most parallel
work since ship never called it: hand-dispatched sessions, `mbe-feature-drain`
and `mbe-swarm` claim issues by their own protocol. The one real hazard the
selector would have caught (cluster B: three localization issues sharing a
catalog JSON, 6 merge-from-main commits) went through that bypass. At the
current rate Operate's 5-batch signal will not arrive. Choosing the paths is
new work (a seed or capture), not a fix to this change.

## Outcome

Released. #6678 was live on `main` since 2026-10-15; WO-30 merged via the
pull request named in `pending-merge:` (#7110, squash `333a15e4a`,
2026-10-19T02:37:44Z, read back via
`gh api repos/{owner}/{repo}/pulls/7110` on 2026-10-22). Write-back
performed 2026-10-22 per the protocol's Ship-outcome section; the run now
waits at Operate on its minimum-signal.
