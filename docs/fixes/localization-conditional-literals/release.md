---
stage: ship
run: maintenance:localization-conditional-literals
date: 2026-10-18
outcome: prepared
pending-merge: <PR url>
assumptions:
  - "Autorun: the brief's Release authorization is prepare-and-stop. Ship pushes the branch and opens one PR (code plus run docs). It does not merge, enable auto-merge, deploy, publish rialto, tag, or run `changeset version`."
  - "Pre-flight ran the local-ci-precheck steps directly (the skill is disable-model-invocation), as CLAUDE.md § Pipeline Stage Hooks requires. The llms drift half ran as `pnpm regen --check`, which runs `mbe pack --check` for every llms package plus the git-diff check (scripts/regen.mjs runCheck), instead of the skill's hand-written per-directory loop. It is a superset of that loop."
  - "Launch brief: `launch_demo.py config` printed `NONE` (no config in this repo), so per the skill nothing is written and no Release-log entry is added for it."
  - "No ADR added by this run (review: no decision beyond ADR-028), so the ADR-numbering pre-flight item does not apply."
  - "No tracker intake issue seeded this run (defect.md has no `intake:`), so the post-release close step does not apply."
---

# Release: conditional string literals no longer bypass localization

## Pre-flight

Run on the final head `062c92513`, worktree `.claude/worktrees/loc-literals`,
Node 22.22.3 (`.nvmrc` 22).

- [x] Verification green: `verification.md` reports 14/14 PASS, 0 FAIL, nothing
      unresolved. Review: no critical or major findings, "Ready to ship".
- [x] No secrets in the diff: added lines scanned for `sk_live`, `AKIA`, PEM
      private-key headers and JWTs, no hits. No `.env` or config file touched. No
      target-environment config is needed: the change is strings and dictionaries
      only.
- [x] Migrations / data changes: none. No Prisma schema or migration file is in
      the diff.
- [x] ADR numbering: not applicable, the run added no ADR.
- [x] Rollback plan concrete (below).
- [x] local-ci-precheck steps (CLAUDE.md § Pipeline Stage Hooks), each run fresh
      here:
  - `pnpm install --frozen-lockfile` → exit 0
  - `pnpm build --filter "@mbe/cli..."` → exit 0
  - `pnpm lint` → exit 0, 52/52 tasks (5 cached)
  - `pnpm typecheck` → exit 0, 52/52 tasks (6 cached)
  - `pnpm --filter @mbe/cli start check-adr` → "No architectural violations
    detected"; `check-deps` → "All external dependencies are consistent"
  - `pnpm graph && pnpm generate:dep-graph`, then
    `git diff --exit-code -- docs/architecture/dependency-graph.md infrastructure/worker/dep-graph.json`
    → exit 0, no drift
  - `pnpm regen --check` → exit 0, "All generated artifacts are up to date."
- [x] Brief-named extra gates: `pnpm check:i18n-catalogs` → PASS; rialto
      `size-limit` after `pnpm --dir packages/rialto build` → en-GB 114 B, es-MX
      1.89 kB, fr-CA 2 kB, all under the 2.2 kB limit the Owner set.
- [x] Base drift: the branch is 3 commits behind `origin/main`;
      `git merge-tree --write-tree HEAD origin/main` merges cleanly.

## Rollback plan

Door: two-way. A squash-merge revert undoes it. Nothing is published (rialto
is not released to npm by this run), no data or schema changes, and the new
`RialtoMessages` keys exist only in this repo until a rialto release.

Blast radius: hospitality users on every authenticated route (the ThemeToggle
in GlobalNav) and on the touched rialto surfaces (Form, DataTable, PinInput,
TextArea, Combobox, ChatPanel). If a message wiring is wrong, an accessible
name or announcement reads wrong or empty for that locale. Layout and data are
not affected. npm consumers notice nothing until a rialto release ships.

```
# After merge, if the deploy misbehaves:
gh pr view <N> --json mergeCommit --jq .mergeCommit.oid   # squash SHA on main
git checkout main && git pull
git revert <squash-sha>
git push origin HEAD:revert/localization-conditional-literals
gh pr create --base main --head revert/localization-conditional-literals \
  --title "revert: localization-conditional-literals" --body "Rollback per docs/fixes/localization-conditional-literals/release.md"
# Merging the revert re-runs deploy-static.yml, which redeploys the previous hospitality bundle.
```

## Release log

1. Pre-flight (above) on `062c92513` → all green.
2. Committed this artifact as `docs(localization-conditional-literals): ship — prepared`.
3. `git push -u origin fix/localization-conditional-literals` → see PR.
4. Opened the PR to `main` → `pending-merge:` above. Stopped there:
   prepare-and-stop, no merge, no auto-merge, no deploy.

## Post-release checks

Not run: nothing has reached users. Merging deploys hospitality through
`deploy-static.yml`, and that merge is the Owner's action.

What Operate grades. This is the restated signal from `review.md`, which
replaces the brief's literal wording. Both English strings correctly remain in
the bundle as the en-US `RialtoMessages` values:

- The deployed hospitality `rialto-vendor` chunk no longer contains the
  hardcoded ternary
  `"aria-label":<x>?`Switch to light mode`:`Switch to dark mode``. It does contain
  `"aria-label":<x>?<m>.switchToLightMode:<m>.switchToDarkMode` and the es-MX /
  fr-CA values (`Cambiar a modo oscuro`, `Passer au mode sombre`). The en-US
  value "Switch to dark mode" staying in the bundle is expected, not a failure.
- AND either one CI run in which the tightened
  `mbe-local/no-literal-ui-strings` rule caught a real new conditional literal,
  or 14 days since merge with none. Users observed are counted honestly; 0 is
  valid.

## Outcome

Prepared and stopped. The run is waiting on the pull request that
`pending-merge:` names. The write-back (`gh pr view <N> --json state,mergedAt`)
records `released` and `released-at:` once the Owner merges.
