---
stage: ship
run: feature:availability-scenario-ux
date: 2026-11-08
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8528
assumptions:
  - "No release authorization: the Owner asked to keep improving, not to merge. Prepare-and-stop: branch pushed, pull request opened, merge left to the Owner."
  - "Stacked release: #8528 targets feat/availability-setup-hierarchy (#8511). #8511 merges first; GitHub then retargets #8528 to main."
---

# Release: Availability, the everyday edits

## Pre-flight

- [x] Verification green: `verification.md` 12/12 criteria pass; the only check not run is a human walkthrough (recorded as such).
- [x] No secrets in the diff; the throwaway screenshot harnesses were deleted before every regen, and `llms-full.txt` holds no harness code (`grep fake-tenant` → 0). No new configuration needed.
- [x] No migrations or data changes.
- [x] No ADR added.
- [x] Rollback plan concrete (below).

## Rollback plan

Door: two-way. A revert restores #8511's page. There is no API, schema or engine change, and saves use the same endpoints and payloads.

Blast radius: Managers see the new week form, Close dialog and quiet calendar. Onboarding's hours step shares the form, so it gets the same days control and preset placement. Hosts see the quiet calendar. No stored data needs repair if the call is wrong.

```
# After #8528 merges (into main, once #8511 has merged) as <sha>:
git checkout main && git pull
git revert -m 1 <sha>        # squash merge: git revert <sha>
git push origin HEAD:refs/heads/revert-8528 && gh pr create --base main --head revert-8528 \
  --title "revert: availability everyday edits (#8528)" --body "Rollback per docs/features/availability-scenario-ux/release.md"
# deploy-static.yml redeploys apps/hospitality on merge of the revert; no data step.
```

## Release log

1. Pre-flight on `4575ec42f`:
   - `node scripts/check-ai-antipatterns.mjs` first reported `noopTestAssertions 19 → 20`. The cause was a screenshot-only test left in `availability-everyday.spec.ts` from the review request; it was removed along with its `/tmp` screenshot helper (`b061bd3c2`), and the ratchet is back within baseline. The everyday spec now has 15 tests, all passing.
   - `pnpm regen` committed (`4575ec42f`); `pnpm regen --check` reports up to date.
2. `git push -u origin feat/availability-scenario-ux` with hooks: exit 0; remote `4575ec42f` = local.
3. `gh pr create --base feat/availability-setup-hierarchy` → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8528. Merge danger: two-way, matching this plan.
4. Launch brief: the repo's launch-demo config is `NONE` (checked for #8511 the same day), so nothing was written.
5. Stopped: no merge without the Owner.

## Post-release checks

- Not run: nothing has reached users. After #8511 and then #8528 merge and deploy, check https://mattbutlerengineering.com/hospitality/availability as a Manager:
  - Close… offers Tonight, Tomorrow and the next holidays, and its button and toast name what closed.
  - The month view is quiet with a legend.
  - On a phone, the week form's Save stays in reach while editing.
- Visual baselines change on `/availability`, `/setup` and the Close dialog by design. `visual-regen-trigger.yml` opens the needs-review baseline PR after merge.

## Outcome

Prepared and stopped, waiting on the pull request named in `pending-merge:` (#8528, behind #8511).
