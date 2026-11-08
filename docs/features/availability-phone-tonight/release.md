---
stage: ship
run: feature:availability-phone-tonight
date: 2026-11-08
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8533
assumptions:
  - "No release authorization: the Owner asked to keep improving, not to merge. Prepare-and-stop."
  - "Stacked release: #8533 targets feat/availability-scenario-ux (#8528), which targets feat/availability-setup-hierarchy (#8511). Merge order #8511 → #8528 → #8533; GitHub retargets each as its base merges."
---

# Release: Availability on a phone, and what's on tonight

## Pre-flight

- [x] Verification green: verification.md, 10/10 criteria, 547/547 e2e. The only check not run is a human walkthrough, recorded as such.
- [x] No secrets in the diff.
  - The fake-session generator lives in `/tmp`, outside the repo.
  - `apps/hospitality/e2e/.auth/user.json` is gitignored.
  - `llms-full.txt` holds no harness code (`grep fake-tenant` → 0).
- [x] No migrations or data changes.
- [x] No ADR added.
- [x] Rollback plan concrete.

## Rollback plan

**Door: two-way.** Reverting restores #8528's page. No API, schema, engine or migration change.

**Blast radius:**
- Every viewer of `/availability` sees the Today line in the header's subtitle slot.
- Phone users of the week form get service lines.
- The Timeline accepts `?tonight=open`.

No stored data needs repair.

```
# After #8533 merges (into main, after #8511 and #8528) as <sha>:
git checkout main && git pull
git revert <sha>             # merge commit: git revert -m 1 <sha>
git push origin HEAD:refs/heads/revert-8533 && gh pr create --base main --head revert-8533 \
  --title "revert: availability phone lines and Today line (#8533)" --body "Rollback per docs/features/availability-phone-tonight/release.md"
# deploy-static.yml redeploys apps/hospitality on merge of the revert; no data step.
```

## Release log

1. Pre-flight on `d568ea52b`:
   - The antipattern ratchet is within baseline.
   - `pnpm regen` was committed; `pnpm regen --check` reports up to date.
   - The new spec has no `console`, `/tmp` or screenshot code.
2. `git push -u origin feat/availability-phone-tonight` with hooks: exit 0. Remote `d568ea52b` matches local.
3. `gh pr create --base feat/availability-scenario-ux` → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8533. Merge danger: two-way, matching this plan.
4. Launch brief: the repo's launch-demo config is `NONE`, so nothing was written.
5. PR CI on `0efe242dd`: 17 pass, 6 skipping, 1 pending (Capture E2E Screenshots, advisory), 1 fail.
   - Hospitality E2E shards 1–3 pass with the real Auth0 session.
   - The one failure is Visual Regression (hospitality), which is advisory. The snapshots `availability@1280x720`, `availability@375x812`, `setup@1280x720` and `setup@375x812` differ from `main`'s baselines. These are the same four as #8511 and #8528, screens the stack changes by design.
   - The main CI workflow (unit, typecheck, lint, CI Gate) runs only on pull requests into `main`, so it runs when #8533 is retargeted. Locally on the same code: 419/5911 unit tests pass, typecheck has 0 errors, lint has 0 errors.
6. Stopped: no merge without the Owner.

## Post-release checks

Not run: nothing has reached users. After #8511, #8528 and #8533 merge and deploy, check https://mattbutlerengineering.com/hospitality/availability:
- The header reads "Today · <date> · <hours>" with what's in force tonight.
- "Change tonight" opens the Timeline's Tonight panel.
- On a phone, the week form shows one line per service.

Visual baselines change on `/availability`; `visual-regen-trigger.yml` opens the baseline PR after merge.

## Outcome

Prepared and stopped. Waiting on #8533, named in `pending-merge:`, which sits behind #8528 and #8511.
