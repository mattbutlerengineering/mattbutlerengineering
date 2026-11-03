---
stage: review
run: feature:tier-escalation-false-positives
date: 2026-11-02
assumptions:
  - "Scope is the feature as it stands on origin/main `6e9adc880`: #6701 (`b8af19905`) plus the re-entry fix #7078 (`79b02e565`). `git log 79b02e565..HEAD -- .github/workflows/tier-classifier.yml scripts/tier-escalation.mjs scripts/__tests__/tier-escalation.test.mjs scripts/resolve-pr-metadata.mjs` printed nothing, so nothing touched those files since. #6701 and #7078 were merged by the Owner with no PR review (`reviews: []`, `reviewDecision: ''`)."
  - "Reviewed against prd.md with criterion 1 as the Owner amended it on 2026-10-18 (#6610 -> T4 is correct), architecture.md, and verification.md (2026-11-02, all pass). verification.md exists, so no soft-gate inversion."
  - "Read-only on GitHub: no workflow was dispatched, no PR opened, no label touched. The self-lowering path below is established by reading the workflow and by re-running its two `git` steps locally in a throwaway repo, not by exploiting the live gate. Statements about what GitHub Actions does on `pull_request` (workflow file taken from the PR merge commit; fork PRs get a read-only token; `fetch-depth: 0` fetches `origin/*` branches) are standard platform behaviour I did not re-test: marked [INFERENCE]."
  - "Complexity pass: `lean`'s cut-list was not enumerated line by line. I grepped the diff for `lean:` markers (none added) and found no confirmed cut. Domain passes: none selected (no changed path matches payments, migrations or dependencies words/patterns; `pnpm-lock.yaml` is named only in the exclusion list, not changed)."
  - "ADR compliance: `adr_status.py` reports 30 ADRs, all `unrecognized` standing (the repo's `status: active` frontmatter is not a word the tool maps). Read ADR-016 (Green-Main Merge-Gating) in full because it is the only one about merge gating; the diff does not touch `CI Gate`, required checks or branch protection, so no violation. The other ADRs are about rialto, services, health checks, auth, edge routing, agents, deployment: out of scope. `docs/standards.json` has 4 statements (pipeline/factory/eval domains); none matches this diff, so no finding cites a slug."
---

# Review: Tier escalation counts only real review surface

## Scope

- #6701 `b8af19905`: `tier-classifier.yml` (+53), new `scripts/tier-escalation.mjs` (205 lines), `docs/change-tiers.md`, `CLAUDE.md`, two test files, `breakdown.md`.
- #7078 `79b02e565`: `Load tier policy from base branch` step, the T4 rule for `scripts/tier-escalation.mjs`, `docs/change-tiers.md` § T4, #6610 fixtures corrected to 1004 counted lines -> T4.
- Plus every file the workflow executes from the PR-head checkout: `scripts/resolve-pr-metadata.mjs` (last touched in #4083, not by this run), and the downstream consumers `scripts/merge-queue-eligibility.mjs`, `auto-merge.yml`, `merge-queue.yml`.
- Branch protection on `main`, read with `gh api repos/.../branches/main/protection`: required contexts `["CI Gate"]`, `required_pull_request_reviews: null`, `enforce_admins: false`. No rulesets.

## Findings

### Major: a PR can run its own code inside the tier classifier and lower its own tier; #7078 closed only one of the paths

The lead from verification.md ("`Resolve PR metadata` still runs PR-head code that feeds the tier") is confirmed, and it is wider than the one script.

**What runs, and when.** `tier-classifier.yml:10-13` triggers on `pull_request` (opened/synchronize/reopened) and `workflow_dispatch`. For every trigger the job does this, in order:

1. `:42-53` checks out the PR head (`ref: github.event.pull_request.head.sha`; on dispatch, `github.ref`, i.e. whatever `--ref` the dispatcher chose), `fetch-depth: 0`.
2. `:55-64` runs `node scripts/resolve-pr-metadata.mjs --pr "$PR_NUMBER" >> "$GITHUB_OUTPUT"` from that checkout, with `GH_TOKEN` (`pull-requests: write`) in the job env (`:37-40`). Its stdout becomes `title`, `body`, `head_sha`, `base_ref`, `is_fork` (`resolve-pr-metadata.mjs:40-49`).
3. `:66-76` uses `steps.pr.outputs.base_ref` for `git merge-base "origin/${PR_BASE_REF}" HEAD` and the `--name-only` / `--numstat` diff. Those two files are the entire input to the path rules and the size rule.
4. `:78-90` does `git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs"`, again from the script's `base_ref`. #7078's "load from base" is only as trusted as that value.
5. `:92-97` feeds `title`, `body`, `is_fork` from the same step into Classify.

**Does a PR that edits `resolve-pr-metadata.mjs` steer the tier? Yes.**

- No path rule matches `scripts/resolve-pr-metadata.mjs`. The T3 rule is `^scripts\/check-` (`:123`); the T4 rules name `tier-escalation.mjs` and three workflows only (`:113-114`). An edit to it falls to the "unmatched paths default to T2" branch (`:168-171`), or to the tier of whatever else the PR changes.
- A PR edit can make it print `base_ref=<the PR's own head branch>`. Reproduced the two `git` steps in a throwaway repo (main = old policy; branch `feat` edits the policy and adds a script; `origin/feat` = `HEAD`):
  ```
  PR_BASE_REF=feat   -> merge-base = HEAD; `git diff --name-only` -> 0 files
                        `git show origin/feat:scripts/tier-escalation.mjs` -> the PR's EDITED policy
  PR_BASE_REF=main   -> 2 files (scripts/resolve-pr-metadata.mjs, scripts/tier-escalation.mjs)
  ```
  So the diff range collapses and the "base" policy is the PR's own edit. This defeats #7078's guarantee (`docs/change-tiers.md:28`: "a PR cannot edit the policy to lower its own tier").
- Steering `base_ref` alone floors at T2: an empty diff takes the `highest === 0 -> T2` default, and `tier:standard` is in `BLOCKED_TIER_LABELS` (`merge-queue-eligibility.mjs:36`), so that variant is still blocked. A lower result needs one more step, and there are two cheap ones:
  - point `base_ref` at a second, attacker-pushed branch that already contains the sensitive commits, with the PR branch adding only a markdown file: the diff is then one `.md` -> T1 -> `tier:trivial`;
  - or skip the steering: the script is arbitrary node code, so it can write `GITHUB_ENV` (e.g. `NODE_OPTIONS=--import ...`) and take over the later Classify step outright, or call `gh pr edit` with the job token. It can also print its own `title`, `body` and `is_fork=false`.
- The same holds one level up and is not fixable by a path rule: on `pull_request` the workflow file used is the one in the PR's merge commit [INFERENCE: standard Actions behaviour], so a PR can edit `tier-classifier.yml` itself, including the T4 rule that is meant to catch the edit. The same is true of `merge-queue-eligibility.mjs`, which `auto-merge.yml:20-` runs from the PR checkout to decide eligibility. The classifier was only ever trustworthy against accidents and against edits to the one file #7078 moved to base.
- `workflow_dispatch` is wider still: the workflow file and the checkout both come from the `--ref` the dispatcher chooses, while `--pr` picks the PR that gets labelled. Whoever can dispatch can stamp any PR with a tier computed by code of their choosing. That needs write access.

**Does anything else catch it? No, not independently.**

- `merge-queue-eligibility.mjs` reads only the `tier:*` label (`:36`, `:154-183`). It never looks at paths or diffs, so a forged `tier:trivial` passes it.
- `auto-merge.yml` and `merge-queue.yml` consume that label. `auto-merge.yml` additionally limits arming to the trusted automation authors list and runs the eligibility script from the PR checkout, so it is the same class. `merge-queue.yml` arms on the `has-pr` label (the implement-queue boundary).
- Branch protection requires only `CI Gate`, with `required_pull_request_reviews: null` and `enforce_admins: false`. `CODEOWNERS` lists `/.github/` and `/scripts/` but no review is required, so it routes notifications and blocks nothing.
- Fork PRs are not a path [INFERENCE]: a fork's `pull_request` token is read-only, so `Apply tier label` fails, no label lands, and the gate fails closed. The path needs a same-repo branch, i.e. write access.

**Severity.** Major, not critical. It is a working way to lower a PR's own tier on the merge gate, which is why it is not minor, and #7078 claims to have closed that class. It is not critical because it needs write access to the repo (a collaborator, a leaked automation PAT, or a prompt-injected agent branch, which is a real actor in this repo), the `has-pr`/trusted-author conditions still apply to the arming workflows, and there is no evidence anyone has used it. I did not inflate it to critical and did not drop it to minor to unblock Ship.

- Locations: `.github/workflows/tier-classifier.yml:42-53, 55-64, 66-76, 78-90, 113-114`; `scripts/resolve-pr-metadata.mjs:57-76` (`base_ref` at `:47`); `scripts/merge-queue-eligibility.mjs:36, 154-183`; `.github/workflows/auto-merge.yml:20-` (PR-checkout script run).
- Proposed handling (a code/config change, so fix-forward PR, not done here; the change itself is T4):
  1. Make the classifier's code a trust boundary, not a path rule: run the gate from the base branch. Either trigger on `pull_request_target` (the repo already does for `dependabot-auto-merge.yml:12`, whose header documents the "never run PR code with a write token" rule) or check the base out into a separate directory and run the resolver, policy and eligibility scripts from there. The PR head is then data only, fetched as `refs/pull/N/head` for the diff.
  2. Do not take `base_ref` from PR-head code. Take it from the event payload (`github.event.pull_request.base.ref`) or from the base-side resolver; on dispatch, pin the workflow ref to the default branch.
  3. Interim, cheap, partial: add T4 path rules for `scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`, `.github/workflows/auto-merge.yml` and `merge-queue.yml` (today the T4 workflow regex names only `codeql|coverage-gate|tier-classifier`, `:113`), and turn on required code-owner review for `/.github/` and `/scripts/` in branch protection. These stop accidental and noisy edits; they do not stop a hostile PR, because the classifier that applies them is still the PR's.
  4. Correct `docs/change-tiers.md:28` and the `tier-classifier.yml:78-84` comment, which currently state a guarantee that does not hold.
- Standard: none
- Decision: **deferred by the Owner (Matt, live, 2026-11-02) to a separate maintenance run, `docs/fixes/tier-gate-pr-head-code`** (a security defect in the gate's trust model; expected `re-entry: architect`). The finding is still open and unfixed. It is not fixed by this run, and it remains a live weakness on `main` until that run ships. With this explicit deferral recorded, the major no longer stops this run's Ship merge (brief, "Review decision 2026-11-02"). It was not fixable inside Review because it needs a code change.

### Minor: `**/generated*` and `**/registry.json` exclusions are nameable, so size escalation can be dodged

- Scenario: `EXCLUDED_MATCHERS` (`tier-escalation.mjs:40`) excludes any path segment starting `generated` (file or directory) at any depth, and `registry.json` anywhere (`:37`). A PR that adds 2,000 hand-written lines as `services/users/src/routes/generated-handlers.ts` counts 0 review-surface lines, so the >1000 bump never fires (T3 -> T4 lost). Same for any `registry.json`. Today's data show no abuse; the exposure is that "generated" is decided by name, not by a generator header or a known output directory. The brief and PRD chose the `**/generated*` glob, so this is a known trade-off narrowed here to a finding because the replay shows the exclusion list is the sole thing standing between "reviewed" and "not counted".
- Standard: none
- Decision: deferred — the Owner chose the list (brief § Decisions, "`**/generated*`"). Revisit with finding 1's fix: anchor to known generator output dirs, or require the file to carry a generated header. Not a blocker.

### Minor: the 25 replay de-escalations are pinned by shape only, and none was hand-checked as a true false-positive

- Scenario: verification.md's fresh replay changed 25 of 300 PRs, all de-escalations (`escalates -> -`) or keyword-only (#7996). Tests pin #6610, #6541 and #6591 by number and the rest by shape (generated-file churn, descriptive keyword prose). If one of the 25 was a true positive (for example a real "rotate the key" PR whose cue the narrower `INCIDENT_CUE` misses: `INCIDENT_CUE` needs `leaked|exposed|compromised|breached|revoked`, `rotate/rotating/rotated + the|our|this|all|its`, `incident report|response|review`, `security incident`), it now lands a tier lower with nothing that would notice. `replayRow` also compares per-rule verdicts only (`pathTier: 0`, `:121-125`), so the table says which rule changed, not the final tier.
- Standard: none
- Decision: deferred — verification.md accepted shape pinning on 2026-10-18 and again now. The natural place to close it is Operate's hand-check of every escalation. Suggest Operate also hand-check the 25 de-escalated PRs (verification.md names #8166, #8148, #7996, #7713 and 21 more).

### Minor: the policy-edit T4 rule has no live run, and by the finding above it protects only against accidental edits

- Scenario: no merged PR has edited `scripts/tier-escalation.mjs` since #7078, so no real `tier-classifier` run has shown T4 from that rule. Coverage is the workflow unit test and verification.md's real-Classify extraction (both pass). #7078's own live-run checkbox (confirm the Load step and `tier:critical` on that PR) was left unchecked in its body, and that PR edited the workflow, so its `tier:critical` came from the workflow rule (`:113`), not the policy rule (`:114`). Beyond that, a hostile PR can bypass the rule through the major finding, so it is best read as an accident guard.
- Standard: none
- Decision: deferred — cannot be exercised without a real policy edit; the next legitimate edit to `tier-escalation.mjs` should be checked live. No action now.

### Minor: T4 coverage of merge-gate files is partial and overclaimed in docs

- Scenario: `docs/change-tiers.md:28` and the workflow comment (`:78-84`) say a PR "cannot edit the policy to lower its own tier". Only the module is moved to base. A reader trusting that sentence would not know `resolve-pr-metadata.mjs`, `merge-queue-eligibility.mjs`, `auto-merge.yml` and `merge-queue.yml` still execute from the PR and carry no T4 rule. This is the decayed contract; the code handling is in the major finding (item 3 and 4).
- Standard: none
- Decision: deferred — folds into the fix-forward for the major finding. Not worth a separate PR.

## Passes with no findings

- **Correctness:** clean apart from the above. Checked: size rule (`counted > 1000 && highestTier < T4`, `:55-64`), hard-set vs bump keyword paths and the `pathTier >= T3` snapshot taken before keyword rules (`workflow:176`), `toCount` clamps NaN/negative (binary files give `-` in numstat -> 0). `git diff --numstat` rename entries (`src/{a => b}/f`) match no exclusion, so they over-count, which errs toward escalating. `reasons=` is written to `GITHUB_OUTPUT` as one line (`workflow:288`); a filename with a newline cannot inject output lines because `git diff --name-only` quotes it (`"apps/a/src/x\nlabel=tier:trivial.ts"`, checked locally). That depends on git's quoting rather than on an explicit heredoc, so it is worth hardening in the same fix-forward but is not a finding.
- **Design:** matches architecture.md's module/adapter/replay split and the `merge-queue-eligibility.mjs` pure-decision precedent. The only gap is the trust boundary above (architecture.md has no threat model for PR-head code; recorded in the major finding). No ADR owed: loading the policy from base is easy to reverse and obvious on first read, so it fails the protocol's ADR test, and architecture.md's "ADRs: none" stands. The T4 "ADR or meta-improvement issue" rule in `docs/change-tiers.md` was not applied to #6701/#7078 (both `tier:critical`, merged by the Owner, no ADR reference in either body); the Owner is the T4 approver, so I did not file it as a finding.
- **Security (other than the above):** no secrets in the diff; Classify takes `title`/`body`/`is_fork` through `env:` (no `${{ }}` in `run:` bodies for untrusted text); `git show "origin/${PR_BASE_REF}:..."` is quoted and `PR_BASE_REF` arrives via env, so no shell injection; GITHUB_OUTPUT heredoc uses a random delimiter (`resolve-pr-metadata.mjs:41-45, 74`). Errors in the module throw and fail the step, so a broken policy fails closed (verification.md: 6 pre-#7078 `ERR_MODULE_NOT_FOUND` failures, 0 since).
- **Complexity:** no `lean:` markers added; no confirmed cut. The replay CLI is in the PRD's scope.
- **ADR compliance:** no violation (ADR-016 read; see assumptions).
- **Domain passes:** none selected.

## Verdict

**Ready to ship the merge, with one MAJOR deferred by the Owner (2026-11-02). It is still open and unfixed.**

- Critical findings: none.
- Major findings: **1, unfixed, deferred by the Owner** (PR-head code can steer the tier; not fixed by #7078, not fixed in this run). On 2026-11-02 Matt chose to defer it to the maintenance run `docs/fixes/tier-gate-pr-head-code` (brief, "Review decision 2026-11-02"). With the deferral recorded, it no longer stops this run's Ship merge.
- Minor findings: 4, all deferred with reasons above.
- The feature's stated purpose (fewer false-positive escalations) is met and verified. The open item is the gate's trust model, which predates #6701 in the workflow file but which #7078 explicitly set out to close.
