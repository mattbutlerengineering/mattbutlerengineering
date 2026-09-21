# Design note: fix silent metrics collectors

Part 1 of 5 for: "platform: domain-metrics collector has never produced data —
the booking-funnel telemetry pipeline is silently dead" (proposal #5442).

This note re-verifies the two root causes claimed in issue #5527 against the
current tree (2026-09-20), then records the recommended fix and its one
non-automatable blocker, so issue 2/5 can build against it without
re-diagnosing.

## Root cause 1: `scripts/collect-domain-metrics.mjs` never runs with production egress, and has no venue id configured either

**Where it's invoked from.** The only reference to the script anywhere in the
repo outside its own test file is `.claude/skills/learning-loop/SKILL.md`:

```
node scripts/collect-domain-metrics.mjs
```

and `docs/routines/mbe-learning-loop.md` confirms the `mbe-learning-loop`
RemoteTrigger is the thing that runs that skill, on a daily cron
(`docs/scheduled-tasks.md` catalog row: `mbe-learning-loop`, daily 11:00am PT,
model sonnet).

**Why that placement is fatal.** `docs/scheduled-tasks.md` states plainly:

> remote environment has **no egress to the live site** — its agent proxy
> denies … a cloud routine can never reach production (verified 2026-07-01,
> issue #2920).

`docs/routines/mbe-learning-loop.md` carries the same constraint verbatim in
its own prompt: "never fetch live-site URLs — this cloud environment has no
egress to production (issue #2920)". `collect-domain-metrics.mjs` fetches
`https://api.mattbutlerengineering.com/api/v1/reservations/metrics/daily` by
default (`DEFAULT_BASE_URL` in the script). Every invocation from its one
call site is therefore run inside the one environment class that is
structurally unable to reach that URL.

**Confirmed: no GitHub Actions workflow references it at all.**

```
$ grep -rln "collect-domain-metrics\|domain-metrics" .github/workflows/
```

returns zero matches (exit code 1, no output) — re-run against the current
tree, not assumed. GitHub Actions runners are the one execution context in
this repo with both `gh` and real production egress (see Root cause 2 and the
`production-feedback.yml` precedent below); nothing schedules this script
there.

**Confirmed: no secret name for it is documented.**

```
$ grep -n "DOMAIN_METRICS" docs/SECRETS.md
```

returns zero matches. `docs/SECRETS.md`'s repo-secrets table lists
`AUTOMATION_PAT` and the various `*_SECRET`/`E2E_*` entries; nothing named
`DOMAIN_METRICS_VENUE_ID` or `DOMAIN_METRICS_TOKEN` appears anywhere in the
file.

**So the collector fails for two independent, stacking reasons**, exactly as
issue #5527 stated: (a) its only call site runs in an environment with no
production egress, so even a correctly configured run would fail the fetch;
and (b) nothing has ever set `DOMAIN_METRICS_VENUE_ID`, so the script's own
`main()` short-circuits before it would even attempt that fetch. Confirmed by
reading `scripts/collect-domain-metrics.mjs` directly — `main()`:

```js
const venueId = env.DOMAIN_METRICS_VENUE_ID;
if (!venueId) {
  process.stdout.write("collect-domain-metrics: no DOMAIN_METRICS_VENUE_ID — skipping\n");
  return;
}
```

and on a fetch failure of any kind (network error, non-2xx, malformed body)
it degrades the same way: prints a skip message and returns, never throws.
`.claude/skills/learning-loop/SKILL.md` documents this explicitly ("without
it, or on a network/API failure, the collector prints a skip message and
exits 0 — it never blocks the loop"). This is why the pipeline has been
silently dead rather than loudly failing: a skip and a real "no data today"
look identical in the loop's own output, and the loop is designed to never
fail on either.

## Root cause 2: `scripts/acmm/review-burden-metrics.js` shells out to `gh`, which does not exist in the one place that runs it

**Confirmed the `execFileSync` call site:**

```
$ grep -n "execFileSync" scripts/acmm/review-burden-metrics.js
24:import { execFileSync } from "node:child_process";
69:  const raw = execFileSync(
```

`fetchClosedPrs()` calls `execFileSync("gh", ["pr", "list", …])` directly, with
no fallback path. `.claude/rules/gotchas.md` § Claude Code Remote / cloud
sessions:

> The `gh` CLI does not exist in Claude Code Remote (cloud-scheduled)
> sessions. Any skill that shells out to it dies with `spawn gh ENOENT` …

Unlike `collect-domain-metrics.mjs`, this script does **not** degrade
gracefully on that failure — `main()`'s `fetchClosedPrs` call is wrapped in a
`try/catch` that logs and calls `process.exit(1)`, so a run in an
environment without `gh` fails loudly (module-load path permitting) rather
than skipping quietly. It has never been observed failing loudly in
practice because nothing schedules it at all: `metrics/review-burden.json`
holds exactly one entry, dated 2026-06-14, consistent with a single manual
run rather than a recurring job. This is a distinct gap from the
domain-metrics collector's configuration gap — there is no cron, no
RemoteTrigger, and no CI workflow that invokes this script on any cadence.

## Recommended fix

Add a new job to `.github/workflows/production-feedback.yml` (or a new
sibling `schedule:`-triggered workflow, if scoping it separately proves
cleaner in issue 2/5) that runs both:

```
node scripts/collect-domain-metrics.mjs
node scripts/acmm/review-burden-metrics.js
```

**Why `production-feedback.yml` is the right precedent, not a coincidence.**
It is already a `schedule:`-triggered workflow (`cron: "0 */6 * * *"`) that:

- reaches real production endpoints — confirmed via
  `grep -rl "mattbutlerengineering.com" .github/workflows/*.yml`, which lists
  `production-feedback.yml` among the workflows that do;
- commits its results back to `main` on a recurring cadence, visible in
  recent history as repeated `chore: record production health metrics
(<timestamp>)` PRs (its "Open PR with production health metrics" step);
  and
- already solves the automation-PR merge-train problem (CI-dispatch,
  tier-classifier dispatch, approve-automation-runs, wait-for-tier-label,
  eligibility-gated auto-merge — see the step-by-step comments in the
  workflow file) that a brand-new workflow would otherwise have to
  re-solve from scratch.

GitHub Actions runners have both `gh` preinstalled and unrestricted
production egress — the exact two things both collectors are missing in
their current home. Landing them here (or in a workflow built the same way)
fixes Root cause 1's egress half and all of Root cause 2 in one move, with
zero new CI-recovery machinery to invent.

`collect-domain-metrics.mjs`'s own `main()` already "always exits 0" on any
failure (missing venue id, network error, non-2xx, malformed body) per its
header comment and the `learning-loop` skill's documentation of that
contract — issue 2/5 does not need to add any additional degrade-gracefully
logic around it, just invoke it and let its own exit code stand.
`review-burden-metrics.js` is less forgiving (`process.exit(1)` on a fetch
failure); since Actions runners always have `gh`, this is expected to be a
non-issue there, but issue 2/5 should not assume it silently degrades the
way the domain-metrics script does — a `gh` auth or rate-limit failure in
that job would fail the step, not skip it.

## Hard blocker: this cannot fully self-heal

Wiring the workflow (issue 2/5) closes Root cause 1(a) and all of Root cause
2, but **cannot** close Root cause 1(b) on its own.
`DOMAIN_METRICS_VENUE_ID` — and possibly `DOMAIN_METRICS_TOKEN`, if the daily
counts route requires auth — is a real production venue identifier and
credential. No agent can invent a value for it; only a human (Matt) can
supply the correct one, as a GitHub Actions repo secret:

```
gh secret set DOMAIN_METRICS_VENUE_ID --body "<value>"
```

Note the gotcha already on file (`.claude/rules/gotchas.md` § Auth0 / E2E):
**never** omit `--body` — an empty stdin silently sets the secret to `""`,
which reads identical to "not configured" in every downstream check.

Until that secret exists, `collect-domain-metrics.mjs` will keep printing its
skip message and exiting 0 on every scheduled run — issue 2/5 should treat
that as the correct, intentional degrade-gracefully behavior (not a bug to
work around), wire the workflow so it runs unconditionally regardless of
whether the secret is set, and leave a comment noting that non-skipped rows
require the secret to be added out-of-band.

**`review-burden-metrics.js` needs no comparable secret.** It authenticates
via the `gh` CLI's ambient credentials, and a `GITHUB_TOKEN` with the
default `contents: read`/`pull-requests: read` scopes GitHub Actions grants
every workflow is sufficient for `gh pr list --json author,reviews,createdAt,closedAt`
against the same repo — no new secret, no new scope, no new grant.

## Acceptance criteria check

- [x] Root causes re-verified against the live tree, not taken on faith from
      the issue body (all greps re-run above, with their actual output).
- [x] Recommends the GitHub Actions workflow approach, citing
      `production-feedback.yml`'s existing schedule trigger, production
      egress, and automation-PR merge machinery as precedent.
- [x] Calls out `DOMAIN_METRICS_VENUE_ID`/`DOMAIN_METRICS_TOKEN` as a
      human-supplied-secret hard blocker that issue 2/5 cannot itself
      resolve.
- [x] Confirms `review-burden-metrics.js` needs no comparable secret.
