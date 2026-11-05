---
stage: operate
run: feature:dependabot-auto-merge
date: 2026-11-04
users-observed: 1
signal-source: "GitHub merge and auto-merge records read with gh on 2026-11-03: the 15 Dependabot PRs created after #6680 merged (2026-10-15T05:52:32Z), each one's mergedBy, autoMergeRequest.enabledBy and dependabot-auto-merge.yml run log. The 1 is Matt (mattbutlerengineering), the only human merge path. His merge record shows 8 of those PRs merged by hand and 6 merged by app/github-actions after the workflow armed them. No statement from him about the change was found."
assumptions:
  - "Population count: users-observed counts people, not PRs. The one human whose manual merge work the change altered is Matt. The 15 PRs and the 14 merged are the sample behind the outcomes, not the count. The brief supplies no count and says 0 is valid; 1 is taken because his merge actions changed on 6 of 14 merged PRs, which is observed work, not observed opinion."
  - "In-policy set for the p90 is the stage instruction's: official `actions/*` or `github/*` patch/minor, or `@types/*` patch/minor. The shipped policy also merges `dev-deps` patch/minor (a branch that predates #6680). Three dev-deps PRs auto-merged, and the retro reports them separately instead of folding them into the p90."
  - "Window counting: the brief's `created:>2026-10-15` search is exclusive of the whole day, so it missed #6685 (created 2026-10-15T05:58:46Z, after the merge). The retro counts by timestamp, giving 15 PRs, not 14."
---

# Retro: auto-merge official-action and @types Dependabot bumps (#6650 via #6680)

## Minimum signal

Met on the count: **15** Dependabot PRs were created after 2026-10-15T05:52:32Z
(`gh pr list --state all --author app/dependabot --search "created:>=2026-10-15"`,
filtered on `createdAt > 2026-10-15T05:52:32Z`): 14 merged, 1 closed
unmerged (#8148, superseded by #8166, never armed). The in-policy sample is
thin: **3 PRs**. Nothing was fabricated to fill it.

Each decision below is the `{"action": ...}` line in that PR's
`dependabot-auto-merge.yml` run log (`gh run view <id> --log`). Armed is
`autoMergeRequest.enabledBy` from `gh pr view`.

| PR    | Created (UTC) | Merged (UTC)     | Open→merge h | In-policy                                                             | Workflow decision        | Armed (by)                                   | Merged by             |
| ----- | ------------- | ---------------- | -----------: | --------------------------------------------------------------------- | ------------------------ | -------------------------------------------- | --------------------- |
| #6685 | 10-15 05:58   | 10-15 11:17      |         5.31 | no (production-deps)                                                  | manual (run 38689740212) | no                                           | mattbutlerengineering |
| #7140 | 10-19 17:18   | 10-19 17:23      |     **0.07** | **yes** (official-actions, `github/codeql-action/upload-sarif` minor) | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #7142 | 10-19 17:57   | 10-19 21:36      |         3.66 | no (production-deps)                                                  | manual (major)           | no                                           | mattbutlerengineering |
| #7143 | 10-19 18:00   | 10-19 18:58      |         0.97 | no (dev-deps)                                                         | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #7144 | 10-19 18:01   | 10-19 18:46      |         0.77 | no (ungrouped `@playwright/test`)                                     | manual                   | no                                           | mattbutlerengineering |
| #7710 | 10-26 17:19   | 10-26 17:53      |     **0.56** | **yes** (official-actions, `upload-sarif` patch)                      | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #7711 | 10-26 17:19   | 10-26 17:57      |         0.63 | no (third-party `rharkor/caching-for-turbo`)                          | manual                   | no                                           | mattbutlerengineering |
| #7713 | 10-26 17:54   | 10-26 18:51      |         0.96 | no (production-deps)                                                  | manual (major)           | no                                           | mattbutlerengineering |
| #7714 | 10-26 17:55   | 10-26 18:19      |         0.39 | no (dev-deps)                                                         | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #8001 | 10-31 19:33   | 11-02 03:30      |        31.96 | no (`glob` major, tools/cli)                                          | manual (major)           | yes (**mattbutlerengineering**, 11-02 03:00) | mattbutlerengineering |
| #8002 | 10-31 19:34   | 11-02 03:12      |        31.64 | no (`glob` major)                                                     | manual (major)           | no                                           | mattbutlerengineering |
| #8148 | 11-02 17:50   | closed, unmerged |            — | no (production-deps)                                                  | manual                   | no                                           | —                     |
| #8149 | 11-02 17:50   | 11-02 18:06      |     **0.26** | **yes** (types, `@types/node` patch)                                  | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #8150 | 11-02 17:53   | 11-02 18:26      |         0.54 | no (dev-deps)                                                         | merge                    | yes (app/github-actions)                     | app/github-actions    |
| #8166 | 11-02 21:04   | 11-03 03:25      |         6.35 | no (production-deps)                                                  | manual                   | no                                           | mattbutlerengineering |

**In-policy p90 open→merge: 0.50 h** (n=3: 0.07, 0.26, 0.56 h; linear
interpolation, median 0.26 h ≈ 16 min). The 2026-10-14 baseline, cited from
#6650, was p90 ≈ 24 h and median ≈ 33 min over 30 merged PRs of all kinds.
All three in-policy PRs auto-merged. Each was armed 16 s to 2 min 38 s after
it opened and merged by `app/github-actions` with no human touch. With n=3 the
p90 is the slowest PR, not a distribution.

For context, the same window is not faster overall. The 14 merged PRs have a
p90 of 24.05 h and a median of 0.86 h. That tail is the two `glob` major
bumps (#8001, #8002, ~32 h), which the policy keeps manual forever. The 8
manual PRs have a median of 4.48 h.

**Out-of-policy auto-merges: none the shipped policy calls manual.** Of the 6
PRs the bot merged, 3 were in-policy. The other 3 were `dev-deps`
patch/minor: **#7143, #7714 and #8150**. They are outside the stage
instruction's in-policy set (actions and `@types/*`) and outside what the
Owner's 2026-10-14 decision names, but each ran the shipped policy's
`dev-deps` branch, which keeps the pre-#6680 behaviour (`review.md` m1,
`verification.md` C1). No third-party action, production dep or major
was armed by the bot. #8001, a major, was armed by Matt by hand.
**This is the critical question for the Owner, not a bypass:** whether
`dev-deps` auto-merge is intended. #8150 and #7143 included `eslint` and
`playwright` minors. Seeded.

## Outcomes vs. intent

### Success sentence (idea.md): an official-action or `@types/*` patch/minor PR merges on green CI with no human touch

- What happened: 3 of 3 in-policy PRs did (#7140 and #7710 official-actions,
  #8149 types), armed by the workflow and merged by `app/github-actions`.
  The decision lines are `{"action":"merge","reason":"Official (actions/*, github/*) GitHub Action patch/minor update."}`
  twice and `{"action":"merge","reason":"@types/* patch/minor update."}` once.
  The only official action seen was `github/codeql-action/upload-sarif`;
  `actions/*` itself and several-package group PRs have not appeared.
- Signal strength: **pattern** (3 PRs on 3 different Mondays, 2026-10-19,
  10-26 and 11-02), thin. It is not yet `measured` for the range of
  packages.

### …while third-party actions, production npm deps and semver-major bumps still wait for Matt

- What happened: 9 PRs in those classes (#6685, #7142, #7711, #7713, #8002,
  #8148, #8166, #8001, and #7144 ungrouped) got a `manual` decision, none was
  armed by the bot. Matt merged all but #8148, which closed unmerged. #8001 shows the manual path from the
  other side: he armed it himself.
- Signal strength: **pattern** (9 of 9 decisions read from run logs).

### PRD success criterion: in-policy p90 open→merge beats the ~24 h baseline (C9, Operate's minimum signal)

- What happened: p90 0.50 h, median 0.26 h, n=3, against ~24 h and ~33 min.
  The effect is real and large on those 3, but the sample cannot distinguish a
  p90 from a maximum.
- Signal strength: **measured**, n=3 (anecdote-sized for a percentile).

### PRD success criteria: unit tests, `pnpm repo-audit`, lint and typecheck

- What happened: not re-run here. `verification.md` records 8 PASS, 0 FAIL, 1
  NOT SHOWN (C9, now answered above) at `ef94849d2`. The live path also
  confirms the R1 grouping: Dependabot opened PRs in the `official-actions`
  and `types` groups.
- Signal strength: **measured** at Verify, cited, not re-measured.

### Cost found live: merges the bot completes fire no `push` workflows (review M2)

- What happened: the merge commits of #7140 (`46de8a748`) and #8149
  (`fcd6bf400`) have no `event: push` workflow run. The `head_sha` listings
  show only `Auto-Merge Policy` `check_suite`, `claude` `issue_comment`,
  `Push on main` `dynamic` and Dependabot runs, as M2 predicted. Only these two
  were checked, not all 6 bot merges.
- Signal strength: **anecdote** (2 commits, both in-policy).

## Open debt

The run's own debt. It is never feedback and counts toward nothing above.

- **M1 — armed auto-merge is never revoked (security major; review.md, Owner
  decision 2026-10-18 "Fix now + m4").** **The fix did not land.** PR **#7087**
  (`fix(ci): disarm Dependabot auto-merge when a non-Dependabot commit lands;
gate on PR author`, created 2026-10-18T22:47:53Z) is `CLOSED`, `mergedAt:
null`, closed 2026-10-18T23:45:04Z by `mattbutlerengineering`, one second
  after #7088 merged. Its event list shows `labeled` and `closed` only. There
  is no closing comment, so the reason is not recorded. `gh pr list --state all
--search "disable-auto dependabot"` finds no other fix PR. On `origin/main`
  at `30a28963f`, `.github/workflows/dependabot-auto-merge.yml` still has no
  `disable-auto`, `synchronize` or `pull_request.user.login`, and its last
  commit is `3e336927a`. M1 and m4 are therefore both **open, with no fix in
  flight**. Re-landing it is the first seed.
- **M2 — `GITHUB_TOKEN` merges fire no `push` workflows (design major;
  Owner: "Defer to seed").** Deferred, still open, seeded. Seen live (above).
  It needs an Owner-minted secret (`docs/SECRETS.md`).
- **m1** (dev-deps branch has no per-name check), **m2** (lint plugins fall
  into production-deps and are called "production dependencies"; #7144, a
  `@playwright/test` bump, got that same wording live), **m3** (typeless
  group member drops out of the highest-bump check): deferred at Review,
  seeded.
- **m4** (actor-only gate): the Owner folded it into the M1 fix. That PR is
  closed, so it is seeded inside the M1 seed.
- **#7087** is itself the run's own debt: it cites this run's review and was
  created before this retro.

## Run retrospective

- Keep: the pure `decideDependabotMerge()` plus a CLI the workflow calls. Every
  live decision is a single JSON line in the run log, and every
  decision log read for this retro matched what the policy says it should be. The Verify
  and Ship record that named "pending evidence" up front made this retro's
  question concrete: Operate had a defined p90 test to run, not a vague
  "how is it landing".
- Keep: Review ranking M1 and M2 as majors with a mechanism and an observed
  case (#6577). The same mechanism is why the unfixed M1 matters now that 6
  PRs have been armed.
- Change: a fix the Owner decides "now" but ships outside the run needs a
  tracked owner and a state check. `release.md` says "fix PR open, awaiting
  the Owner's merge: #7087". The PR then closed unmerged and nothing in the
  pipeline noticed until Operate. Use an issue, or keep the item in the
  `pending-merge:` form so the soft gate catches it.
- Change: the resume instruction's count used a day-exclusive search and
  missed #6685. Count by timestamp.
- Stop: nothing here was wasted ceremony. Verify's C9 `NOT SHOWN` was the right
  call, not a stretch; Operate's minimum signal answered it.

## Environment

| Mistake                                                                                                                            | Evidence                                                            | Class      | Proposed carrier                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Armed auto-merge is never revoked, so a later foreign push merges unreviewed. The fix PR closed unmerged.                          | `review.md` §Major M1; this retro §Open debt (#7087)                | mechanical | The existing `scripts/__tests__/dependabot-auto-merge-workflow.test.mjs`, asserting that the workflow has a `--disable-auto` path and a `pull_request.user.login` gate. It runs with the `scripts` suite, which Verify ran 5666/5666.              |
| `GITHUB_TOKEN` merges skip `push` workflows. `gotchas § CI` already carried this as prose and the design still shipped it.         | `review.md` §Major M2; this retro §Outcomes (#7140, #8149)          | mechanical | The existing `pnpm repo-audit` workflow guards: flag a workflow that arms `gh pr merge --auto` with `secrets.GITHUB_TOKEN`, or require a recorded exception. A prose rule is what the mistake already slipped past.                                |
| `dev-deps` merges on the group name alone, unlike the two new groups. Three bot merges used it, outside the Owner's named policy.  | `review.md` §Minor m1; this retro §Minimum signal                   | mechanical | The existing `scripts/__tests__/dependabot-auto-merge-policy.test.mjs`, adding a case that reads `dependabot.yml`'s `dev-deps` patterns and checks the policy against them. The unit test labelled "existing behavior preserved" locks the gap in. |
| Scoped lint tooling lands in `production-deps` and is called a production dependency.                                              | `review.md` §Minor m2; `verification.md` §Observations (#6685)      | mechanical | The same policy test: parse `dependabot.yml` and fail when `@eslint/*`, `@eslint-react/*` or `typescript-eslint` match no `dev-deps` pattern.                                                                                                      |
| A typeless group member can drop out of the highest-bump check.                                                                    | `review.md` §Minor m3                                               | mechanical | `dependabot-auto-merge-workflow.test.mjs`, asserting the workflow decides on `updated-dependencies-json`.                                                                                                                                          |
| An Owner-decided fix lived only as a PR number in `release.md`. It closed with no record and nothing re-checked it before Operate. | `release.md` §Open known defects (M1 status); this retro §Open debt | judgement  | A `docs/standards.json` statement: an Owner-decided security fix gets an issue, not only a PR link in `release.md`. The pipeline's own `pending-merge:` form (Ship's `outcome: prepared`) is the existing pointer.                                 |

## Idea seeds

Appended to `docs/backlog.md`, one line each:

- Re-land the Dependabot auto-merge disarm fix (M1 + m4): #7087 closed
  unmerged and `main` is unchanged.
- Arm Dependabot auto-merge with a GitHub App or PAT token so merges fire
  `main`'s push workflows (M2; observed live on #8149 and #7140).
- Per-name prefix check for the `dev-deps` branch (m1).
- Route scoped lint tooling out of `production-deps`, fix the wording (m2).
- Decide on `fetch-metadata`'s `updated-dependencies-json` and reject typeless
  entries (m3).
- Decide and record whether `dev-deps` auto-merge is intended policy (#7143,
  #7714, #8150).
- Re-measure the in-policy p90 at n≥10 and commit the measuring command.

## Run complete

Closed 2026-11-04. Operate's minimum signal was met on the count (15 PRs) and
the p90 is measured on a thin in-policy sample (n=3, 0.50 h vs ~24 h). The
bet, "in-policy PRs merge with no human touch", is supported by a pattern. It
is not proven for `actions/*` or for grouped PRs. One security major (M1) is
open with no fix in flight, which is the main thing to act on. The seeds above
are the input to the next Idea-stage run.
