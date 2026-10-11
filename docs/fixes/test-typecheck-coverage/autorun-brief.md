# Autorun brief: test-typecheck-coverage

Collected 2026-10-08 from Matt (three answered questions: new run, scope, release
authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (condition brief — degraded gate, not a runtime defect), slug
  `test-typecheck-coverage`, in `docs/fixes/test-typecheck-coverage/`. Enters at Capture.
  Re-entry depth is Capture's call (log it).
- **Worktree / branch:** `.claude/worktrees/test-typecheck-coverage`, branch
  `fix/test-typecheck-coverage`, cut from `origin/main` @ `e4dd62ca4`. Never use the main
  checkout (stale, holds unrelated WIP). Further per-package branches may be cut from fresh
  `origin/main` if the work is split into several PRs.
- **Origin:** found by the Review stage of `maintenance:floor-plan-cache-keys` (2026-10-07):
  `apps/hospitality/tsconfig.json` excludes test files, vitest never type-checks, and an
  ad-hoc `tsc` over the touched hospitality test files found 10 pre-existing type errors.
- **Tracker:** none. No GitHub issue interaction.
- **In-flight check (orchestrator, 2026-10-08):** open PRs with `tsconfig`/`typecheck` in the
  title — none. Capture should re-run a broader check.

## Condition (verified on origin/main by the orchestrator, 2026-10-07)

- These packages' `tsconfig.json` has `"exclude": ["src/**/*.test.ts"(, "src/**/*.test.tsx")]`
  and their `typecheck` script is plain `tsc --noEmit` against that config, so test files are
  never type-checked anywhere (not by `pnpm typecheck`, not by vitest, not by CI):
  `apps/hospitality`, `packages/agent-core`, `agent-test-utils`, `auth`,
  `cancellation-policy`, `database`, `gh-client`, `jobs`, `notifications`,
  `service-bootstrap`, `supply-chain-scanner`, `test-fixtures`. (14 configs exclude tests;
  `packages/api-client` and `packages/types` already compensate.)
- **Precedent / target shape:** `packages/api-client` and `packages/types` have a
  `tsconfig.test.json` and `typecheck: tsc --noEmit -p tsconfig.test.json`.
- Capture must also sweep packages NOT in the list above (services/_, tools/_, other apps/*,
  rialto, packages whose tests live outside `src/`, or under `__tests__`/`test/`) for any
  other way tests escape typecheck — the list above came from a single grep of
  `"exclude"` in top-level `tsconfig.json` files only.
- `.claude/rules/gotchas.md` § Pre-push / typecheck already names the trap ("Vitest does NOT
  typecheck — tests can pass with completely wrong types") with no gate behind it.

## Desired shape

Every workspace package's `typecheck` covers its test files, following the
api-client/types precedent (or the simplest equivalent the stage finds — e.g. dropping the
exclude where the build uses a separate config). The type errors that surfaces are fixed in
the TESTS. A cheap guard (e.g. a repo-audit/script test that fails when a package's
typecheck config excludes its test files) stops new packages regressing. Update the gotchas
bullet so it stops describing an unguarded trap.

## Scope

- In: typecheck config/script changes per package; fixing test-file type errors; the
  regression guard; gotchas.md update; CI wiring only if the existing `typecheck` job does
  not already pick the change up through the scripts.
- Out: production source behaviour changes. Lint warnings. Making vitest type-check
  (`--typecheck`) — prefer `tsc`.
- **Volume policy (orchestrator default, logged — not a user answer):** Capture measures the
  error count per package first. Split into several PRs (e.g. by package) when it keeps each
  reviewable. If the total exceeds ~500 errors, or a package needs a suppression baseline
  (`@ts-expect-error` sweeps, a ratchet) instead of real fixes, STOP and surface to Matt with
  the counts — don't pick a suppression strategy unattended.
- No user-facing surface.

## Constraints

- Repo gotchas apply: TDD where it applies (the guard is test-first: the guard test must fail
  against today's configs); a fresh worktree needs `pnpm install --frozen-lockfile` and
  `pnpm build --filter @mbe/cli...` (plus rialto build if hospitality tests import it);
  explicit-path staging, never `git add -A`; never pipe `git push`; no `status` shell var;
  prettier-format docs; run `pnpm typecheck` (or turbo-filtered) before pushing; any
  `pnpm-lock.yaml` change makes CI cold.
- Fixing a test type error must not weaken the test (no `as any`/`as unknown as` to silence
  a real mismatch without saying why; prefer correcting the mock to the real interface).
- Active ADRs bind (`docs/adr/`, status: active).

## Release authorization (Matt, 2026-10-07)

May, without asking:

- open PRs (several are fine), and squash-merge each once the `reviewer` subagent passes it,
  `CI Gate` is green on the final head, and no critical finding is unfixed. Use an explicit
  `--subject`.
- let CI deploy workflows run on merge.

Must STOP and surface to Matt:

- any fix that needs to change production (non-test) source behaviour;
- the volume-policy trigger above;
- any unfixed critical review finding; anything touching secrets, auth flows, payments, or
  Prisma migrations.

## Decisions after Capture (Matt, 2026-10-08)

Capture stopped on the volume policy: 679 errors across 18 packages (see defect.md). Matt chose:

- **Strategy A: real fixes everywhere, 5 PRs** — exactly the PR plan in defect.md (PR1 guard +
  small packages ~49; PR2 gh-client/agent-test-utils/notifications ~112; PR3 agent-core 255,
  split 3a/3b if too large to review; PR4 hospitality unit 222; PR5 e2e + root-level tests +
  turbo typecheck input widening ~41). No suppression baselines, no relaxing
  `noUncheckedIndexedAccess` for tests, no allowlist ratchet. The volume-policy stop is
  thereby lifted for this plan; the per-error rule (fix the test, don't silence a real
  mismatch) still holds. e2e/root-level tests ride along as PR5.
- **Non-test edits:** type-only fixes in non-test files (e.g. a `?.`/guard in
  `packages/rialto/scripts/component-metadata.ts:525`) are allowed when behaviour on valid
  input is unchanged; each one is called out in the PR body and review.md. Production
  runtime behaviour changes still STOP and surface.
- Each PR is merged independently once reviewer passes + CI Gate green (release
  authorization above). Cut each PR's branch from fresh `origin/main` after the previous
  merges; the run docs travel with PR1 and are updated (checkboxes) in later PRs.

## Decision: showcase test gets PR 6 (Matt, 2026-10-08)

- `packages/rialto/src/showcase/App.vibes.test.tsx` and the 27 showcase source errors it
  pulls in (found by the guard at PR1, see defect.md § Notes) get their **own PR 6** in this
  run, after PR5. The plan is now 6 PRs.
- Showcase demo-app source edits are allowed in PR 6. They are not type-only, but the code is
  an unpublished demo app. Each edit is called out in that PR's body and review.md.
