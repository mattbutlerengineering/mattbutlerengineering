# Autorun brief — key-gated-workflows-visible-skip

Collected 2026-09-23 from Matt (structured questions) + measurements against `origin/main`. Autorun-driven maintenance run. Not a pipeline artifact.

## Run

- **Kind:** maintenance run, slug `key-gated-workflows-visible-skip`, dir `docs/fixes/key-gated-workflows-visible-skip/`.
- **Entry:** capture (`defect.md`). Condition brief, not a regression.
- **Tracker:** seed from GitHub issues. Seed: **#3585** (Option C: "anything that cannot run must fail loudly"). The run implements Option C only; it does not close #3585, which still holds the separate question of whether claude-cli becomes the default adapter. Reference the issue in work items. Related context, not seeds: #5458 (docs-audit fix, the pattern to copy), #5627/#5699 (spend sensor), #4199 (eval).
- **In-flight guard:** ran 2026-09-23. Open PRs: #5703 (acmm daily audit, unrelated) and #5699 (spend sensor; touches metrics-collectors.yml, not these workflows). Nothing matches.

## Decided context

- #3585 was decided 2026-09-22 as **Option A, local-only**: agent runs use `mbe agent run --adapter claude-cli` locally. CI stays keyless **by design**. No `ANTHROPIC_API_KEY` secret and no CLAUDE_CODE_OAUTH_TOKEN.
- **Option C direction chosen: visible skip.** Copy the pattern `docs-audit.yml` adopted in #5458: a `preflight` job exports `has_key`, and the agent job carries `if: needs.preflight.outputs.has_key == 'true'`, so without a key the job shows **SKIPPED**, never SUCCESS. Rejected: retiring the workflows, and failing them red.

## Condition (measured on origin/main, 2026-09-23)

1. `.github/workflows/scheduled-issue-completion.yml` (cron `0 0,12 * * *` + dispatch): its agent step checks `ANTHROPIC_API_KEY` inside the step, logs `::warning::`, sets `outcome=skipped`, and does `exit 0`. The job reports success twice a day while doing nothing. Last measured example: run 35520441287 (2026-09-20).
2. `.github/workflows/claude.yml` (`@claude` comment trigger): it has no key gate and runs `pnpm exec mbe agent run ... --adapter auto`. `pnpm exec mbe` can never resolve (gotchas § Build: the @mbe/cli bin is never linked). It also never builds the CLI. The fix is `pnpm build --filter @mbe/cli...` plus `node tools/cli/dist/index.js`, the same as scheduled-issue-completion. Without a key it should visibly skip and not post misleading "Working on it" / "finished: failure" comments. Whether to post a short "skipped: no agent credential in CI (#3585)" comment instead is **an open design gap for the capture/implement stage**. Recommended default: yes, post one short comment so the human who typed @claude is not left without an answer. Log it as an assumption.
3. `docs-audit.yml`: already fixed (#5458). Out of scope except as the reference pattern.

## Scope

- **In:** the two workflows above; tests that pin the behaviour (repo convention: `scripts/__tests__/*workflow*.test.mjs` reads the workflow YAML and asserts its structure, e.g. `metrics-collectors-workflow.test.mjs`, and there is likely a docs-audit one to mirror); doc/gotchas lines that describe these workflows' skip behaviour, if any become false.
- **Out:** changing the default adapter or the `auto` cascade (ADR-017); adding any secret; `metrics-collectors.yml` (PR #5699); `mbe agent eval` / #4199; deleting any workflow.

## Success criteria

- With no key, the agent job in both workflows is **SKIPPED** (job-level `if:` on a preflight output). No step reaches `exit 0` after deciding not to run.
- With a key present, behaviour is unchanged apart from claude.yml's CLI invocation now being resolvable.
- A test fails if an agent step regains an in-step `exit 0` skip or loses the preflight gate.
- Repo gates green: scripts vitest (`pnpm exec vitest run --config scripts/vitest.config.mjs`), prettier, `actionlint` if available, CI Gate on the PR.

## Constraints

- Re-entry depth: **implement** is expected (scoped, pattern already exists). Capture decides and records it.
- GH Actions default shell has no pipefail; `status` is reserved in zsh (not relevant in bash workflows, but don't name variables `status` in local probes).
- Worktree: `/Users/mbutler/github/mbe-keygate`, branch `fix/key-gated-workflows-visible-skip`, based on origin/main. `pnpm install --frozen-lockfile` before running tests. Never `git add -A` (the PostToolUse prettier hook dirties the tree).
- Workflow files under `.github/` carry `tier:sensitive`/human review. That's fine: we stop at prepare anyway.

## Release authorization

**Prepare-and-stop.** Ship may commit, push the branch and open a PR (repo's normal flow). It must not merge, deploy, tag, or arm auto-merge. release.md records the exact merge steps.
