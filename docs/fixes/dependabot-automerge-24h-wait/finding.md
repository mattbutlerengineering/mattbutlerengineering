# Why armed Dependabot auto-merge (#6577) waited 24h

Finding for #6651. Verdict: **no eligibility, gate, or auto-merge bug. `CI Gate` was genuinely red, so GitHub correctly held the armed merge.** No code change is warranted.

## Evidence

- Branch protection (`main`): `{"strict": false, "contexts": ["CI Gate"]}`. Being behind `main` did not block it.
- Auto-merge armed 2026-10-13T22:10:20Z (`auto_squash_enabled`, actor `github-actions[bot]`) and was never disabled: the timeline has no `auto_merge_disabled` event.
- CI did run on both heads Dependabot pushed. This is NOT `gate-missing`, `gate-unattributed` or `action_required`:
  - Head `cee7b309`: `CI` run 38475912631 concluded `failure`. Failed jobs: `Typecheck`, `Lint`, `AI Antipattern Ratchet`. Commit status `CI Gate` = `failure` at 22:14:29Z.
  - Head `3f6407ca` (Dependabot re-push, 22:10:53Z): `CI` run 38475993247 concluded `failure`. Only `AI Antipattern Ratchet` failed (`FAIL hardcodedRoutes: 856 (baseline: 852)`, measured on the merge ref, so drift from `main` rather than the PR's own files). `CI Gate` status = `failure`.
- `tier-classifier` and `Auto-Merge Policy` runs on both heads concluded `success`; `tier:sensitive` was applied. `Merge Queue` only skips, and per the existing gotcha never disables auto-merge for a tier. Nothing in the timeline shows a removal.
- Typecheck/Lint cause (commit `a2f3337a` message): Dependabot bumped `playwright` to 1.64.0 in rialto while every `@playwright/test` stayed on ^1.63.0, giving two incompatible `Page` types (TS2739 in `ui-quality-capture.ts`). Dependabot cannot fix cross-package peer alignment.
- Resolution: the Owner commented `@dependabot rebase` at 2026-10-14T21:23:08Z. A fix commit `a2f3337a` (align playwright to 1.64, 21:51:59Z) and a merge of `main` (`ecd3723b`, 21:56:34Z) followed. The new head's `CI Gate` went `success` at 22:20:16Z and GitHub merged at 22:20:43Z, 27 s later. That is the "merges within one CI cycle of green" behaviour working as designed.

## Implication for #6650 / part 7

The ~24h was the PR sitting red with nobody fixing it, not a mechanism that holds green PRs. Nothing in `merge-queue-eligibility.mjs`, `tier-classifier.yml` or `main`'s non-strict protection blocks newly auto-merged Dependabot updates. What will still stall: a grouped bump that is red on its own (cross-package peer mismatch, as here) or red because `main` drifted (ratchet baseline). Those need a fix by a human or an agent; auto-merge cannot help, and holding is correct.

Suggested follow-up for #6650 (not done here; that worker owns `dependabot-auto-merge.yml` and `dependabot.yml`): group `playwright` and `@playwright/test` specifiers (or `ignore` one side) so a Playwright bump arrives as one aligned update instead of a split that breaks typecheck.
