---
name: local-ci-precheck
description: "Run the same lint + typecheck + architecture-audit checks CI runs, locally and in parallel. Catches workspace-package issues (missing deps, prop drift, lint rule violations) before pushing — the failures CI would surface in 5 minutes show up in 30 seconds. Use before opening or pushing to a PR."
user-invocable: true
disable-model-invocation: true
---

# /local-ci-precheck

Mirror of the CI workflow's blocking checks (`lint`, `typecheck`, `architecture-audit`), run in parallel from your shell. Designed for the workflow gap that bit us hard in commits `e928d65`/`65e99ac`/`a1c2db2` (April 2026): pre-existing lint and typecheck errors on `main` were invisible because (a) the CI workspace-symlink cache bug ate them and (b) `pnpm typecheck` wasn't part of the pre-commit hook. By the time CI told us, three separate fixes had to land in a chicken-and-egg PR stack.

This skill closes that gap: run it before push, get the same red/green CI gives you — without burning a full GitHub Actions cycle.

## When to invoke

- **Before `git push` on a feature branch** — catches what CI would catch
- **After a non-trivial refactor** that touched multiple workspaces
- **After bumping a shared package** (rialto, types, config) that downstream packages consume
- **Before merging a PR** — final sanity that nothing drifted since the last CI run

## What it runs

In parallel, from the repo root:

| Step | Command                                                                                                             | Mirrors CI job       |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `pnpm install --frozen-lockfile`                                                                                    | `prepare`            |
| 2    | `pnpm lint`                                                                                                         | `lint`               |
| 3    | `pnpm typecheck`                                                                                                    | `typecheck`          |
| 4    | `pnpm --filter @mbe/cli build && pnpm --filter @mbe/cli start check-adr && pnpm --filter @mbe/cli start check-deps` | `architecture-audit` |

Steps 2–4 run in parallel after step 1 completes. Total time on a warm cache: ~30s (vs ~5 min for a CI round-trip).

## Invocation

```bash
# Full check (default)
/local-ci-precheck

# Just typecheck (fastest single check; what catches most refactor breaks)
/local-ci-precheck --typecheck-only

# Just lint (catches custom rule violations like require-rfc-7807-errors)
/local-ci-precheck --lint-only

# Skip install (if you just installed)
/local-ci-precheck --skip-install
```

Implementation pattern (Bash):

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ "${1:-}" != "--skip-install" ]]; then
  echo "→ pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile
fi

# Run the three blocking checks in parallel; fail-fast on any.
fail=0
{
  pnpm lint 2>&1 | sed 's/^/[lint] /' &
  lint_pid=$!
  pnpm typecheck 2>&1 | sed 's/^/[typecheck] /' &
  type_pid=$!
  ( pnpm --filter @mbe/cli build && \
    pnpm --filter @mbe/cli start check-adr && \
    pnpm --filter @mbe/cli start check-deps ) 2>&1 | sed 's/^/[arch-audit] /' &
  arch_pid=$!

  wait $lint_pid || fail=1
  wait $type_pid || fail=1
  wait $arch_pid || fail=1
}

if (( fail )); then
  echo ""
  echo "✗ /local-ci-precheck: at least one CI-blocking check failed."
  echo "  Fix above before pushing — these will block PR merge."
  exit 1
fi

echo ""
echo "✓ /local-ci-precheck: all CI-blocking checks pass."
```

## Output guarantees

- Exits **0** when CI would pass — push with confidence.
- Exits **1** when CI would block — fix before pushing.
- Each line is prefixed with `[lint]`, `[typecheck]`, or `[arch-audit]` so parallel output is readable.

## Why this isn't just "run pnpm lint && pnpm typecheck"

- Parallelism — three checks at once, not three sequential waits.
- Same install path as CI (`--frozen-lockfile`) so a stale lockfile gets caught here, not in CI.
- Includes the architecture-audit step which most devs forget about.
- Standardized prefix output — when any check fails you immediately see which one.
- Forces no model invocation (`disable-model-invocation: true`) — this is a side-effect-y check the user runs themselves; Claude shouldn't fire it mid-conversation as guesswork.

## Pairs with

- The `pre-push` Bash hook in `.claude/settings.json` — that hook auto-fires this on `git push`, but you can run `/local-ci-precheck` manually anytime mid-iteration without committing.
- `/site-audit` — covers the runtime/UX dimension; this covers the build-time/types dimension.
- `/ci-monitor` — for after the push, when you need to check what CI is doing on the remote.

## Future enhancements

- **Test job too** — currently skipped because tests can be slow; add `--include-tests` flag.
- **Smart filtering** — only run the workspaces affected by HEAD vs. origin/main.
- **Coverage delta** — flag PR-level coverage drops once a coverage gate workflow exists.
