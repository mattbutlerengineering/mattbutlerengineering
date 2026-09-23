---
stage: capture
run: maintenance:key-gated-workflows-visible-skip
date: 2026-09-23
re-entry: implement
origin: "GitHub issue #3585 (Option C: anything that cannot run must fail loudly) — tracker seed, NOT an intake issue: this run implements Option C only and does not close #3585"
in-flight-check: "ran 2026-09-23 (autorun brief) and re-run at capture with `gh pr list --state open`: #5703 (acmm daily audit) and #5699 (spend sensor, metrics-collectors.yml) — neither touches claude.yml, scheduled-issue-completion.yml or docs-audit.yml. Nothing matches; proceed."
assumptions:
  - "claude.yml posts one short comment when it skips for a missing credential (e.g. 'skipped: no agent credential in CI (#3585)'), so the collaborator who typed @claude gets an answer. Taken from the autorun brief's recommended default for its declared open design gap."
  - "That skip comment is posted only for an authorized collaborator (the existing admin/maintain/write check), never for an arbitrary commenter — otherwise any @claude mention from anyone would make the bot reply. The brief is silent on this; chosen because it keeps today's authorization boundary and avoids a public reply surface."
  - "The in-step authorization guard in claude.yml (`exit 0` for a non-collaborator) is fixed in the same run, by moving it into the preflight job's outputs. The brief did not name it, but its success criterion ('no step reaches exit 0 after deciding not to run') and its test criterion both cover it, and making the CLI resolvable in this run is what would turn that guard's bypass from inert into live."
  - "re-entry: implement — the brief expects it and the pattern already exists in docs-audit.yml (#5458); no design decision remains beyond the two logged above."
  - "#3585 is recorded as `origin`, not `intake:` — `intake:` issues close at Ship, and the brief says this run must not close #3585."
---

# Condition: key-gated agent workflows report SUCCESS (or misleading comments) when they cannot run

## Condition

CI is keyless **by design** (#3585 decided Option A on 2026-09-22: agent runs
happen locally via `mbe agent run --adapter claude-cli`; no
`ANTHROPIC_API_KEY`, no `CLAUDE_CODE_OAUTH_TOKEN`). Two workflows still depend
on that credential and hide its absence:

1. **`scheduled-issue-completion.yml`** — decides "no key" _inside_ the
   `Run agent` step, warns, and `exit 0`s. The job and every step report
   **success** twice a day while doing nothing.
2. **`claude.yml`** — has no credential gate at all. On an authorized
   `@claude` comment it posts "Working on it", then calls
   `pnpm exec mbe agent run …`, which can never resolve (the `@mbe/cli` bin is
   never linked, and the job never builds the CLI), then posts
   "Agent run finished: failure" — while the step itself does not `exit 1`, so
   the job still reports success. Separately, its authorization step
   `exit 0`s for a non-collaborator, which ends only that step: every later
   step (acknowledge comment, agent run, outcome comment) still runs.

**Target state (ends the run):** with no credential, the agent job in both
workflows is **SKIPPED** at job level (a `preflight` job exports `has_key`, the
agent job carries `if: needs.preflight.outputs.has_key == 'true'`), the run
summary says why, and no step reaches `exit 0` after deciding not to run. With a
credential present, behaviour is unchanged except that `claude.yml` builds the
CLI and invokes `node tools/cli/dist/index.js`. Structural tests fail if either
workflow regains an in-step skip or loses the job-level gate. Reference
pattern: `docs-audit.yml` after #5458.

## Reproduction / Evidence

All measured 2026-09-23 against the worktree at `198563827` (origin/main).

**`scheduled-issue-completion.yml`** — lines 179-192:

```yaml
      - name: Run agent
        id: agent
        ...
        run: |
          # The agent needs an LLM provider key. If none is configured, skip
          # gracefully (do NOT fail the scheduled run / redden main) — the
          # routine activates automatically once the secret is set.
          if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
            echo "::warning::ANTHROPIC_API_KEY is not configured — skipping the agent run. ..."
            echo "outcome=skipped" >> "$GITHUB_OUTPUT"
            exit 0
          fi
```

Real run, `gh run view 35685360619` (schedule, 2026-09-22T04:02:34Z):

```
ready=0 promotable=12 resolved-mode=promote
##[warning]ANTHROPIC_API_KEY is not configured — skipping the agent run. Set it (...) to activate the routine.
```

and its jobs JSON: job `Advance the issue queue` → `conclusion: success`, step
`Run agent` → `conclusion: success`. `gh run list --workflow
scheduled-issue-completion.yml --limit 60` → `{"success":60}`, oldest
2026-08-23T12:45:53Z: sixty consecutive "successes". `gh secret list` shows no
`ANTHROPIC`/`CLAUDE` secret.

**`claude.yml`** — lines 47-54 (authorization) and 80-98 (acknowledge, run, report):

```yaml
      - name: Verify the author is authorized
        run: |
          role=$(gh api ".../collaborators/$COMMENT_AUTHOR/permission" --jq '.permission' 2>/dev/null || echo "none")
          case "$role" in
            admin|maintain|write) echo "Authorized ($role)";;
            *) echo "Author $COMMENT_AUTHOR not a collaborator (role: $role); ignoring."; exit 0;;
          esac
...
      - name: Acknowledge
        run: |
          gh issue comment "$ISSUE_OR_PR_NUMBER" --body "Working on it. Run: ..."

      - name: Run agent
        id: agent
        run: |
          if pnpm exec mbe agent run "$(cat /tmp/agent-task.txt)" --max-budget 1.50 --adapter auto; then
            echo "outcome=success" >> "$GITHUB_OUTPUT"
          else
            echo "outcome=failure" >> "$GITHUB_OUTPUT"
          fi

      - name: Report outcome
        if: always()
        ...
          gh issue comment "$ISSUE_OR_PR_NUMBER" --body "Agent run finished: $OUTCOME. ..."
```

No `Build CLI` step exists in the job. Local reproduction in the worktree (deps
installed): `pnpm exec mbe --version` → `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
Command "mbe" not found`; `node_modules/.bin/mbe` does not exist. Matches
gotchas § Build ("`claude.yml`'s `pnpm exec mbe agent run` step shares this
bug"). `gh run list --workflow claude.yml --limit 200` → `{"skipped":200}`:
every one of the last 200 runs was a comment without `@claude` (job-level `if:`
false), so the agent path has not executed in that window — the defect is
reproduced from the file and the local CLI probe, not from a run log.

**Reference pattern** — `docs-audit.yml` lines 56-81 (`preflight` job with
`outputs: has_key`, writes `has_key=true|false` and a `$GITHUB_STEP_SUMMARY`
note naming #3585) and line 222-227 (`semantic:` job, `needs: preflight`,
`if: github.event.inputs.skip_agent != 'true' && needs.preflight.outputs.has_key == 'true'`),
pinned by `scripts/__tests__/docs-audit-workflow.test.mjs`.

## Root-cause hypothesis

_Hypothesis:_ both workflows were written expecting the credential to arrive
("the routine activates automatically once the secret is set"), so "no key"
was treated as a transient state to tolerate in-step rather than a steady
state to report. #3585's Option A made keylessness permanent, which turns the
tolerant `exit 0` into a permanent false success. `claude.yml` predates the
gotchas finding about the unlinked `mbe` bin and was never exercised on its
agent path (no key), so the broken invocation was never observed in CI.

## Blast radius

- **Who:** Matt and every automated reader of run conclusions (run lists, the
  scheduled-workflow-health sensor, progress/learning loops). No end users;
  no production surface.
- **How badly:** `scheduled-issue-completion.yml` has reported 60 consecutive
  successes (since at least 2026-08-23) for a routine that never ran — the
  same silent-success class #5458 fixed in docs-audit. `claude.yml` would give
  an authorized `@claude` caller "Working on it" followed by a bare "failure"
  with no reason, and lets a non-collaborator's mention run the acknowledge /
  agent / report steps (inert today only because the agent step cannot start;
  it becomes live the moment this run makes the CLI resolvable, hence it is in
  scope).
- **Since when:** the scheduled in-step guard since that workflow was added;
  permanent since #3585's 2026-09-22 decision.
- **Scale:** two workflow files plus their structural tests; `.github/` changes
  carry `tier:sensitive` / human review.

## Ruled out

- **Adding a secret / making CI keyed** — out: #3585 decided CI stays keyless.
- **Retiring the workflows, or failing them red** — rejected in the brief in
  favour of the visible skip.
- **Changing the `--adapter auto` cascade or the default adapter** — out
  (ADR-017, #3585's remaining question).
- **`docs-audit.yml`** — already fixed by #5458; reference only.
- **`metrics-collectors.yml`** — owned by open PR #5699; not touched.
- **Run-level conclusion turning SKIPPED** — not achievable with this pattern
  and not the target: the `preflight` job succeeds, so the _run_ still
  concludes `success`; the _agent job_ is what shows SKIPPED (same as
  docs-audit). This also means the scheduled-workflow-health sensor sees no
  new failures.

## Work items

Ordered, test-first. Gates for every item: `pnpm exec vitest run --config
scripts/vitest.config.mjs` (from the worktree root), `actionlint` on the
touched workflow (installed at `/opt/homebrew/bin/actionlint`), prettier.

- [x] **RED: structural test for scheduled-issue-completion** — add `scripts/__tests__/scheduled-issue-completion-workflow.test.mjs` mirroring `docs-audit-workflow.test.mjs` (same `jobBlock()` text helper). Assert: a `preflight` job declares `outputs: has_key`, maps `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`, writes both `has_key=true` and `has_key=false`, writes `$GITHUB_STEP_SUMMARY` naming `#3585`; the `routine` job has `needs: preflight` and `if: needs.preflight.outputs.has_key == 'true'`; the `routine` job contains neither `ANTHROPIC_API_KEY is not configured` nor `exit 0` nor `outcome=skipped`; the agent step still invokes `node tools/cli/dist/index.js agent run`. (tracker: #3585)
  - Accept: the new test runs and fails against the current workflow, for the missing preflight gate and the in-step `exit 0`.
- [x] **GREEN: gate scheduled-issue-completion at job level** — add the `preflight` job (copied from docs-audit, `set -euo pipefail`, summary text saying the routine did not run and pointing at #3585), make `routine` `needs: preflight` with the job-level `if:`, delete the in-step key check / `outcome=skipped` / `exit 0`, and keep the `routine` job's `ANTHROPIC_API_KEY` env (the agent run needs it when a key exists). Update the header comment (lines 12-14 claim it mirrors `claude.yml`'s `pnpm exec mbe agent run`) to describe the preflight gate and the `node tools/cli/dist/index.js` invocation. (tracker: #3585)
  - Accept: new test passes; `actionlint .github/workflows/scheduled-issue-completion.yml` clean; with-key path (mode → prompt → agent → summary) unchanged apart from job placement.
- [x] **RED: structural test for claude.yml** — add `scripts/__tests__/claude-workflow.test.mjs`. Assert: a `preflight` job carries the `@claude` mention `if:` and the collaborator check, and exports `has_key` and `authorized` outputs; the `dispatch` job has `needs: preflight` and an `if:` requiring both `needs.preflight.outputs.authorized == 'true'` and `needs.preflight.outputs.has_key == 'true'`; `dispatch` contains no `exit 0` and no `pnpm exec mbe`; `dispatch` has a `pnpm build --filter @mbe/cli...` step before a `node tools/cli/dist/index.js agent run` step; the skip comment exists only in `preflight`, is conditioned on authorized-and-no-key, and names `#3585`; the agent step records `outcome=failure` **and** fails the step (`exit 1`) so a failed agent run is not a green job. (tracker: #3585)
  - Accept: the new test runs and fails against the current workflow on each of: no preflight, in-step `exit 0`, `pnpm exec mbe`, missing CLI build, failure not failing the step.
- [x] **GREEN: gate claude.yml at job level and fix its CLI invocation** — move the mention `if:` and the authorization check into a `preflight` job (authorization writes `authorized=true|false` to `$GITHUB_OUTPUT` instead of `exit 0`; credential check writes `has_key` and a `$GITHUB_STEP_SUMMARY` note); when authorized and keyless, `preflight` posts one short comment ("skipped: no agent credential in CI (#3585)" plus the run link — see assumptions); `dispatch` gets `needs: preflight` + the combined job-level `if:`, a `Build CLI` step (`pnpm build --filter @mbe/cli...`) after install, and `node tools/cli/dist/index.js agent run … --max-budget 1.50 --adapter auto`; keep untrusted comment text flowing through env vars only (never interpolated into `run:`). (tracker: #3585)
  - Accept: new test passes; `actionlint .github/workflows/claude.yml` clean; a keyless authorized `@claude` yields `preflight` success + `dispatch` SKIPPED + one skip comment, and a non-collaborator yields `dispatch` SKIPPED with no comment.
- [ ] **Docs: correct statements this run makes false** — `.claude/rules/gotchas.md` § Build line 32 ends "`claude.yml`'s `pnpm exec mbe agent run` step shares this bug" — rewrite to past tense citing this run. Grep `docs/`, `.claude/`, `AGENTS.md`, `CLAUDE.md` for other claims about these two workflows' skip behaviour (at capture time only `docs/acmm/SKELETON-AUDIT.md:24` and `docs/ai-tooling-audit.md:115,181` mention `claude.yml`; neither describes skip behaviour — leave them unless the grep finds a real false claim). (tracker: #3585)
  - Accept: no doc in the repo describes either workflow as skipping in-step or as using `pnpm exec mbe`; prettier clean on touched markdown.
- [ ] **Full gate pass** — run the scripts vitest suite, `actionlint` on both workflows, and prettier on all touched files; leave CI Gate on the PR to Ship.
  - Accept: all green locally; no file outside the two workflows, two new tests, gotchas.md and this run dir is modified (ignore unrelated prettier-hook reflow; never `git add -A`).

## Notes

- Verify cannot run the with-key path (CI has no key by design); evidence there
  is structural (tests + actionlint) plus, if Verify chooses, one
  `workflow_dispatch` of `scheduled-issue-completion.yml` on the branch showing
  `preflight` success and `routine` SKIPPED. `claude.yml` cannot be dispatched
  from a branch (comment-triggered, runs from the default branch), so its
  live proof is post-merge only — Ship/Operate should record that.
- Release authorization per brief: prepare-and-stop (branch + PR, no merge,
  no auto-merge).
