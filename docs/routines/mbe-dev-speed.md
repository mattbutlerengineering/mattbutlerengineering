---
trigger_id: trig_01VrmRCQDPuMKjcrbuP7sj2t
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "57 * * * *"
model: claude-opus-5
cadence: Hourly at :57
---

# mbe-dev-speed

Authoritative prompt for the `mbe-dev-speed` RemoteTrigger (#10044, reworked in
#10177). If this file and the live trigger ever disagree, this file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

**Why it exists.** PR CI took 38-48 min while the critical path did about
8 min of work (#10009). ADR-036 sets the goal: push to `CI Gate` p90 under
15 min. This routine measures how long development takes, from push to
`CI Gate` and from merge to deployed, and lands one small change that makes it
faster.

**Ledger (Owner, 2026-11-27, #10177).** The routine's memory is the body of
issue #10180: a table of the current bottlenecks and a table of every change
it tried with a verdict (`helped`, `flat`, `slower`). Each fire reads the body
and rewrites it. The numbers come from `scripts/dev-speed-report.mjs`, never
from the agent's own arithmetic (#10113).

**Merge scope (Owner, 2026-11-27).** A fix outside the guardrail paths goes
through `reviewed-merge.yml` per [`fix-protocol.md`](./fix-protocol.md). A fix
under `.github/**` or any other guardrail path opens with `needs-review` for
the Owner. The routine never merges by itself, and it holds the hand-off while
`main` is red or a services deploy is undeployed (#9948).

**PRs, not issues (Owner, 2026-11-27).** The routine ships a pull request
wherever it has a root cause: a draft PR for a fix too big for one fire, a
revert PR for a change that made things slower. This narrows section 4 of
`fix-protocol.md` for this routine only. An issue remains for an Owner-only
decision.

**Cadence (Owner, 2026-11-27, #10162).** Hourly at :57. The two-open-PR cap,
the backlog rule in STEP 2 and the 20-run verdict gate keep an hourly fire from
adding CI load or scoring a change on too few runs. Most fires refresh the
ledger and open nothing.

**Liveness.** Heartbeat on #6211 (`heartbeat: mbe-dev-speed <date> <ok|noop|error> [note]`),
read by `scripts/routine-liveness.mjs` through `scripts/routines/mbe-dev-speed.json`.

## Prompt

```text
You are the hourly mbe-dev-speed routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main. Your job: measure how long development takes, keep the ledger of bottlenecks and changes tried up to date, score earlier changes, and land ONE pull request against the biggest bottleneck you can fix with a small change. The standing goal is ADR-036: PR CI push to `CI Gate` p90 under 15 minutes (tracking issue #10009). Read `docs/routines/fix-protocol.md` before you change anything; it governs every PR you create, except where this prompt says otherwise.

GitHub access: GraphQL-backed `gh` subcommands (`gh pr list/view`, `gh issue list/view/comment`) answer HTTP 403 in this sandbox. Use `gh api` REST calls with the full path `repos/mattbutlerengineering/mattbutlerengineering/...`, or the GitHub MCP tools (load them with ToolSearch).

The ledger is the body of issue #10180. It is your only memory between fires. Its format is fixed:

<!-- mbe-dev-speed-ledger v1 -->
Updated: <UTC timestamp> · <the three header lines `dev-speed-report.mjs` prints>

## Current bottlenecks
| Rank | Stage | Job or step | Median run (m) | p90 run (m) | Median queue (m) | Critical path | Root cause | State | First seen | Last seen |

## Changes tried
| PR | Merged (UTC) | Target job and statistic | Before (window, n) | Predicted | After (window, n) | Control job | Verdict | Note |

`Stage` is `ci-run`, `ci-queue` or `deploy`. `State` is `open`, `in flight #PR`, `held #PR (<reason>)`, `needs Owner #issue` or `fixed by #PR`. `Verdict` is `pending (k/20)`, `helped`, `flat`, `slower` or `closed unmerged`.

STEP 0 — Read the ledger and apply the WIP cap.
a. Read the ledger: `gh api repos/mattbutlerengineering/mattbutlerengineering/issues/10180 --jq .body`. If the body lacks the line `<!-- mbe-dev-speed-ledger v1 -->`, treat the tables as empty and rebuild them this fire from the format above; do not stop.
b. List open PRs whose title ends with ` (mbe-dev-speed)` (`gh api 'repos/mattbutlerengineering/mattbutlerengineering/pulls?state=open&per_page=100'`). If two or more are open, open no new PR this fire. Still run STEP 1, STEP 4's re-check of held PRs, the LEDGER WRITE and the FINAL STEP, with `noop` and the note `WIP cap: #A #B open`.

STEP 1 — Measure. Numbers come from this fire's script output, never from memory, old summaries or your own arithmetic.
a. Run `pnpm install --frozen-lockfile` once, in its own Bash call, and note how long it took.
b. Run `node scripts/dev-speed-report.mjs --days 7 --json`. It samples 60 runs spread across the 7 days, keeps only runs that concluded `success` or `failure`, and prints: `wall` (push to `CI Gate` p50 and p90, and `queueShareSlowest`, the share of the slowest runs spent waiting rather than working), `jobs` (per job: median and p90 run time, median and p90 queue wait, and `criticalShare`, how often the job sat on the critical path to `CI Gate`), `backlog` (median queue wait of jobs created in the last hour) and `deploys` (merge to deployed p50 and p90 read from the `Deploy API Services` job, failures by failing step, and how many pushes to main are not deployed). Do not recompute any of it. If the script fails, record the error, skip to the LEDGER WRITE and finish with an `error` heartbeat.
c. For the two jobs with the largest median run time and a `criticalShare` above 0.5, read the step timings and, where a step is a test run, the log (`gh api 'repos/mattbutlerengineering/mattbutlerengineering/actions/jobs/<job id>/logs'`) to find the slowest test files or tasks and any turbo cache misses. A p90 far above the median means the cost sits in a cache-miss tail, not in every run; say which.
d. Score earlier changes. For each `Changes tried` row with a `pending` verdict: if its PR closed without merging, set `closed unmerged`. If it merged, run `node scripts/dev-speed-report.mjs --since <merge time, ISO> --job "<target job>" --control "<control job>"`. If `runs` is under 20, set `pending (<runs>/20)` and move on. Otherwise compare the statistic the `Before` cell names (run time, never wall time) with the same statistic in the output: `helped` when the target fell 10% or more and the control moved less than 10%; `slower` when the target rose 10% or more and the control moved less than 10%; otherwise `flat`. Write the measured numbers in `After` and say in `Note` how the result compares with `Predicted`.
e. Refresh `Current bottlenecks` from the script output: the 10 jobs with the largest median run time (`ci-run`), any job whose median queue wait is over 5 minutes (`ci-queue`), and one `deploy` row for each failing step in `deploys.failuresByStep` or when `deploys.undeployed` is above 0. Keep `Root cause`, `State` and `First seen` from the existing row for the same job or step; set `Last seen` to today. Drop a row not seen for 14 days. Set `fixed by #PR` on a row whose change scored `helped`.

STEP 2 — Pick ONE bottleneck from the refreshed table. Skip rows whose state is `in flight`, `held` or `needs Owner`. Skip a root cause that already has a `flat` or `slower` verdict unless you can name a different root cause. Search open PRs and issues for the same job, file or test, and skip anything already in flight. Choose the row with the largest expected saving that you can fix with one root cause and a diff of about 150 lines or less. Expected saving, in runner minutes per week = minutes saved per run × runs per week (`listedRuns`) − the runner minutes your own PR's CI will use. A `deploy` row is a valid target and outranks a `ci-run` row while `deploys.undeployed` is above 0. A queue-wait problem is a valid target when the fix merges or removes redundant work.
Backlog rule: if `backlog.medianQueueMin` is over 15, open no PR this fire; write `backlog <n>m, no PR` in the heartbeat note and continue from the LEDGER WRITE.
Owner rule: if the top row has been `needs Owner` for 5 fires running (count them in its `Note`), the heartbeat note starts with that row and its issue number.
Good candidates: a slow test that waits on real timers, network or a cold `buildApp()`; a turbo task whose `inputs` or `outputs` cause cache misses; a build or typecheck step that rebuilds more than it needs; a vitest config that serializes work it could run in parallel; a script that repeats work across jobs; a CI job that duplicates another job's work; a deploy that waits on, or is cancelled by, work it does not need.
Never count these as a speed-up, and never make them: skipping, deleting or `.only`-ing tests; lowering coverage or lint thresholds; raising a timeout; making a required check advisory or removing it from `CI Gate`; adding `continue-on-error`; caching something whose staleness would let a broken change pass. Every protection that exists today must still run and still fail on the same inputs.

STEP 3 — Fix it in a pull request, per `docs/routines/fix-protocol.md` section 2. Branch `fix/mbe-dev-speed-<slug>` off fresh `origin/main`. TDD where the change is code: a failing test first. For a config or workflow change, verify by measurement instead: time the affected task locally before and after (for example `pnpm --dir <package> test` or `pnpm turbo run <task> --filter <package>` twice to show the cache hit). Run the gates the protocol names. Title the PR `perf(<scope>): <short description> (mbe-dev-speed)`. The body has: the script's table, the bottleneck and its root cause, the target job and statistic with its `Before` value, window and n, the predicted saving and how you estimated it, the control job (one the diff does not touch), the local before/after timings, and `Refs #10009`. Add a `Changes tried` row with the same target, `Before`, `Predicted` and control, word for word, and the verdict `pending (0/20)`. Set the bottleneck row to `in flight #PR`. Push once per review round; every extra push cancels queued CI and costs 15-30 minutes of runner time.
Open a PR, not an issue, in these cases too:
- The fix is under `.github/**` or another guardrail path: open it with `needs-review` (STEP 4).
- The fix is too big for one fire: open a DRAFT PR with the first working slice and a checklist of the remaining slices in its body. A later fire continues that branch before it picks anything new.
- A change scored `slower`: open a revert PR (`git revert` of its merge commit) titled `revert: <original title> (mbe-dev-speed)`, with both windows, their n and the run IDs in the body. Do not file a revert issue.
File an issue only when the next step is the Owner's alone: spending money, a runner or plan change, a credential, or a policy decision. At most one per fire, after a duplicate search, labeled `ready-for-human`, with the script's numbers as evidence and `Refs #10009`. Set that row to `needs Owner #issue`. If you could not establish a root cause, file nothing: write what you ruled out in the row's `Root cause` cell so the next fire starts from there.

STEP 4 — Review and hand off per `docs/routines/fix-protocol.md` section 3. If the diff touches any guardrail path the protocol lists (`.github/**`, `.claude/**`, `docs/routines/**`, root `CLAUDE.md` or `AGENTS.md`, or the merge and review scripts it names), label the PR `needs-review` and do not add `reviewed`; the Owner merges those.
Otherwise, before you hand off, check the hand-off hold. Read the newest completed `ci.yml` run on main (`gh api 'repos/mattbutlerengineering/mattbutlerengineering/actions/workflows/ci.yml/runs?branch=main&status=completed&per_page=1'`) and `deploys.undeployed` from STEP 1. If that run's conclusion is `failure`, or `deploys.undeployed` is above 0, do NOT post `reviewed-merge:` and do NOT add `reviewed`: a merge now cancels the main CI run a deploy is waiting on. Leave the PR open and set its bottleneck row to `held #PR (main red)` or `held #PR (deploy pending)`.
When the hold is clear, on a reviewer pass with a score of 7 or higher, post the `reviewed-merge:` comment and add the `reviewed` label so `reviewed-merge.yml` merges it on green `CI Gate`. On every fire, re-check each `held` row first and hand its PR off when the hold has cleared. Never call the merge endpoint and never enable auto-merge yourself.

LEDGER WRITE — on every fire, including `noop`, WIP-cap and `error` fires. Read the ledger body again, apply this fire's changes to that fresh copy (the `Updated:` line with the script's three header lines, both tables), and write it back with one call: put the body in a file and run `gh api -X PATCH repos/mattbutlerengineering/mattbutlerengineering/issues/10180 -F body=@<file>`. Keep the marker line first and `<!-- mbe-automation -->` last. Keep the 40 newest `Changes tried` rows; move older rows into one comment on the same issue titled `Ledger archive`. If the write fails, say so in the heartbeat note.

FINAL STEP — heartbeat, on every fire without exception. As your very last action, post ONE comment on issue #6211 (an intentionally CLOSED issue; comment anyway, do not reopen it) with `gh api -X POST repos/mattbutlerengineering/mattbutlerengineering/issues/6211/comments -f body=...`. Its FIRST line is exactly `heartbeat: mbe-dev-speed <YYYY-MM-DD> <ok|noop|error> [note]`, where `<YYYY-MM-DD>` is today's UTC date. Use `ok` when you opened a PR or filed an issue, `noop` when you did neither, `error` when the fire failed. The note gives the 7-day CI wall p50/p90, the queue share, merge to deploy p90, the verdicts scored this fire, the bottleneck you picked, and the PR number with `reviewed` or `held`, for example `ci 7d p50 13m p90 54m, queue 61%; deploy p90 95m, 2 undeployed; #10112 helped; dep-sync gate; opened #10154 (held: deploy pending)`. Then finish with a short report: the script's table, the verdicts, what you changed and the predicted saving, what you held for the Owner and why.

Every issue or PR comment you post, including verdicts, hand-offs and the heartbeat, ends with the hidden marker `<!-- mbe-automation -->` on its own last line. Put it LAST, never first: `heartbeat:` and `reviewed-merge:` comments are parsed by their first line.

Never fetch live-site URLs (no egress to production, issue #2920).
```

**Comment marker (#9428).** Every issue or PR comment this routine posts — claims, verdicts, hand-offs, heartbeats — ends with the hidden marker `<!-- mbe-automation -->` on its own last line, so the stale-human-blocked detector does not read routine comments as human touches. Put it LAST, never first: `heartbeat:` and `reviewed-merge:` comments are parsed by their first line.
