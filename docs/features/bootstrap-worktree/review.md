---
stage: review
run: feature:bootstrap-worktree
date: 2026-11-02
assumptions:
  - "Scope is the feature as merged in #6676 (74dcac071, WO-7..10) plus the WO-6 pure core from #6662 (bee4aa325). This branch carries no product-code diff, so there is no run-branch diff to review; the merged commits are the diff."
  - "Owner decision, in-session 2026-11-02: proceed to Review with verification's SC-2 FAIL and SC-5 PARTIAL carried as open findings; re-measuring SC-2 and re-running the gate on an idle host becomes a pre-merge step at Ship. Severities below are ranked per the skill, not lowered to unblock."
  - "Code is already on main, so findings needing code changes are recorded with file:line and routed to Implement/Ship; no product code was edited in this stage."
  - "adr_status.py reports all 30 repo ADRs as `unrecognized` (the repo's ADR files carry no recognised status line). Per the skill's table, treated as live; only ADR-005 and ADR-015 reach this diff."
  - "docs/standards.json (the plugin's own, domains pipeline/factory/eval) holds no statement that applies to a target-repo `scripts/` + `.claude/` diff; no finding cites a slug."
---

# Review: `pnpm bootstrap:worktree`

## Scope

Soft gate: `verification.md` exists (2026-11-02), so this is not the inverted unverified order. Its two open results are carried here under the Owner decision above.

Examined, against `prd.md` (R1–R4, SC-1..5), `architecture.md` and `verification.md`:

- `scripts/bootstrap-worktree.mjs` (195 lines: pure core `decideBootstrapSteps` / `distConsumedPackages`, fs probes, `--check`/CLI) — read in full.
- `scripts/__tests__/bootstrap-worktree.test.mjs` (22 tests) — read in full.
- `.claude/hooks/worktree-bootstrap-hint.sh` (17 lines) and its `.claude/settings.json` SessionStart entry (timeout 5000, beside `session-log-rotate.sh`).
- Root `package.json` script `bootstrap:worktree`.
- Pointer edits in `.claude/rules/gotchas.md` and `.claude/agents/implement-queue-worker.md` (as of #6676; both files have since been trimmed on main, and verification quoted the current text, which still names the command).
- Reused module: `scripts/dep-graph-discovery.mjs` (`discoverWorkspaceGlobs`, `resolveGlob`) and its sole import `zone-vocabulary.mjs` (no imports of its own, so the node-builtins-only claim holds).

## Findings

### Major: SC-2 — the literal `pnpm bootstrap:worktree` no-op did not meet the < 5 s budget

- Scenario: second run with nothing to do, `pnpm bootstrap:worktree` → verification measured 10.9–12.3 s wall (four runs). The script alone is 1.37 s; bare `pnpm --version` is 8.7–11.3 s on that host (load average 22–45). Architecture's "no-op path spawns no pnpm/turbo… keeps SC-2's < 5 s" reasoned about the script and left out the `pnpm` launcher the command is invoked through (`scripts/bootstrap-worktree.mjs:188-195` is fast; `package.json:13` routes through pnpm). The PRD defines the budget on the literal command and assumes it is judged on idle dev hardware and CI runners, so it is still unconfirmed, not disproved.
- Standard: none
- Decision: deferred by Owner — proceed to Ship; re-measure on an idle host as a pre-merge step at Ship. If that run is still ≥ 5 s with the script at ~1.4 s, the remedy is a PRD decision (restate SC-2 as the script's own cost, or have step 0 call `node scripts/bootstrap-worktree.mjs` directly), not a code defect. [INFERENCE] The pnpm 10 → 9.15.4 `packageManager` re-exec seen in verification (`10.26.2` outside the repo, `9.15.4` inside) probably adds to the launcher cost; unmeasured.

### Major: SC-5 — the full affected gate was never shown green

- Scenario: `bash scripts/conductor-gate.sh` failed on `@mbe/config#test` (5 × 5000 ms timeouts in ESLint rule-tester cases, a package this feature does not touch) and aborted turbo with `@mbe/types#test` in flight. In isolation `packages/config` passes 104/104 and `packages/types` 487/487; the feature's own tests, eslint, prettier, `check-hook-wiring.mjs` and `hook-input.test.mjs` all pass. The criterion as written (`pnpm lint && pnpm typecheck && pnpm test` on affected packages) is therefore not demonstrated end to end. Nothing implicates the feature. This stays Major, not Minor: it is an unmet PRD success criterion, however likely the cause is load.
- Standard: none
- Decision: deferred by Owner — re-run `bash scripts/conductor-gate.sh` on an idle host as a pre-merge step at Ship; a red result there reopens this finding.

### Minor: a partial `dist/` is treated as built

- Scenario: `scripts/bootstrap-worktree.mjs:133-138` — `missingDistsProbe` only checks that `<pkg>/dist` exists as a path. A build that is interrupted (Ctrl-C during the ~4-minute rialto build seen in verification) or whose emit is partial leaves `dist/` present but incomplete → next `pnpm bootstrap:worktree` prints "nothing to do." and the TS2307 / `ERR_MODULE_NOT_FOUND` the tool exists to remove survives, with the hook also silent. Recovery is undiscoverable from the tool's output.
- Standard: none
- Decision: deferred — rare, and Architecture's Risks section already names SC-1's tsc probe as the backstop. Fix when it bites: test for a declared entrypoint file (e.g. the first `main`/`types` leaf under `dist/`) instead of the directory. Route to a follow-up Implement item.

### Minor: any argument other than `--check` runs the mutating path

- Scenario: `scripts/bootstrap-worktree.mjs:177` — `pnpm bootstrap:worktree --dry-run` (or a typo such as `--chek`) is ignored and runs the full `pnpm install --frozen-lockfile` plus builds. The hook only ever passes `--check`, so the exposure is manual use.
- Standard: none
- Decision: deferred — low blast radius (the same steps the bare command would run). Fix: reject unknown flags with exit 2.

### Minor: CLI execution layer and the real staleness probe are untested

- Scenario: `runBootstrap` (`scripts/bootstrap-worktree.mjs:176-186`) accepts an injectable `exec`, and `runBootstrapStep` (:164-174) builds the exact `pnpm install --frozen-lockfile` / `pnpm exec turbo run build --filter=…` argv, but `scripts/__tests__/bootstrap-worktree.test.mjs` never calls `runBootstrap`; the `exec` seam has no setter anywhere in the tree. A regression in argv, step order at execution time, or failure propagation passes the suite. Likewise `isLockNewerProbe` (:102-112) is asserted only as `typeof … === "boolean"` (test lines 137–139), so the stale-lockfile branch, the brief's named "mtimes flaky" risk, is covered only by the pure function, as verification already noted. The architecture's "probes smoke-tested only" stance covers the probes; it does not cover `runBootstrap`.
- Standard: none
- Decision: deferred — SC-3 is met as written. Fix: one test injecting a recording `exec` (asserts argv and order, and that `--check` calls it zero times), one `isLockNewerProbe` test against a temp dir with `utimes`.

### Minor: architecture.md describes a different workspace reader than the code uses

- Scenario: `architecture.md` says the script reads `pnpm-workspace.yaml` and package.json files itself on node builtins; the code instead imports `discoverWorkspaceGlobs`/`resolveGlob` from `dep-graph-discovery.mjs` (`scripts/bootstrap-worktree.mjs:22`, :119-127). The deviation is the better call (reuse over a second parser, still builtins-only through `zone-vocabulary.mjs`) and is explained in the script header, but the artifact a later reader consults still says otherwise, and a change to `dep-graph-discovery.mjs` now silently changes what "needs bootstrap" means.
- Standard: none
- Decision: deferred — one-line addition to `architecture.md` (or a note at Ship); no code change. This stage does not edit predecessor artifacts.

## Passes with no findings

- **Correctness (rest):** decision logic is fail-closed and matches R1/R2 (install iff `!hasNodeModules || lockNewer`, install before build, `[]` otherwise, invalid input throws). The hook scenarios verification ran (worktree pre/post, main checkout, script absent, script exiting 3, nonexistent project dir) all exit 0 and the hint is exactly one line; `.git`-is-a-file linked-worktree test is sound for this repo. Dist-consumer derivation produced 13 packages including `@mattbutlerengineering/rialto`, and the SC-1 `tsc --noEmit` passed with no TS2307.
- **Design (rest):** matches the pure-core + thin-CLI pattern of `reap-worktrees.mjs`, wires the hook exactly like `session-log-rotate.sh`, hint-never-act respects the hook timeout. ADR test: none of the decisions is hard to reverse or surprising, and the "no ADR consumed" assumption in `architecture.md` holds; no existing ADR's Decision section was edited.
- **Security:** `execFileSync` with fixed argv and no shell; workspace package names reach it only as `--filter=<name>` array elements, so no injection path. Hook quotes `$ROOT`, discards stderr, prints a fixed string only. No secrets, no network, no input from outside the repo tree.
- **Complexity:** no cut-list entries. Nothing dead (every export is used by the CLI or the tests), no dependency added, no `lean:` markers in the diff. The unused `exec` seam is a test-gap finding above, not a cut, because the fix is to use it.
- **ADR compliance:** ADR-005 (agent worktree isolation: the tool operates only inside the worktree it runs from) and ADR-015 (pnpm + Turborepo: uses `pnpm install --frozen-lockfile` and `turbo run build`, no turbo/pnpm config changes) read in full, no violation. The other 28 ADRs concern subjects the diff never reaches (auth, API errors, deployment, Rialto, availability, …).
- **Domain passes:** Dependencies was selected (root `package.json` changed) and came back clean: the change adds one script and no dependency, override or lockfile entry. Payments and Migrations: none selected.

## Verdict

Ready to proceed to Ship, with two conditions, not as clean ship-ready. There are no critical findings and no standards-cited findings. Two Majors (SC-2, SC-5) are open and explicitly deferred by the Owner's in-session decision, each tied to a pre-merge step at Ship: re-measure the no-op on an idle host, and re-run `scripts/conductor-gate.sh` on an idle host. A failure in either reopens its finding and blocks the merge. The four Minors are deferred with reasons above; none blocks Ship.
