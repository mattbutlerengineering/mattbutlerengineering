---
stage: ship
run: feature:bootstrap-worktree
date: 2026-11-02
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8168
assumptions:
  - "Release authorization is not granted (brief, Resume 2026-11-02): prepare and stop. No merge, deploy, publish, tag, changeset release, or issue close/comment was performed."
  - "The feature's code was released when #6676 merged to main (74dcac071, WO-7..10, plus WO-6 core from #6662, bee4aa325). This run's branch carries no product-code diff; what is pending is the artifact PR #8168 (autorun-brief resume, verification.md, review.md, release.md)."
  - "Pre-merge conditions from review.md (Owner decision 2026-11-02) were NOT run: host load average was 22.90 at Ship time, above the ~4 idle threshold. Recorded as unmet pre-merge steps with exact commands below."
  - "docs/launch-demo.json does not exist in the repo, so the launch-brief step does nothing and writes nothing."
  - "Tracker interaction: none. #6634 is closed and was not reopened or commented on; the PR body carries no `Closes` line and a `No work order:` line."
---

# Release: `pnpm bootstrap:worktree` — prepared (artifact PR pending merge)

## Pre-flight

- [x] Soft gate: `review.md` has no critical findings; verdict "ready to proceed to Ship, with two conditions". Two Majors (SC-2, SC-5) are open, deferred by the Owner in-session, each tied to a pre-merge step below.
- [~] Verification green — **not fully**. `verification.md`: 5 PASS, SC-2 FAIL (10.9–12.3 s, host at load 22–45, script alone 1.37 s), SC-5 PARTIAL (`conductor-gate.sh` red on `@mbe/config#test` timeouts under load; both failing packages pass in isolation). Carried as open Majors per the Owner decision, not hidden. Not "green" until the two pre-merge steps pass.
- [x] No secrets in the diff: `git diff origin/main...HEAD` is 3 docs files (4 with this one); a case-insensitive scan for key/secret/token/password/private-key patterns matched only review prose ("No secrets, no network…"). No configuration required in any target environment (docs only).
- [x] Migrations/data changes: none.
- [x] ADRs: none added (architecture.md: "No ADR consumed"; ADR 89–91 unused). Nothing to renumber or index.
- [x] Rollback plan concrete (below).
- [x] Branch pushed with repo pre-push hooks run, not bypassed. Output: "No new migration files found — skipping destructive check"; antipattern scan "All patterns within baseline. No regressions detected."; regen `--check --git-only`: "All generated artifacts are up to date."

### Pre-merge conditions (UNMET — not run)

`uptime` at Ship time: `load average: 22.90, 25.44, 26.21` — not idle, so neither condition was run (a number measured on this host would repeat the confound verification already recorded). Run both on an idle host (load average < ~4) from a checkout containing the feature (any worktree on current main):

1. SC-2 no-op budget (< 5 s):
   ```
   pnpm bootstrap:worktree            # first run: installs/builds if needed
   time pnpm bootstrap:worktree       # second run, nothing to do: real must be < 5 s
   ```
2. SC-5 gate:
   ```
   bash scripts/conductor-gate.sh     # must exit 0
   ```

**Either red reopens its Major finding (SC-2 / SC-5 in review.md) and BLOCKS merge of #8168.** If SC-2 is still ≥ 5 s with the script near 1.4 s, the remedy is a PRD decision (restate SC-2 as the script's own cost, or have step 0 call `node scripts/bootstrap-worktree.mjs` directly), not a code defect (review.md).

## Rollback plan

Door: two-way — the pending change is documentation only; reverting the merge commit restores the tree exactly. The earlier code release (#6676) is also two-way (a script, a hint-only hook that always exits 0, and doc pointers).

Blast radius: for this PR, none at runtime — only `docs/features/bootstrap-worktree/*` changes. If the feature code itself were wrong, the worst case is a dev-tool hint line at SessionStart or a mutating `pnpm bootstrap:worktree` in a worktree; nothing deployed or user-facing.

(Same call as the PR body's `## Merge danger`.)

```
# Before merge: close the PR, nothing landed
gh pr close 8168 --delete-branch=false

# After merge of the artifact PR:
git revert -m 1 <merge-commit-sha>     # on a branch from main, then open a PR

# To undo the feature code itself (#6676), on a branch from main:
git revert -m 1 74dcac071 bee4aa325   # [INFERENCE] confirm each is a squash/merge commit first; drop -m for squash commits
# Quick local disable of the hint without a revert: remove the worktree-bootstrap-hint.sh
# entry from .claude/settings.json (SessionStart, beside session-log-rotate.sh).
```

## Release log

1. Code release (prior): feature code merged to main via #6676 (`74dcac071`) → already on main; this run did not re-release it.
2. `uptime` → `15:28:41 up 18 days, load average: 22.90, 25.44, 26.21` → above idle threshold; SC-2 re-measure and `conductor-gate.sh` re-run deferred as unmet pre-merge steps (see above).
3. Checked `docs/launch-demo.json` → absent; launch brief skipped.
4. `git push -u origin docs/bootstrap-worktree-autorun` → success, pre-push hooks passed (details in Pre-flight).
5. `gh pr create --base main` (non-draft, no auto-merge, no labels) → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8168
6. Merge, deploy, publish, tag, changeset release, issue closing → NOT performed (no release authorization).

## Post-release checks

- None applicable: nothing was released this stage. The user-facing surface is "none — developer/agent tooling only" (brief); the code's post-release behaviour was exercised in `verification.md` (SC-1 fresh-worktree bootstrap + `tsc --noEmit`, no TS2307; SC-3/4 pass).
- Tracker mirror: no intake issue; no issue closed or commented.

## Outcome

Prepared, not released. Code is already on main via #6676; the artifact PR #8168 is open, unmerged, and waits for the Owner. Merge steps once authorized:

1. On an idle host, run the two pre-merge conditions above; both must pass. Red → reopen the Major, do not merge.
2. Owner reviews #8168 and merges it (e.g. `gh pr merge 8168 --squash`, only on the Owner's go-ahead).
3. Operate is skipped by the brief (`operate: skip`); the run stays active until someone has feedback to capture.
