---
stage: architect
run: feature:bootstrap-worktree
date: 2026-10-14
ux: skipped — no UI surface (prd.md: not-applicable)
assumptions:
  - "Dist-consumer derivation reads workspace package.json files directly (node builtins) rather than shelling to pnpm/turbo for the graph — the script must work before node_modules exists. Recommended default taken; if the heuristic under-selects, the build step's turbo filter list is the single place to widen."
  - "Staleness = mtime of pnpm-lock.yaml newer than node_modules/.modules.yaml (pnpm's own install receipt), falling back to the node_modules dir mtime when the receipt is absent. No content hashing — pnpm itself reconciles on install."
  - "No ADR consumed: every decision below follows an established in-repo pattern (pure decision + thin CLI per reap-worktrees.mjs; SessionStart shell hook per session-log-rotate.sh), so none clears the hard-to-reverse / surprising / real-trade-off bar. ADR 89–91 stay unused."
---

# Architecture: bootstrap-worktree

## Components

**1. `scripts/bootstrap-worktree.mjs`** — node builtins only (`node:fs`,
`node:path`, `node:child_process`, `node:url`). Three layers:

- **Pure core (exported, unit-tested):**
  - `decideBootstrapSteps({ hasNodeModules, lockNewer, missingDists })` →
    ordered step list, e.g. `[{ step: "install" }, { step: "build",
packages: [...] }]`; `[]` when nothing to do. Install is decided by
    `!hasNodeModules || lockNewer`; build by `missingDists.length > 0`.
    Install always precedes build. Invalid input (non-boolean flags,
    non-array dists) throws — fail closed, never guess (the
    `classifyBuildFreshness` discipline).
  - `distConsumedPackages(workspacePkgs)` → pure filter over parsed
    package.json descriptors: a workspace package qualifies when any of its
    `main` / `module` / `types` / `exports` (string leaves, recursively)
    resolves under `dist/`. Apps consume these via `workspace:*`, so
    "has a dist entrypoint" is the derivation — no hardcoded names. Returns
    package names + dirs.
- **Probes (thin fs layer):** read `pnpm-workspace.yaml` globs (simple
  line-parse of its `packages:` list — no yaml dep), stat
  `node_modules` / `.modules.yaml` / `pnpm-lock.yaml` mtimes, stat each
  candidate's `dist/` existence. Exposed for tests but not unit-tested
  beyond smoke (they're `fs.statSync` wrappers).
- **CLI:** no-args runs the steps (`pnpm install --frozen-lockfile`, then
  one `pnpm exec turbo run build` with `--filter=<pkg>` per missing-dist
  package) via `execFileSync` with stdio inherit; `--check` prints the
  decided steps and exits 0 without running (the hook's probe); non-zero
  exit only when an executed step fails. The no-op path does no pnpm/turbo
  spawn at all — that is what keeps SC-2's < 5 s (measured cost: a few
  stats + reading ~40 package.json files).

**2. `.claude/hooks/worktree-bootstrap-hint.sh`** — SessionStart, wired in
`.claude/settings.json` beside `session-log-rotate.sh` (same
`bash "$CLAUDE_PROJECT_DIR/..."` + timeout shape). Logic: linked-worktree
test (`[ -f .git ]` — a linked worktree's `.git` is a file, a main checkout's
is a directory); if linked and `node scripts/bootstrap-worktree.mjs --check`
reports pending steps, echo one line:
`worktree needs bootstrap — run: pnpm bootstrap:worktree`. Everything wrapped
so the script ends `exit 0` unconditionally; it never installs or builds.
Node-builtins-only in the script is what makes `--check` runnable here
pre-install.

**3. Wiring + docs.** Root `package.json` gains
`"bootstrap:worktree": "node scripts/bootstrap-worktree.mjs"`. The gotchas.md
worktree bullets and `implement-queue-worker.md` step 0 keep their context but
name `pnpm bootstrap:worktree` as the action.

## Decisions (one-liners; none ADR-worthy — see frontmatter)

- Derive dist consumers from package.json entrypoints, not from a hardcoded
  list and not from the turbo graph (needs no install to compute).
- Hook hints, never acts — SessionStart timeouts and the fail-open hook
  discipline (`secret-scan.mjs` precedent) both forbid a multi-minute install.
- mtime receipt (`.modules.yaml`) over lockfile hashing — pnpm is the source
  of truth for reconciliation; we only need "obviously stale".
- `--check` shared by CLI and hook so there is exactly one definition of
  "needs bootstrap".

## Risks

- Entrypoint heuristic misses a package whose dist is consumed another way →
  SC-1's tsc probe is the backstop; widen the filter, don't special-case.
- `check-hook-wiring.mjs` / `hook-input.test.mjs` treat the new hook as
  misconfigured → wire it exactly like `session-log-rotate.sh` (SessionStart
  hooks take no stdin path, so the `hook-input.mjs` adapter is not needed).

## Verification map

SC-1/SC-2 → issue's fresh-worktree commands; SC-3 →
`scripts/__tests__/bootstrap-worktree.test.mjs` (pure core only, no fs
mocking needed); SC-4 → `node scripts/check-hook-wiring.mjs` + existing hook
test suite; SC-5 → affected-package gates via `scripts/conductor-gate.sh`.
