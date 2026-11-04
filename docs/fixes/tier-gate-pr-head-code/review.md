---
stage: review
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
head: de3f15ff4
supersedes: review at 5dae8110b (2 majors)
assumptions:
  - "Soft gate satisfied: verification.md exists (14/14 pass on ba9d4f7ac; de3f15ff4 only adds that docs commit). Verify's results (regression fails on origin/main, scanner RED on mutation) are the floor and were not re-run."
  - "Scope per the skill's maintenance-run rule: `git diff origin/main...HEAD` (25 files). The fix-loop delta `git diff 5dae8110b..ba9d4f7ac` (9 files) was re-read in full; the rest was re-read for the full security pass. Security is the core pass."
  - "ADR compliance: architecture.md records no ADR needed. Accepted as before; adr_status.py was not run."
  - "Domain passes (payments / migrations / dependencies): none selected — the diff touches only .github/workflows, scripts/**, docs. No docs/standards.json statement consulted; no finding cites a standard slug."
  - "Cut-list (lean) pass by reading the diff; the diff adds no `lean:` markers."
  - "Severity convention: a residual path that executes PR-head content under pull_request_target = critical. A path by which a low-privilege PR author can still choose a lower tier without code execution = major. A guard-rail (test) that can be bypassed by a FUTURE edit while every current workflow is clean = minor."
  - "Evidence: code reading plus one throwaway probe (a copy of `findHeadExecution` fed 18 hand-written steps; script deleted afterwards). No product code edited, no builds/tests run, nothing pushed; GitHub untouched."
  - "Per the standing instruction the fix loop is NOT run here; new findings are recorded for the Owner/Implement."
---

# Review (re-run): tier gate executes base code only (pull_request_target)

## Scope

Head `de3f15ff4` on `fix/tier-gate-pr-head-code`. Against `defect.md`, `architecture.md`, `breakdown.md` (14/14), `verification.md`. Fix-loop commits: `f1d7f861e` (diff `-z --no-renames`), `14f53ded9` (scanner test), `aea87672f` (docs trigger text), `ba9d4f7ac`.

## Status of the prior majors

### Prior Major 1 (rename / quoted-path blind spot): **CLOSED**

Evidence (`tier-classifier.yml:123,127,160,206-210`; tests in `tier-classifier-workflow.test.mjs`, "changed-file list covers every touched path, unquoted"):

- **Both sides of a move**: `--no-renames` on both `--name-only` and `--numstat`. The test moves `services/users/src/auth/m.ts` → `docs/m.md` and asserts tier ≥ 3 and the old path in the reasons. Previously T1.
- **No quoting**: `-z` emits raw paths. Tests: non-ASCII `é.ts` under `infrastructure/pulumi/` → T4; a tab/quote/backslash name under `services/users/src/auth/` → T4.
- **Parse of name-only**: `split('\0').filter(Boolean)`. A path can contain any byte but NUL, so this is exact. Empty diff → empty list → the existing `highest===0` branch gives T2 with an empty example list (same as main). `count=` is the NUL count (`tr -cd '\0' | wc -c`) = file count.
- **Parse of numstat**: records are `added\tdeleted\tpath\0` under `-z --no-renames` (no 3-field rename form). `[n, , ...rest]` + `rest.join('\t')` rebuilds tab-containing paths. Binary `-\t-\t` → `parseInt('-')` = NaN → `toCount` (`scripts/tier-escalation.mjs:53`) returns 0, so binaries add nothing (unchanged from main). Re-read, not newly introduced.
- **Size totals under `--no-renames`**: a move now shows as `0\tN\told` + `N\t0\tnew`, so the new path's N lines count as additions. That can only over-escalate (a moved >1000-line file bumps one tier) — fail-safe, and the test pins the numstat shape. Exclusion globs apply per path as before.
- **Control characters**: `show()` (:160) escapes `\x00-\x1f\x7f` in every path placed in `reasons` (rule reason :`${show(f)}` and the unmatched-default list). Rules match the raw path, so escaping cannot lower a tier. `reasons` is written as one `key=value` line, so a path cannot add a `GITHUB_OUTPUT` key; the test with `x\ntier=1\nlabel=tier:trivial` asserts exactly 3 output lines `tier,label,reasons` and T4. `\r` is escaped (covers CRLF handling). Non-control Unicode (e.g. U+2028) is left as is; [INFERENCE] the runner splits `GITHUB_OUTPUT` on CR/LF only, so this is not an injection. Because rules only raise (`r.tier > highest`), no raw-path quirk can lower the tier.
- **No shell interpolation of paths**: paths exist only as files (`/tmp/*.txt`), read by `node` from a quoted heredoc (`<<'NODE'`); `${REASONS}` in the comment step is a variable expansion inside an unquoted heredoc, which is expanded once and not re-evaluated (no `$()`/backtick re-execution of the value).
- **Fail-closed**: a `git diff` failure fails the step (`set -euo pipefail`); a missing `changed-files.txt` throws (`readFileSync`) → no label → `decideAutoMergeAction`/eligibility skip. A malformed numstat record yields NaN → 0 additions (under-count on that record only; the path tier still applies). One soft spot is recorded as a minor below (`existsSync` fallback at :206).
- **Very long lists**: files are read from disk, not argv; `reasons` holds at most one entry per tier step plus the 3-path default example (monotonic `r.tier > highest`), so the output stays bounded.

### Prior Major 2 (text-pin tests): **CLOSED as a major; one residual minor (Finding 1)**

`pull-request-target-no-head-execution.test.mjs` is a real parse-and-scan test, not a source-text pin: `js-yaml` parses each workflow, `triggersOnPullRequestTarget` selects every one by its `on:` (string/array/map forms; four named workflows asserted present), and `findHeadExecution` walks `jobs.*.steps[]` applying structured rules (checkout `with.ref`/`with.repository`; `gh pr checkout`; clones; `git checkout|switch|merge|rebase|cherry-pick|pull|read-tree|am|apply`, `worktree add`, `restore --source`; package managers; `node` on anything but `-`, `-e`, or a base `scripts/*.mjs`). It is tested against mutations of a real workflow (11 mutated steps must be flagged, an unmutated copy and a data-only `git fetch/diff` + base-node step must pass); a YAML parse error fails the test. Every current `pull_request_target` workflow passes by my own reading as well. It is a denylist, however, and I demonstrated bypasses (Finding 1) — a future-edit guard-rail gap, not a current exploit.

## Realistic "pwn request" shapes vs the scanner

Probe: `findHeadExecution` over single-step workflows (18 cases).

| Shape                                                                                                                                                                                                         | Result                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout` with `ref:`/`repository:` (any value, incl. `${{ github.event.pull_request.head.sha/ref/repo.full_name }}`)                                                                                | flagged (any override fails, so expressions are caught without parsing them)                                                       |
| `gh pr checkout`                                                                                                                                                                                              | flagged                                                                                                                            |
| `git fetch` + `git checkout`/`switch`/`merge` FETCH_HEAD, `worktree add`, `git clone`, `gh repo clone`, `sh -c '…git checkout…'`                                                                              | flagged                                                                                                                            |
| `pnpm/npm/yarn/bun` run, `node <non-scripts path>`                                                                                                                                                            | flagged                                                                                                                            |
| `uses: ./local-action`                                                                                                                                                                                        | not flagged — correct: with the base-only checkout this is base code; it would only matter after a head checkout, which is flagged |
| `git -C pr checkout …`, `git -c k=v checkout …`                                                                                                                                                               | **missed** (regex only skips option tokens that carry no argument)                                                                 |
| `git reset --hard FETCH_HEAD`, `git checkout-index -a`, `git archive FETCH_HEAD \| tar -x`                                                                                                                    | **missed**                                                                                                                         |
| `git show FETCH_HEAD:x > x` then `node x`/`bash x` (run steps sourcing fetched files); `node -e "$(git show …)"`                                                                                              | **missed**                                                                                                                         |
| `uses: Actions/Checkout@…` with head `ref` (action names are case-insensitive), a checkout-like third-party action, `actions/github-script` running `execSync`, `actions/download-artifact`, `curl … \| bash` | **missed**                                                                                                                         |
| job-level reusable workflow `uses: fork/repo/.github/workflows/x.yml@sha`; composite actions                                                                                                                  | **missed** (not scanned; composite from the base checkout is base code)                                                            |

None of the misses is present in any current workflow (I re-read all four `pull_request_target` files in full). They matter for the next edit only.

## Security pass (whole diff)

| Check                                  | Result     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No PR-head checkout/build/install/exec | Clean      | `tier-classifier.yml` checkout has no `ref:`/`repository:`; head arrives only via `git fetch origin refs/pull/N/head` and is read as revisions in `git diff`. `node` runs the base resolver and a quoted heredoc that imports `/tmp/tier-policy/tier-escalation.mjs`, written by `git show origin/<base_ref>:…`. `auto-merge.yml` / `merge-queue.yml` check out base only and run the base eligibility script. |
| Indirect execution via git             | Clean      | `--no-ext-diff --no-textconv`, revision diff, no working-tree reads; repo config/hooks/attributes come from the base checkout, not fetched objects.                                                                                                                                                                                                                                                            |
| PR-derived values only through `env:`  | Clean      | Title/body/is_fork/base_ref/head_sha are step outputs consumed via `env:`; no `${{ }}` in any `run:` body of the three workflows. Resolver writes multi-line values with a random delimiter. Branch names are double-quoted and prefixed `origin/`.                                                                                                                                                            |
| Token scope / persist-credentials      | Clean      | Classifier `contents: read`, `pull-requests: write`; `persist-credentials: false` on checkouts. Arming workflows keep write (needed to merge) but contain no PR-controlled code. Repo is public so unauthenticated fetch of `refs/pull/N/head` works (a private repo would fail closed).                                                                                                                       |
| Dispatch guard                         | Clean      | Compares `github.ref` with `refs/heads/<default_branch>`; all ten producers dropped `--ref` (dispatch test over every workflow). A writer dispatching `--ref evil` runs that ref's file, lacking the guard — requires write access, no escalation.                                                                                                                                                             |
| Non-default base PRs                   | Acceptable | The workflow, resolver and policy come from the PR's base branch, which only a push-access user can prepare; a missing policy module fails the step (no label). Content reaching `main` is classified by `main`'s workflow over the full merge-base diff.                                                                                                                                                      |
| Fail-closed                            | Clean      | Resolver/fetch/head-SHA mismatch/missing policy/import error fail the step → no `tier:*` label → eligibility `skip`.                                                                                                                                                                                                                                                                                           |
| Rollout race with old runs / migration | Acceptable | Concurrency keyed on PR number (cancel-in-progress). Old `pull_request` runs vanish when the file changes on `main`; open PRs keep their label until the next `synchronize`; the fix PR itself gets no automatic label (documented in `architecture.md` § Migration and `docs/change-tiers.md`).                                                                                                               |

**No residual path executes PR-head content. No critical finding.**

## Findings

### Minor: The head-execution scanner is a denylist with demonstrable bypasses

- Scenario: a later edit adds `run: git -C pr checkout FETCH_HEAD` or `git fetch … && git reset --hard FETCH_HEAD`, or `git show FETCH_HEAD:scripts/x.mjs > scripts/x.mjs` followed by `node scripts/x.mjs` (the `node` rule accepts any `scripts/*.mjs`), or `uses: Actions/Checkout@… with: ref: ${{ …head.sha }}`; `findHeadExecution` (`pull-request-target-no-head-execution.test.mjs:38-70`) returns no finding and CI stays green while the job has a write token. Probe results in the table above.
- Why only minor: no current workflow contains any of these (verified by reading); the test is still a net improvement over the prior regex pins, and workflow files are T4 in this repo (merge-gate files get critical review), so a human sees the diff.
- Fix direction (not done): switch the `run` check to an allowlist (`git fetch|diff|show|rev-parse|merge-base` writing to `/tmp` only, `node scripts/<base file>`, `gh` commands), case-fold the `actions/checkout` match and flag any `uses:` that is not on a pinned allowlist, and flag job-level `uses:` outside `./`.
- Standard: none
- Decision: deferred to the Owner; test-only, no behaviour change.

### Minor: Missing numstat silently yields zero additions

- Scenario: `tier-classifier.yml:206` returns `''` when `/tmp/numstat.txt` is absent, so the size rule would silently never fire. The diff step always writes the file (redirect), so today this cannot happen; the guard exists only for tests. A future refactor that renames the file would turn the size rule off without failing the step, whereas `changed-files.txt` correctly throws.
- Standard: none
- Decision: deferred — optional hardening (drop `existsSync`, let it throw).

### Minor: Stale text about the old trigger (partly resolved)

- Scenario: `docs/claude-reference.md:120` is now corrected (the fix-loop commit). `.github/workflows/acmm-regression.yml:190` still says "Every pull_request(_target)-triggered run" which is accurate; no remaining doc contradicts the trigger that I found. The prior minor is **closed**.
- Decision: closed.

### Minor (carried): Stale-label window between `synchronize` and reclassification

- Scenario: PR labelled `tier:trivial`, author pushes a sensitive change; `auto-merge.yml`/`merge-queue.yml` `synchronize` runs concurrently with the classifier and can read the old label before the new one lands. Branch protection remains the backstop. Pre-existing; not worsened.
- Decision: deferred — pre-existing design, out of scope.

### Minor (carried): Arming workflows do not restrict to default-base PRs; unquoted label iteration

- Scenario: `auto-merge.yml` iterates `$LABELS` unquoted and prints `$REASON` in a `::warning::` command; label names are writable only by triage+ users, and arming still requires a maintainer-applied label and a base-code eligibility decision, so an unprivileged PR author gains nothing. Fork PRs now run these workflows with a write token, but no PR code runs.
- Decision: deferred — hardening only.

### Minor (carried): Classifier comment embeds PR path text

- Scenario: control characters are now escaped, but backticks, `@mentions` and markdown in a path still reach the bot comment (a name with a backtick can break out of the code span). Cosmetic bot-comment spam; no label or output impact.
- Decision: deferred.

## Passes with no new findings

- **Correctness**: head-SHA race check, merge-base, base-policy load, output handling, dispatch guard, concurrency and the `-z` pipeline read correct; the new T4 rules (`auto-merge`, `merge-queue`, `resolve-pr-metadata.mjs`, `merge-queue-eligibility.mjs`) match `docs/change-tiers.md`.
- **Tests**: the diff-listing and classify tests run real `git` against a local bare origin and feed the real extracted heredoc (behavioural). The scanner test is structural (parsed YAML) with mutation checks; the dispatch/arming wiring tests are structural pins of intended shape. Each has a failing-first run recorded in `verification.md`.
- **Design**: matches `architecture.md`; no ADR owed (one-revert reversible, documented in the workflow header and `change-tiers.md`).
- **Complexity**: no lean cut-list hit; `show()` and the NUL parse are the minimum for the stated defect; ten-producer change is a pure `--ref` deletion.
- **ADR compliance**: no violation identified (see assumptions). **Domain passes**: none selected.
- **Docs**: `change-tiers.md` and `claude-reference.md` describe `pull_request_target`; migration note present.

## Verdict

No critical and no major finding is unfixed. Both prior majors are closed with evidence (Major 1 by `-z --no-renames` and raw-path classification with escaped output; Major 2 by a parsed-YAML scanner that is exercised against mutations). Six minors remain, all deferred with reasons; the only one I would take cheaply before Ship is the scanner allowlist hardening, optional. Next stage: Ship.
