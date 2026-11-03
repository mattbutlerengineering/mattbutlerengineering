---
stage: review
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
assumptions:
  - "Soft gate satisfied: verification.md exists (9/9 pass), so this is not a review of unverified work. Verify's regression result (22 new tests fail on origin/main, pass on branch) is the floor and was not re-run (read-only review; no builds/tests executed)."
  - "Scope per the skill's maintenance-run rule: diff is `git diff origin/main...HEAD` (17 code/test/doc files + run docs). Security is the core pass, as the Owner directed."
  - "ADR compliance: architecture.md records no ADR needed and no ADR-016 amendment (tier-classifier is not a required check). I accepted that and did not run adr_status.py; a violation of a live ADR was not looked for beyond that claim."
  - "Domain passes (payments / migrations / dependencies): none selected — the diff touches only .github/workflows, scripts/__tests__, docs. No `docs/standards.json` consulted (unbootstrapped for this repo as far as the diff shows); no finding cites a standard slug."
  - "Cut-list (lean) pass: applied by reading the diff only; no `lean:` markers were added by the diff."
  - "Severity convention: a residual path that executes PR-head content under pull_request_target = critical (none found). A path by which a low-privilege PR author can still choose a lower tier than the policy intends, without code execution = major."
  - "Findings were verified by reading the code and by one throwaway local `git diff` experiment in a temp repo outside the worktree (deleted by OS temp cleanup); no product code was edited and nothing was pushed. GitHub was read-only (`gh repo view` only)."
  - "Per the standing instruction, the skill's fix loop is NOT run here: the two Major findings and the minors are recorded and routed back to Implement."
---

# Review: tier gate executes base code only (pull_request_target)

## Scope

`git diff origin/main...HEAD` on `fix/tier-gate-pr-head-code` (16 commits): `tier-classifier.yml`, `auto-merge.yml`, `merge-queue.yml`, the ten producer workflows, `docs/change-tiers.md`, three test files, plus run docs. Read against `defect.md`, `architecture.md`, `verification.md`.

## Security pass — evidence for each requested check

| Check                                                 | Result                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No PR-head checkout/build/install/exec                | **Clean**                              | `tier-classifier.yml:72-79` checkout has no `ref:`/`repository:`; head arrives only via `git fetch origin refs/pull/N/head` (:100) and is read as revisions (:114-120). No `npm`/`pnpm`/`node <fetched file>`; the only `node` calls run `scripts/resolve-pr-metadata.mjs` from the base checkout (:90) and the Classify heredoc, which imports `/tmp/tier-policy/tier-escalation.mjs` written by `git show origin/<base_ref>:…` (:135). `auto-merge.yml:26` and `merge-queue.yml:24` also check out base only and run base `scripts/merge-queue-eligibility.mjs`. |
| Indirect execution via git                            | **Clean**                              | `git diff --no-ext-diff --no-textconv` (:117,:120) disables external drivers/textconv; revision-to-revision diff, no worktree reads; git config/hooks are not taken from fetched objects; attributes read from the base working tree. `git show` output goes to a file, not a shell.                                                                                                                                                                                                                                                                               |
| PR-derived values reach shell only via `env:`, quoted | **Clean**                              | title/body/is_fork/base_ref/head_sha are step outputs consumed via `env:` (:96-97,:110-111,:130-131,:140-142). The only `${{ }}` in `run:` bodies: none (test (e) pins this and I re-read all three workflows). Resolver writes title/body with a random-UUID heredoc delimiter (`resolve-pr-metadata.mjs`), so output-injection is closed. Branch names are double-quoted and prefixed `origin/`. `${REASONS}` in the unquoted heredoc (:371) is expanded once at template level; values are not re-evaluated.                                                    |
| Filenames with newlines/spaces/dashes                 | **Injection-safe, correctness-unsafe** | Git always C-quotes names containing `\n`, `\t`, `"`, `\` (and non-ASCII under default `core.quotePath`), so a newline can neither split `changed-files.txt` nor inject a `label=` line into `$GITHUB_OUTPUT` via `reasons=`. The same quoting is a classification defect — see Finding 1.                                                                                                                                                                                                                                                                         |
| Token permissions / persist-credentials               | **Clean**                              | classifier `contents: read`, `pull-requests: write`; checkouts `persist-credentials: false`. Arming workflows keep `contents: write` (needed to merge) and run base code only, with no PR-controlled code in the job. Repo is PUBLIC, so the unauthenticated `git fetch` after `persist-credentials: false` works (would break on a private repo — fails closed).                                                                                                                                                                                                  |
| Dispatch guard bypass                                 | **Clean for its purpose**              | `:60-70` compares `github.ref` to `refs/heads/${default_branch}`: tags (`refs/tags/x`) and other branches fail; `github.ref_name` is not used so a branch named like a tag cannot collide. The guard is advisory against honest mistakes: a writer who dispatches `--ref evil` runs _that ref's_ file, which simply lacks the guard — but dispatch needs write access, so that is not an escalation. All ten producers dropped `--ref` (diff + dispatch test over every workflow file).                                                                            |
| Non-default base branch                               | **Acceptable (see Finding 5)**         | `pull_request_target` runs the workflow, resolver and policy file from the PR's base branch. Only someone with push access can create/alter a base branch (a fork PR can only target existing upstream branches, and a stale branch that predates this change has no `pull_request_target` trigger, so nothing runs). A PR into an attacker-prepared base can be mislabelled, but the PR that carries that content into `main` (X→main) is classified by `main`'s workflow over the full merge-base diff, so it cannot reach `main` under a forged tier.           |
| Fail-closed on error paths                            | **Clean**                              | Resolver/fetch/head-SHA mismatch/missing base policy/import error each fail the step → no `tier:*` label → `decideAutoMergeAction` returns `skip` ("awaiting tier classification") and `isAutomationAutoMergeEligible` blocks unclassified PRs.                                                                                                                                                                                                                                                                                                                    |
| Rollout races / migration note                        | **Acceptable**                         | `concurrency` group is keyed on PR number for both events (cancel-in-progress). Old `pull_request` triggers vanish with the change; open PRs keep their labels until next `synchronize` (documented, architecture.md § Migration). Fix PR itself gets no automated label (documented; the Owner applies `tier:critical`). Rollback-as-a-unit hazard is documented.                                                                                                                                                                                                 |

**No residual pwn-request path was found. No critical finding.**

## Findings

### Major: Changed-file list drops renamed-from paths and mangles quoted paths, so a PR can still lower its own tier

- Scenario (reproduced locally in a temp repo with the exact flags the workflow uses):
  1. A PR renames `services/users/src/auth/m.ts` → `docs/m.md` (content kept ≥50% similar). `git diff --no-ext-diff --no-textconv --name-only B H` prints only `docs/m.md`; the old auth path never reaches `/tmp/changed-files.txt` (numstat shows `services/… => docs/m.md`, parsed as a single weird path). Rules see only a `.md` file → **T1**, auto-merge-eligible for `has-pr`/`auto-merge`-labelled PRs. A move-out of auth middleware, a prisma schema, or a merge-gate script is really a deletion of critical code.
  2. A PR adds `infrastructure/pulumi/é.ts` (or any name with a non-ASCII byte, tab, quote, backslash). Output is `"infrastructure/pulumi/\303\251.ts"`, which begins with `"`, so every `^…` path rule misses → unmatched default **T2** instead of T4.
     Both are exactly the defect's class (PR author influences the tier the gate assigns) via the diff-listing step the fix rewrote (`tier-classifier.yml:117,120`). Both behaviours are inherited from main (`git diff --name-only "${base_sha}...HEAD"`), so this is not a regression, but the fix claims the gate now classifies the real diff and the new tests exercise a real `git diff` yet never feed it a rename or a special-character name.
- Fix direction (route to Implement): add `--no-renames` (so both sides appear) and `-z` with NUL-split parsing for name-only and numstat (or at minimum `-c core.quotePath=false --no-renames`, noting that newline/quote names stay quoted), then update the numstat parser (`rest.join('\t')` assumes a single path column) and add behavioural tests with a rename-out-of-auth and a non-ASCII-name case.
- Standard: none
- Decision: **deferred to the Owner — unfixed.** Not fixed in this stage (read-only standing instruction). It is a pre-existing gap outside the stated defect (code execution/base-ref forgery), so the Owner may accept it as a tracked follow-up; I rate it Major because it lets an unprivileged author lower the tier of a gate-protected change.

### Major: Test (e) and the arming-workflow tests pin source text rather than behaviour for the highest-risk claims

- Scenario: the claims "no step checks out the PR head", "no `${{ }}` in run bodies", and "arming workflows run base code only" are asserted by regexes over YAML text (`merge-queue-eligibility.test.mjs` new block; trust-seam (a)-(e)). A future edit that adds `run: gh pr checkout "$PR_NUMBER"`, `git switch`, a `uses:` of a composite action that checks out the head, or `actions/checkout` with `with: ref: ${{ … }}` indented unusually in `auto-merge.yml` passes some of these (the arming tests only look for `ref:`/`repository:` lines and the string `'pull_request'`; `gh pr checkout`/`git fetch … && git checkout FETCH_HEAD` in a later step are not checked there; classifier test (c) does cover `checkout|merge|worktree add` for the classifier only). The behavioural tests that matter (fetch-as-data diff, head-SHA race, no-common-ancestor, dispatch guard) are real and good.
- Fix direction: extend the arming-workflow test with the same "no step switches the working tree to PR code" scan the classifier has, and run it over all `pull_request_target` workflows (`dependabot-auto-merge.yml` already carries the same header).
- Standard: none
- Decision: **deferred to the Owner — unfixed.** Guard-rail strength only; no current exploit. If the Owner wants it fixed, it is a small test-only Implement item.

### Minor: Stale doc contradicts the new trigger

- Scenario: `docs/claude-reference.md:120` still says "`tier-classifier.yml` triggers on `pull_request` natively", and `scripts/wait-for-tier-label.mjs` / acmm-regression.yml:190 comment text still describe pull_request-triggered runs. A reader debugging a missing label looks for the wrong event.
- Standard: none
- Decision: deferred — fix in the Implement pass that handles Finding 1 (doc-only).

### Minor: Stale-label window between `synchronize` and reclassification (inherited)

- Scenario: PR labelled `tier:trivial`, author pushes a sensitive change; `merge-queue.yml`/`auto-merge.yml` `synchronize` runs concurrently with the classifier and can read the old label and enable auto-merge before `tier:critical` lands. `decideAutoMergeAction` then only disables on `needs-review`, and the label change by GITHUB_TOKEN does not re-trigger the workflow (documented in the eligibility script). Branch protection (required checks and approvals) remains the backstop. Not introduced or worsened by this change.
- Standard: none
- Decision: deferred — pre-existing design; out of this run's scope.

### Minor: Arming workflows do not restrict to default-base PRs; unquoted label iteration

- Scenario: a PR into a non-default base carrying `auto-merge`/`has-pr` can be armed by these workflows (merges only into that base). `auto-merge.yml:70` iterates `$LABELS` unquoted (glob/word-split) and `:98` interpolates `$REASON` into a `::warning::` command; label names are writable only by triage+ users. Fork PRs now run these workflows with a write token (previously read-only on `pull_request`), but arming requires a maintainer-applied label and a base-code eligibility decision, so no escalation.
- Standard: none
- Decision: deferred — hardening, not exploitable by an unprivileged author.

### Minor: Classifier comment embeds PR paths and fixed-length reasons

- Scenario: the rationale comment includes file paths from the PR (markdown/@mention injection into a bot comment). Newlines are not possible (git-quoted). Cosmetic spam only.
- Standard: none
- Decision: deferred.

## Passes with no findings

- **Correctness** (beyond Finding 1): head-SHA race check, merge-base, base-policy load, GITHUB_OUTPUT heredoc handling, dispatch guard, and concurrency read correct. The T4 rule additions (`auto-merge`, `merge-queue`, `resolve-pr-metadata.mjs`, `merge-queue-eligibility.mjs`) match `docs/change-tiers.md`.
- **Design**: matches architecture.md contracts; the no-ADR decision is consistent with the protocol's bar (reversible by one revert; stated in workflow header and `change-tiers.md`).
- **Complexity**: no lean cut-list hits; no speculative abstraction; the ten-producer edit is a pure `--ref` deletion.
- **ADR compliance**: no violation identified (see assumptions).
- **Domain passes**: none selected.
- **Tests**: the classifier behaviour tests run the real extracted heredoc, and the fetch-as-data tests run real `git` against a local bare origin (real behaviour); the dispatch/arming wiring tests are text pins (Finding 2).

## Verdict

No critical finding and no residual pull_request_target code-execution path: the three merge-gate workflows run base code only, handle PR-derived values through `env:`, keep the write token away from PR content, and fail closed. **Two Major findings are unfixed** (Finding 1 — rename/quoted-path blind spots in the diff list; Finding 2 — text-pin tests for the arming workflows). Per the skill, majors are fixed or explicitly deferred by the Owner before Ship; neither is a regression introduced by this change. Recommendation: send Finding 1 (and its doc minor) back through Implement before Ship, since the fix's purpose is that a PR cannot lower its own tier; Finding 2 can be taken in the same pass at low cost.
