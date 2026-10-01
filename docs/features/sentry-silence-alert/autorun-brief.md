# Autorun brief — sentry-silence-alert

Collected 2026-09-30 from Matt (one interview, four answered questions) plus
evidence gathered by the orchestrator. Not a pipeline artifact.

## Run

- **Scale:** feature run, slug `sentry-silence-alert`, dir `docs/features/sentry-silence-alert/`.
- **Routing note:** started from a maintenance-flavoured backlog seed, but `capture`'s
  rule ("a missing capability is a new feature") routes it to a feature run starting at Idea.
- **Worktree / branch:** `.claude/worktrees/sentry-silence-alert`, branch
  `feat/sentry-silence-alert`, cut from `origin/main` @ `74492f1d2`. The main checkout is
  584 commits stale and dirty with unrelated WIP — never work there.
- **Origin seeds (claim in `docs/backlog.md` at Idea):** line ~35 "Alert when a Sentry
  project receives zero events for N days", line ~37 "Prove the Sentry round trip end to end
  once per app", line ~77 "Run `scripts/sentry-round-trip.mjs`'s `main()` from CI".
- **In-flight check (ran 2026-09-30):** 6 open PRs (#5937, #5935, #5881, #5879, #5848,
  #5845) — none touch Sentry or heartbeats. Nothing matches.

## Idea-stage inputs

- **Problem (sufferer's view — Matt, sole operator):** "When a Sentry project goes quiet I
  can't tell whether the app is healthy or whether reporting is broken. Silence looks
  exactly like health, so blackouts run for months."
- **Who has it / how they cope today:** Matt. Coping = noticing by accident during
  unrelated work (both prior blackouts were found incidentally during other runs).
- **Why now:** the exact condition is live today — see evidence. Also the backend
  round-trip script was built and never scheduled (shipped-never-run pattern, recorded 4×
  in memory).
- **Evidence (measured 2026-09-30 via Sentry MCP, errors dataset, 90d):**
  | project                                                                                   | errors 90d | last event                      |
  | ----------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
  | users-api                                                                                 | 323        | 2026-09-26                      |
  | reservations-api                                                                          | 169        | 2026-09-30                      |
  | agent-api                                                                                 | 59         | 2026-09-22                      |
  | hospitality                                                                               | 40         | 2026-09-30                      |
  | mattbutlerengineering (marketing + rialto-web)                                            | **0**      | none in 90d                     |
  | eat-sheet                                                                                 | 0          | separate product — out of scope |
  | Prior incidents: `docs/fixes/sentry-dsn-static-builds/` (marketing/rialto-web shipped     |
  | Sentry with `enabled:false` ~4.5 months) and `docs/fixes/backend-observability-blackout/` |
  | (backend services had no `SENTRY_DSN` ~5 months). `scripts/sentry-round-trip.mjs` exists  |
  | (backend, triggers a deliberate 429 from inside the deployed service, polls Sentry for a  |
  | unique marker) — `git grep` finds no workflow invoking it.                                |
- **Rough solution shape (a hunch):** a daily scheduled GitHub Actions workflow that runs a
  heartbeat round-trip per Sentry project — an event that originates INSIDE the deployed
  artifact (not posted straight to the DSN, which proves only that the DSN is valid), then
  asserts via the Sentry API that it was ingested. Reuse `sentry-round-trip.mjs` for the
  backend services; build the browser equivalent for the static-site projects.
- **Success statement:** "Any Sentry project that stops ingesting events is flagged by an
  open GitHub issue within ~24 hours."
- **Biggest unknowns / ways this dies:**
  1. How to make a deployed static bundle (marketing, rialto-web, hospitality) raise a
     tagged error on demand without shipping a debug endpoint/backdoor — unknown, Architect
     must answer; the backend precedent rejected a debug endpoint.
  2. The 0-event `mattbutlerengineering` project may be genuinely blind right now — the
     first heartbeat may immediately fail. That is a finding, not a defect of this run;
     don't widen scope to fix it here, file it.
  3. Synthetic events polluting Sentry / tripping `sentry-triage.yml` into filing issues
     about heartbeats — must be tagged and filtered.
  4. Backend path spends a deliberate 429 against prod's global limiter daily.

## Decisions (from Matt)

- **Signal:** heartbeat round-trip, not raw "zero events for N days" (rejected: false-alarms
  forever on a quiet healthy static site).
- **Alert:** the scheduled workflow goes red AND opens/updates ONE de-duplicated GitHub issue
  per failing project (label `sentry`); auto-close it on the next green heartbeat for that
  project.
- **Cadence:** daily cron. Plus `workflow_dispatch`.
- **Release authorization: YES.** Mechanism = squash-merge PR to `main` (`CI Gate` is the
  only required check, `strict:false`). Autorun MAY merge once: reviewer PASS + `CI Gate`
  green + zero unfixed critical findings. Then dispatch the new workflow ONCE on `main` and
  record the real outcome in `release.md` (it may legitimately open an issue). Any
  unfixed critical review finding → stop and surface, do not merge.

## Scope

- **In:** Sentry projects users-api, reservations-api, agent-api, hospitality,
  mattbutlerengineering. Scheduled workflow, pure unit-tested decision logic in
  `scripts/`, issue open/update/close, heartbeat-event filtering in sentry-triage.
- **Out:** eat-sheet (different product/repo); fixing whatever the first heartbeat finds
  broken (file it instead); email/push notifications; Sentry-native alert rules;
  performance/usage telemetry.
- **User-facing surface:** none → PRD `ux: not-applicable` (an ops workflow; any
  in-app trigger must be invisible to visitors).
- **Tracker:** no existing issues seed the run. Only runtime interaction is the alert
  issues the workflow itself files.

## Constraints

- Repo conventions: Node 22, pure `.mjs` + `scripts/__tests__/*.test.mjs` vitest, TDD.
  `set -o pipefail` in any `run:` block whose exit code matters (gotchas § CI). Pinned
  action SHAs like sibling workflows. Never `status` as a shell var.
- `SENTRY_AUTH_TOKEN` repo secret exists (used by `sentry-triage.yml`). Sentry org
  `mattbutlerengineering`, region `https://us.sentry.io`.
- New workflow scripts must be inside the workflow's own trigger/guard coverage (backlog
  shows repeated "script not in paths filter" defects).
- Static sites deploy as CF Workers with a CSP — a browser-side trigger must work under the
  live CSP (probe the deployed page with a real browser).
- Prettier-format docs before any docs-only commit; stage files by explicit path.

## Correction (orchestrator, after Architect, 2026-09-30)

The evidence table above implied the `mattbutlerengineering` project's 0 events meant
marketing/rialto-web were blind. Architect measured otherwise: `deploy-static.yml` builds
all three static apps with one `secrets.VITE_SENTRY_DSN`, and the `hospitality` project
holds events tagged `app:marketing` (4, last 2026-09-24). The 0 is misrouting, not
blindness. The first heartbeat is expected to report `mattbutlerengineering` as
`misrouted → hospitality` and open an issue — per brief, that is a finding to file, not
scope to fix here. See architecture.md.
