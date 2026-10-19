---
stage: review
run: feature:zone-batch-nonstrict-main
date: 2026-10-18
verdict: no critical; 1 major left open for the Owner; 5 minors deferred
assumptions:
  - "Scope is #6678 (d1047723e), ADR-027 via #6661 (14c71bc53), and the part of #6811 (1620b9073) that touches the same files: the hotspot locks in scripts/issue-zone.mjs, the ADR-027 Decision insert and the .claude/implement-queue.md compose paragraph. #6811's rescue cron, routine fragments and tools/factory changes are out of scope. No other commit on origin/main (7abc1105b) touches scripts/issue-zone*, scripts/main-strictness*, ADR-023/027 or the compose hook."
  - "Minors are deferred per the skill default ('minors may be deferred freely'), each with its reason logged. The major is left open for the Owner, as the brief directs."
  - "The frequency of risky path shapes was estimated from the newest 80 issues (the non-PR rows of two 100-row REST pages, state=all, read 2026-10-18) using an approximate token regex. It is a sample, not a census."
  - "The llms*.txt co-change rate is measured on origin/main commits since 2026-10-01."
  - "Standards pass: this repo has no docs/standards.json. The plugin's index holds 4 statements (factory, pipeline, eval). They govern the skills repo's own tooling, and none applies to this diff."
  - "Whether a Claude Code Remote session's token can read branch protection was not measured. It is recorded as a suspicion, with the command that would settle it."
---

# Review: Same-zone batching when `main` is not strict

## Scope

This review covers the shipped code, not a pending diff.

- **#6678 `d1047723e`:** `scripts/issue-zone.mjs` (the `strictMain` option, `pathsOverlap`, `isDisjointFromAll`), the new `scripts/main-strictness.mjs`, both test files, the `.claude/implement-queue.md` § compose hook, and the gotchas § CI bullet.
- **#6661 `14c71bc53`:** ADR-027, the ADR-023 status line and banner, and the README index rows.
- **#6811 `1620b9073`:** only the parts that touch the same files. That is `SHARED_LOCK_PATHS` / `hotspotLocks` (`scripts/issue-zone.mjs:375-406, 443-455`), the `### Shared-registry lock` insert into ADR-027's Decision section, and the extra sentence in the compose paragraph.

The starting point was the "Items for Review" list in `verification.md`. Every claim below was re-run against the real module in this worktree at `ecd3fcf3c`. The probe scripts live in the scratchpad (`zone-review/edge.mjs`, `hot.mjs`, `strict.mjs`, `scan.mjs`). The pre-#6811 module was copied from `git show d1047723e:scripts/issue-zone.mjs` into a fake root that symlinks the real workspace directories, so its scope map resolves the same way.

Gates for the record:

```
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/issue-zone.test.mjs \
    scripts/__tests__/main-strictness.test.mjs scripts/__tests__/zone-vocabulary.test.mjs
 Test Files  3 passed (3)
      Tests  104 passed (104)
$ node scripts/main-strictness.mjs
{"strictMain":false}
```

## Findings

### Major: path tokens are compared without normalising trailing punctuation, so overlapping issues count as "disjoint" and the shared-registry lock can be dodged

- **Where:** `scripts/issue-zone.mjs:228`. The token pattern `[\w.-]+` keeps a sentence-final `.` or `...` as part of the path. Neither `pathsOverlap` (`:353-357`) nor `hotspotLocks` (`:401-402`) strips anything except trailing `/`.
- **Scenario (reproduced through the real selector, `strictMain: false`):**
  ```
  E1  #1 "Edit apps/hospitality/src/a.ts."   #2 "Edit `apps/hospitality/src/a.ts` too"   → batch [1,2]
  E2  #1 Files: apps/hospitality/src/a.ts...  #2 Files: apps/hospitality/src/a.ts      → batch [1,2]
  ```
  Both pairs name the same file, so both should defer to `[1]`.
- **The same bypass defeats #6811's hotspot lock in both modes.** Issue #1 is `fix(hospitality)` with the body "Record it in .claude/rules/gotchas.md." Issue #2 is `fix(reservations)` and lists `.claude/rules/gotchas.md`.
  ```
  strictMain true  [ 1, 2 ]
  strictMain false [ 1, 2 ]
  control (no trailing dot) [ 1 ]
  ```
- **Real-world shape:** 1 of the 78 sampled issues that contain path tokens ends a path with `.`: #7042, `.claude/rules/gotchas.md.`. That is exactly a hotspot path.
- **Why major:** the PRD and brief make one hard requirement: the estimate "must fail toward deferral, never toward stacking overlapping work". This fails open, and it is not the documented under-approximation risk. The text names the file correctly, and normalisation drops the match. The consequence is two workers editing the same file in one batch, which means a conflict and rework of the kind cluster B showed (6 merge-from-main commits). It is not a production defect.
- **Fix, for the Owner to decide:** strip trailing `.` and `,` from each extracted token, either in `extractPathsFromBody` or in a shared normaliser that both `pathsOverlap` and `hotspotLocks` call. Add the E1, E2 and hotspot cases as tests.
- **Standard:** none.
- **Decision:** **open, left for the Owner** (brief: a major is never decided by Review).
- **Resolution:** fixed in-run at the Owner's decision (Implement re-entry, WO-30, commit `fix(issue-zone): strip trailing sentence punctuation from extracted path tokens`). Tokens are normalised at extraction; E1, E2 and the hotspot case (both modes) are now tests and defer to `[1]`.

### Minor: #6811 rewrote ADR-027's Decision section, and that section now contradicts the code's default mode

- **Where:** `docs/adr/ADR-027-…md:37-40`. It says that with `strictMain: true` "behavior is exactly ADR-023's original rule — one issue per zone, full stop". #6811 inserted `### Shared-registry lock` (`:54-56`) into the same Decision section, and that lock applies "even when" strict, across zones (`scripts/issue-zone.mjs:424-427, 449`).
- **Scenario (strict mode, the default):** #1 `fix(hospitality)` and #2 `fix(reservations)` each list their own source file plus `CLAUDE.md`.
  ```
  at d1047723e strictMain:true [ 1, 2 ]
  current      strictMain:true [ 1 ]
  ```
  The default output changed, which breaks the brief's constraint "`strictMain: true` default must reproduce today's output bit-for-bit". Verify's SC-1 still passes only because no pre-#6678 test touches a hotspot path.
- **Two problems in one place:**
  - The behaviour change is conservative and reasonable, but it was recorded by editing an active ADR's Decision section. The protocol's "Never rewrite" rule says a changed decision gets a new ADR that amends the old one.
  - The edited section now contradicts itself. The probe paragraph (`:58-65`) also reads as if it sits under the lock heading.
- **Fix:** write a short amending ADR for the cross-zone hotspot lock, and add an "amended by" line to ADR-027.
- **Standard:** none.
- **Decision:** deferred. This is drift in the record only. The code's behaviour is the safer one, and the cost of the drift is a wrong mental model, not a wrong batch.

### Minor: the probe gives the same answer for "main is strict" and "could not read branch protection"

- **Where:** `scripts/main-strictness.mjs:61` discards stderr (`stdio: [..., "ignore"]`), and `:36` maps every error to `{ strictMain: true }`. The CLI prints the same `{"strictMain":true}` in both cases.
- **Scenario:** Verify's shim `gh` returned "HTTP 503" and the probe printed `{"strictMain":true}`, which is byte-identical to a live strict main.
- **Why it matters here:** this repo records that reading branch protection needs Administration:read, which `GITHUB_TOKEN` cannot hold (`.github/workflows/metrics-collectors.yml:113-117`).
- **? Suspicion:** a cloud implement-queue routine (`mbe-evening`, `docs/routines/mbe-evening.md:22`) may be fail-closed on every iteration, so the relaxed rule never runs there and nothing says so. The settling check is to run `node scripts/main-strictness.mjs` once inside a Claude Code Remote session.
- **Fix:** add a `source`/`reason` field to the result (for example `measured` vs `unavailable`), the way `mainStrictSource` already does for the SDLC sensor. Keep `strictMain: true` on failure.
- **Standard:** none.
- **Decision:** deferred. Fail-closed is the designed behaviour. This is visibility, and Operate should read the probe output for the paths it counts.

### Minor: generated `llms*.txt` files never enter the disjointness check, so "disjoint" same-zone pairs usually share files

- **Measured on origin/main since 2026-10-01:**
  - 42 of 75 commits touching `apps/hospitality/src` also touch `apps/hospitality/llms*.txt`.
  - 65 of 80 commits touching `services/reservations/src` do the same for their package.
  - 15 of 44 commits touching `packages/rialto/src` do the same for their package.
  - 47 of 75 hospitality-src commits also touch the root `llms-full.txt`.
- **Scenario:** two hospitality issues listing `apps/hospitality/src/a.ts` and `apps/hospitality/src/b.ts` give `batch [1,2]` (E7). Both PRs will likely rewrite `apps/hospitality/llms-full.txt`.
- **Observed cost so far is zero:** cluster F in `verification.md` shared `services/reservations/llms-full.txt` and the root `llms-full.txt` with 0 merge-from-main commits. `.gitattributes` has no merge driver for these files. The root-file collision already existed for cross-zone batches under ADR-023, so only the per-package file is new exposure.
- **Standard:** none.
- **Decision:** deferred. There is no observed conflict, and the fix (ignore generated files, or regenerate after merge) belongs with the regen tooling. Handed to Operate: count `llms*.txt`-only conflicts in same-zone batches.

### Minor: stale "main is strict" premise and overstated safety claims in the docs

- **Unconditional strict premise:**
  - `.claude/implement-queue.md:42` still says "Same-zone stacking incurs an N² `update-branch`/CI re-run tax against `strict` main (ADR-016)".
  - `scripts/issue-zone.mjs:6-12` (the module header) still says "`main` is `strict`".
  - Both are now true only conditionally.
- **ADR-027 Consequences overstates the safety (`:82-91`):**
  - It says a mis-estimate "costs throughput … never correctness" and that the per-zone merge-train lock was "the thing making same-zone merges safe".
  - The lock gates who may `update-branch` a zone (`.claude/implement-queue.md:294`). It does not stop two PRs from conflicting textually.
  - The ADR covers over-estimation only. Under-estimation, as in the Major above, costs conflict and rework, not just throughput.
- **Status labels disagree:** ADR-023's frontmatter is `status: active` plus `amended_by: ADR-027`, while the README row says "amended (by ADR-027)". The tool `adr_status.py` reads ADR-023 as live, which is correct for an amendment, so this is cosmetic. ADR-027 is `active`, while architecture.md said `provisional`. `active` is defensible because the Owner approved the policy at the Conductor's blueprint gate before #6661 merged.
- **Standard:** none.
- **Decision:** deferred. All of this is prose, and the code paths are correct.

### Minor: an issue whose only extracted paths lie outside its own zone still stacks

- **Where:** `scripts/issue-zone.mjs:368-372`. The check requires the path set to be non-empty, not non-empty within the issue's zone.
- **Scenario (E3):** `feat(hospitality): x` with "Mirror the pattern in packages/rialto/src/Button.tsx." and `feat(hospitality): y` citing an ADR path give `batch [1,2]`. Neither names a hospitality file, so for its own zone each is effectively pathless. SC-3's intent says a pathless pair defers.
- **Real-world shape:** 0 of the 31 workspace-zoned sampled issues hit this. The two hits from the scan were false positives, where the only token was the zone root itself (which correctly overlaps everything).
- **Standard:** none.
- **Decision:** deferred. It reproduces through the real code but has not been seen in real issue bodies. The cheap tightening (count only in-zone paths) can go with the Major's fix if the Owner takes it.

## Passes with no findings

- **Correctness, the rest of the disjointness check:**
  - Identical, ancestor/descendant, trailing-slash and `./`-prefixed paths all defer correctly (E6 → `[1]`).
  - Sibling names that share a string prefix stay disjoint (E8 → `[1,2]`), which is correct.
  - `{a,b}` brace-globs and `**` globs truncate to their directory, which overlaps the member files (E4, E5 → `[1]`). That fails closed.
  - A pathless issue blocks both ways (`:369`; E9 → `[1]`).
  - The global `null` zone keeps its single slot in both modes.
- **Correctness, the strict probe:**
  - It is not cached: one `gh api` GET per compose call, and the hook runs it every iteration.
  - If `strict` flips mid-batch, at most `maxWorkers - 1` = 2 siblings in that one batch pay an `update-branch`. The next iteration re-probes and falls back to one issue per zone. That is bounded and is the designed behaviour, so it is not a finding.
  - Fail-closed coverage is complete: `parsed.strict === false` is the only path to `false`. Verify exercised error, HTML, missing field and no `gh`.
- **Design:** the selector stays pure, and the probe lives at the call site as the PRD requires. The design matches architecture.md § Design 1-4. The pure classifier plus thin wrapper follows `ci-gate-status` and `agent-core-build-freshness`. No missing ADR: the strictMain decision has ADR-027, and the #6811 gap is the Minor above.
- **Security:** `execFileSync("gh", [...fixed args])` has no shell and no interpolated input. The script is read-only (a single GET). No secrets, and errors are swallowed to a boolean, so nothing leaks.
- **Complexity (lean cut-list):** nothing to cut. The #6678 diff is about 55 lines of selector change and a 73-line probe, and every helper has a caller (`pathsOverlap` ← `isDisjointFromAll` ← `selectZoneSpreadBatch`; `classifyMainStrictness` ← `probeMainStrictness` + tests). The diff adds no `lean:` markers.
- **ADR compliance:** `adr_status.py` reports ADR-0001…0028, all `unrecognized` with raw status `active`/`superseded`, so live means `active`.
  - ADR-023: the amendment is done correctly, and its Decision section is byte-identical (Verify SC-5).
  - ADR-016 still states that `main` is strict. Reality (`strict: false`) diverged before this run, and ADR-027 conditions on the live measurement rather than contradicting ADR-016. No violation by this diff. The ADR-016 text is a stale record outside this run.
  - ADR-027 against the code: see the Minor above.
  - Other ADRs cover subjects this diff never reaches (services, auth, data, deploy) and are out of scope.
- **Domain passes:** none selected. The changed paths are `scripts/*.mjs`, `scripts/__tests__/*`, `.claude/implement-queue.md`, `.claude/rules/gotchas.md`, `docs/adr/*` and run docs, with no payment, migration or manifest paths.
- **Standards:** none applicable (see assumptions).

## Out of scope: an Owner decision on which dispatch paths the guard governs

Verify found that most parallel work since ship never called the selector. Only one recorded compose call exists (batch H, 0 same-zone pairs). The hand-dispatched clusters A-J came from sessions with 0 `selectZoneSpreadBatch` or `main-strictness` calls. `mbe-feature-drain` (`docs/routines/mbe-feature-drain.md:75`, one issue per fire, two fires an hour) and `mbe-swarm` claim through their own label protocol with no selector.

**Classification: not a defect in #6678.** The PRD scoped the probe and selector to the implement-queue compose hook (§ Scope In 3-4), and that hook does call them (`.claude/implement-queue.md:52-53`).

It does matter in two ways:

- The one hazard the selector would have caught on real data, cluster B (three localization issues sharing the catalog JSON; 6 merge-from-main commits, rework 4/2/5), happened through the bypass.
- At the current rate, Operate's minimum signal (5 selector-composed same-zone batches) will not arrive.

Whether other claim paths should call the selector is a new piece of work (a seed or a capture), not a fix to this change. Surfaced for the Owner.

## Verdict

**No critical finding, and no live production defect.** The change is already shipped, and its fail-closed core (default mode, probe, pathless deferral) behaves as specified.

One **Major stays open for the Owner**: trailing punctuation makes the overlap check and #6811's hotspot lock fail open. Five Minors are deferred with their reasons logged above.

Ship may record the release as `released`. It should list the open Major and carry the Operate hand-offs:

- probe-source visibility
- `llms*.txt`-only conflicts
- the dispatch-path coverage question
