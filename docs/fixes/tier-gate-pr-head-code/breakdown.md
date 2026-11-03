---
stage: decompose
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
assumptions:
  - "Milestone cut: the decompose skill names no default for where the milestone boundaries fall. Standing instruction is to take the skill's recommended defaults; the skill's stated defaults are 'cut items small (one sitting)', 'order by dependency' and 'prefer vertical slices'. Applied: three milestones, each leaving the branch green and demonstrable (classifier seam; producers + arming workflows; docs + gate). No boundary question is surfaced."
  - "One PR, no merge item: per autorun-brief.md § Release (Ship opens the PR and stops; Matt merges). The last item is a local gate, not a merge."
  - "Line pointers re-measured on branch head ffc815bc5 (origin/main ab4a3b2bc + run artifacts). Implement MUST re-grep by content, since earlier items shift later line numbers in the same file."
  - "Design gap check: none routed back to Architect. One consequence the architecture does not spell out is covered by an item without new design: auto-merge.yml:17 and :32 and merge-queue.yml:38 compare the event name to the literal `pull_request`; after the trigger swap that literal never matches, so the item that swaps the trigger also updates those comparisons to `pull_request_target` (a mechanical consequence of the architecture's 'same types, trigger swap')."
---

# Breakdown: tier gate executes base code only; PR head is data

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Source: `architecture.md` (this directory). Test runner: the `scripts/` tests run
under `scripts/vitest.config.mjs` (e.g.
`pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/<file>`).
Every item below is RED-first: write the test, see it fail for the stated reason
against the current tree, then make the change. Every item commits with
explicit-path staging. Workflow shell bodies use `set -euo pipefail`, never a
variable named `status`, and no `${{ }}` inside a `run:` body.

## Milestone 1: the classifier cannot be steered by the PR it classifies

Demonstrable at the end: a throwaway repo whose PR ref carries a forged resolver
and neutered policy still classifies from the real file list, and the workflow
file passes a textual base-only-execution contract.

- [x] **Trust-seam RED test (structural)** — in `scripts/__tests__/tier-classifier-workflow.test.mjs`, add `describe("trust seam: base-only execution")` (append after the `describe` at `:535`, reuse its `extractStepRun` helper and fixtures): (a) `on:` has `pull_request_target` and `workflow_dispatch` and no `pull_request:`; (b) the checkout step has no `ref:` or `repository:` and sits before the resolver step; (c) no step runs `git checkout`/`switch`/`merge`/`worktree add`, and the only `node` invocations are the resolver and the Classify heredoc; (d) `base_ref` is read only from `steps.pr.outputs.base_ref` and step `pr` runs `scripts/resolve-pr-metadata.mjs`; (e) no `${{ }}` inside any `run:` body.
  - Accept: the new describe runs and fails against the current `tier-classifier.yml` on (a) (`pull_request:` at `:11`) and (b) (`ref:` at `:53`) — failure messages captured in the commit body; all pre-existing tests in the file still pass.
  - Blocked by: —
  - Evidence: RED observed — `(a)` failed `expected 'on:\n  pull_request:…' to match /^ {2}pull_request_target:/m`; `(b)` failed `expected '      - name: Checkout (PR head)…' not to match /^\s*ref:/m`; 53 other tests passed.
- [x] **Behavioural RED tests: fetch-as-data, diff, dispatch guard** — same file, new `describe` using the existing `makeRepo` + `extractStepRun` pattern. Fixture: base `origin/main` has the real resolver/policy; `refs/pull/7/head` carries a neutered policy and an edited resolver. Cases: (1) run the **Fetch PR head as data** and **Compute base SHA and diff** step bodies; assert the file list is the real one and non-empty, the working tree's resolver/policy bytes still equal base, and a tip != `HEAD_SHA` exits non-zero; (2) no common ancestor with `origin/<base_ref>` exits non-zero; (3) the **Pin dispatch to the default branch** step body exits non-zero for `github.ref` != default, zero when equal, zero for a non-dispatch event.
  - Accept: tests fail (step not found) against the current workflow, for the reason that the named steps do not yet exist; failing output recorded.
  - Blocked by: Trust-seam RED test (structural)
  - Evidence: RED observed — new describe fails with `Error: tier-classifier.yml has no step named "Fetch PR head as data"` (4 tests) and `no step named "Pin dispatch to the default branch"` (3 tests) + `Cannot read properties of undefined (reading 'text')` (1); 10 failed / 53 passed.
- [x] **Swap `tier-classifier.yml` to a base-only trust seam** — edit `.github/workflows/tier-classifier.yml`: `on:` `pull_request` (`:11`) → `pull_request_target` (same `types`); update the `pr` input description (`:16-21`); add step 1 **Pin dispatch to the default branch** (`if: github.event_name == 'workflow_dispatch'`, fail unless `github.ref` = `refs/heads/<default_branch>`, both via `env:`); replace **Checkout (PR head)** (`:42-53`) with a checkout carrying no `ref:`/`repository:`, `fetch-depth: 0`, `persist-credentials: false`; keep **Resolve PR metadata** (`:55-64`, `id: pr`) unchanged in name, running the base-checkout resolver; add **Fetch PR head as data** (`git fetch --no-tags origin "refs/pull/${PR_NUMBER}/head"`, tip must equal `HEAD_SHA` from `steps.pr.outputs.head_sha`, via `env:`); rewrite **Compute base SHA and diff** (`:66-76`) to diff `base_sha` against `$HEAD_SHA` with `--no-ext-diff --no-textconv` for both `--name-only` and `--numstat`, still writing `/tmp/changed-files.txt` and `/tmp/numstat.txt` and the `count` output; **Load tier policy from base branch** (`:78-90`) keeps its name and `git show` line, and its comment is rewritten (see the docs item). Leave Classify, Ensure tier labels, Apply tier label, Comment untouched in this item.
  - Accept: both RED items now pass; existing `tier-classifier-workflow`, `tier-escalation` tests still pass; the steps named `Resolve PR metadata` and `Load tier policy from base branch` still exist.
  - Blocked by: Behavioural RED tests: fetch-as-data, diff, dispatch guard
  - Evidence: GREEN — `vitest tier-classifier-workflow tier-escalation`: 79 passed (79), incl. trust-seam (a)-(e), fetch/diff/dispatch-guard cases; steps `Resolve PR metadata` and `Load tier policy from base branch` kept. Note: macOS `wc -l` pads `count=`, test regex allows whitespace.

## Milestone 2: producers and consumers match the new seam

Demonstrable at the end: no workflow asks for a non-default-branch classifier run,
and arming workflows no longer execute PR-head files.

- [x] **Dispatch RED test over all workflows** — in `scripts/__tests__/tier-classifier-dispatch.test.mjs`: replace the `dispatchRe` test (`:56-62` region; the `PRODUCERS` `branch` field and the "on its own automation branch" test) with a test over every `.github/workflows/*.yml`: any `gh workflow run tier-classifier.yml` line has no `--ref`, and at least the ten producers (`acmm-regression`, `docs-audit`, `drift-fix`, `metrics-collectors`, `pr-metrics`, `production-feedback`, `record-summary-rows`, `shipped-features-snapshot`, `stale-human-blocked`, `visual-baseline-regen`) each contain such a dispatch (so the test cannot pass by finding nothing). Change the trigger assertion at `:37-42` to `pull_request_target:\s*\n\s*types:\s*\[opened, synchronize, reopened\]`. Keep the other existing producer assertions (dispatch gated on PR creation, wait-for-label).
  - Accept: fails against the tree, naming all ten producer files (each still passes `--ref`) and the `pull_request` trigger; other existing assertions in the file unchanged and passing.
  - Blocked by: Swap `tier-classifier.yml` to a base-only trust seam (trigger assertion needs the new trigger; the `--ref` half is green only after the next item)
  - Evidence: RED observed — `no gh workflow run tier-classifier.yml line passes --ref`: `expected [ acmm-regression.yml, docs-audit.yml, drift-fix.yml, metrics-collectors.yml, pr-metrics.yml, production-feedback.yml, record-summary-rows.yml, shipped-features-snapshot.yml, stale-human-blocked.yml, visual-baseline-regen.yml ] to deeply equal []`; trigger assertion (pull_request_target) already green after the seam item; 1 failed / 15 passed.
- [x] **Producers stop passing `--ref`; comments corrected** — remove `--ref <branch>` from the dispatch line in the ten producers: `acmm-regression.yml:184`, `docs-audit.yml:173`, `drift-fix.yml:151`, `metrics-collectors.yml:362`, `pr-metrics.yml:87`, `production-feedback.yml:178`, `record-summary-rows.yml:110` (`--ref ${{ steps.create-pr.outputs.pull-request-branch }}`; drop any now-unused `env`/output only if it has no other reader), `shipped-features-snapshot.yml:93`, `stale-human-blocked.yml:129`, `visual-baseline-regen.yml:214` (`--ref "$BRANCH"`; keep `BRANCH` if used elsewhere). Rewrite the comments saying the classifier "only triggers on `pull_request`" (`acmm-regression.yml:174`, `docs-audit.yml:167`, `drift-fix.yml:141`, `metrics-collectors.yml:354`, `pr-metrics.yml:77`, `production-feedback.yml:168`, `stale-human-blocked.yml:121`) to state the real reason: a `GITHUB_TOKEN`-authored PR fires no `pull_request(_target)` event, and the dispatch runs from the default branch. Do not touch their `ci.yml` dispatches.
  - Accept: the dispatch RED test passes; `git grep -n "tier-classifier.yml --ref" .github/workflows` prints nothing; `git grep -n "only triggers on .pull_request" .github/workflows` prints nothing; `ci.yml` dispatch lines unchanged (`git diff` shows no change to them).
  - Blocked by: Dispatch RED test over all workflows
  - Evidence: GREEN — dispatch suite 16 passed (16); `git grep -n "tier-classifier.yml --ref" .github/workflows` and `git grep -n "only triggers on .pull_request" .github/workflows` print nothing; no ci.yml dispatch line in the diff. visual-baseline-regen: BRANCH env dropped from the tier step only (still read by the ci.yml step).
- [x] **Arming-workflow RED tests** — in `scripts/__tests__/merge-queue-eligibility.test.mjs` (extend the `merge-queue.yml wiring` describe at `:121` and the `auto-merge.yml wiring (#3857)` describe at `:490`): assert each file declares `pull_request_target` (and no `pull_request:` trigger), checks out with no `ref:`/`repository:`, carries a header comment stating the never-check-out-the-PR-head rule, contains no remaining literal `"pull_request"` event-name comparison (`auto-merge.yml` `if:` and PR-number step; `merge-queue.yml` PR-number step) and compares to `pull_request_target` instead. `merge-queue-tier-race.test.mjs` is not edited.
  - Accept: new assertions fail against the current files (trigger at `auto-merge.yml:4`, `merge-queue.yml:4`; comparisons at `auto-merge.yml:17,32`, `merge-queue.yml:38`); the rest of both test files passes.
  - Blocked by: —
  - Evidence: RED observed — 6 failed / 95 passed: `expected 'on:\n  pull_request:…' to match /^ {2}pull_request_target:/m`, `expected 'name: Auto-Merge Policy\n' to match /^#.*\bnever\b.*PR head/im`, `…not to match /['"]pull_request['"]/` (each for both files).
- [x] **Move `auto-merge.yml` and `merge-queue.yml` off PR-head execution** — `auto-merge.yml:4` and `merge-queue.yml:4`: `pull_request` → `pull_request_target`, same `types`. Update every event-name literal to match: `auto-merge.yml:17` (`github.event_name == 'pull_request_target'`) and `:32` (`[ "$EVENT_NAME" = "pull_request_target" ]`), `merge-queue.yml:38`. Add the header-comment rule modelled on `dependabot-auto-merge.yml:7-12` (base repo only, never the PR head, PR-derived values only via `env:`). Checkouts (`auto-merge.yml:20`, `merge-queue.yml:19`) stay without `ref:`. `check_suite`, `schedule`, `workflow_dispatch` paths unchanged.
  - Accept: arming-workflow RED tests pass; `merge-queue-eligibility` and `merge-queue-tier-race` suites pass unchanged otherwise; `git grep -n "'pull_request'\|\"pull_request\"" .github/workflows/auto-merge.yml .github/workflows/merge-queue.yml` prints nothing.
  - Blocked by: Arming-workflow RED tests
  - Evidence: GREEN — merge-queue-eligibility + merge-queue-tier-race: 101 passed (101); `git grep -n "'pull_request'\|\"pull_request\"" .github/workflows/auto-merge.yml .github/workflows/merge-queue.yml` prints nothing.

## Milestone 3: gate-file T4 rules, docs, and the local gate

Demonstrable at the end: editing any merge-gate file lands T4, the docs tell the
truth, and every affected check is green locally.

- [ ] **T4 rules RED tests** — in `scripts/__tests__/tier-classifier-workflow.test.mjs`, using the existing `runClassifier` helper: cases expecting tier 4 for `scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`, `.github/workflows/auto-merge.yml`, `.github/workflows/merge-queue.yml`; plus negative cases (not T4) for a similarly named file, e.g. `.github/workflows/auto-merge-notes.yml` and `scripts/resolve-pr-metadata.test.mjs`-style names outside the exact set (assert via the tier actually returned, not "not 4" alone, where the existing rules give a determinate tier).
  - Accept: the four T4 cases fail (currently T2 via default) and the negative cases pass; failure output recorded.
  - Blocked by: Swap `tier-classifier.yml` to a base-only trust seam (the heredoc is edited in the same file)
- [ ] **Add the T4 rules to Classify** — in the `rules` array of the Classify heredoc (T4 block, `:108-116`): extend the workflow regex at `:113` from `(codeql|coverage-gate|tier-classifier)` to `(codeql|coverage-gate|tier-classifier|auto-merge|merge-queue)`; add exact-match rules next to `:114` for `scripts/resolve-pr-metadata.mjs` and `scripts/merge-queue-eligibility.mjs` (`why:` strings in the existing style, e.g. `merge-gate script edit`).
  - Accept: T4 rules RED tests pass; all existing `runClassifier` and `tier-escalation` tests still pass.
  - Blocked by: T4 rules RED tests
- [ ] **Correct `docs/change-tiers.md` and workflow comments** — `docs/change-tiers.md:28`: keep "a PR cannot edit the policy to lower its own tier" only with its real basis (workflow runs from the base side, PR head is fetched as data, never executed); in the T4 list (`:22-31`) add `scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`, `.github/workflows/auto-merge.yml`, `.github/workflows/merge-queue.yml`. Rewrite the comment at `tier-classifier.yml:78-84` (now describing a base-only checkout, no "PR-head checkout"). Update the stale header comment on the `pr` input if not already done in the seam item. Prettier-format the markdown.
  - Accept: `git grep -n "PR HEAD\|PR-head checkout" .github/workflows/tier-classifier.yml` prints nothing; the four paths appear in `docs/change-tiers.md`'s T4 section; `pnpm exec prettier --check docs/change-tiers.md` passes; tests that read these files (`tier-classifier-workflow`, `check-prettier-claude-coverage`) still pass.
  - Blocked by: Add the T4 rules to Classify
- [ ] **Final local gate and PR-body record** — run, from the worktree: `pnpm exec vitest run --config scripts/vitest.config.mjs` over `tier-escalation`, `tier-classifier-workflow`, `tier-classifier-dispatch`, `merge-queue-tier-race`, `merge-queue-eligibility`, `resolve-pr-metadata`, `wait-for-tier-label`; then `pnpm lint`, `pnpm typecheck`, and the `scripts/` package test run for anything affected, plus `pnpm exec prettier --check` over every changed file (an `actionlint`-style syntax check if available locally; otherwise state it was not run). Write the PR-body requirements into `docs/fixes/tier-gate-pr-head-code/` run notes only as the Ship stage needs them (no new doc file here): (1) migration note — the fix PR gets **no automated `tier:*` label** (the old gate's `pull_request` trigger does not exist in the PR's workflow; [INFERENCE] from trigger rules); by the rules it is T4 and **Matt applies `tier:critical` by hand**; nothing arms auto-merge on it; (2) rollback is a revert of the whole change as a unit, never the workflow alone (old workflow + producers already on default branch would stamp an empty `main`-vs-`main` diff `tier:trivial`); (3) real `pull_request_target`/fork/dispatch behaviour is not testable locally; verify by the next PR's label after merge. **No merge step**: Ship opens the PR and stops; Matt merges.
  - Accept: every listed suite is green with output pasted into the Implement stage record; lint/typecheck results stated (or the exact reason a command could not run); the three PR-body requirements are written verbatim into the Implement-stage hand-off section for Ship; no item in this breakdown merges, pushes, dispatches or tags.
  - Blocked by: Move `auto-merge.yml` and `merge-queue.yml` off PR-head execution; Producers stop passing `--ref`; comments corrected; Correct `docs/change-tiers.md` and workflow comments

## Design gaps found

none. (The event-name literal consequence in the arming workflows is mechanical and folded into the trigger-swap item; see assumptions.)

## Notes

Out of scope, per brief and architecture: agent-core `GATE_PATHS`, branch protection or required code-owner review, the 4 deferred minors of the tier-escalation review, and the repo-wide audit of other `pull_request` workflows holding write tokens.
