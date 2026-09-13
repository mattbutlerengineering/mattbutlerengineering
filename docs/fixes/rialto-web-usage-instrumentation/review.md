---
stage: review
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-12
assumptions:
  - "No live user. The stage interview was answered from autorun-brief.md and the run's four predecessor artifacts. Every factual claim below was re-measured in the worktree .claude/worktrees/docs+readme-world-class on branch fix/rialto-web-usage-instrumentation at 68abd1c21, on 2026-09-12, and the command output is quoted; nothing is transcribed from a prior stage's log."
  - "Scale: full three-pass review (correctness / design / security) rather than the lighter pass protocol § Run scale allows a maintenance run. Taken because the blast radius recorded in defect.md is the single Cloudflare Worker fronting every route on mattbutlerengineering.com, and because the change activates a code path that has never once executed in production. Verify's evidence is the floor and was not re-run."
  - "Severity vocabulary is the review skill's critical / major / minor. The skill's fix loop says majors are 'fixed or explicitly deferred by the user' and there is no user in an autorun; no finding was fixed by this stage, every finding carries an explicit route instead, and Ship is expected to surface the two majors to Matt before the apply. Review classifies; it does not silently fix."
  - "The four findings verification.md carried to Review were weighed rather than re-litigated, per the orchestrator's instruction. Where this artifact states a fact about one of them, the command was re-run here and quoted."
  - "Prepare and stop (brief § Release authorization, re-confirmed by the user today). No PR, merge, deploy, tag, publish, or apply. The only actions this stage took outside the worktree are read-only: `gh run list` / `gh run view` / `gh issue view`, and one WebFetch of Cloudflare's public Analytics Engine limits page."
---

# Review: the binding is right, the guard is real, and two things were traded away to get here

## Scope

The diff this run owns, `origin/main...HEAD` — 13 commits, 30 files:

```
$ git diff --stat origin/main...HEAD | tail -1
 30 files changed, 3605 insertions(+), 67 deletions(-)

$ git log --oneline origin/main..HEAD | wc -l
      13
```

Reviewed as code, not as prose: `infrastructure/pulumi/index.ts` + `index.test.ts`,
`infrastructure/worker/{analytics-schema.js,analytics-schema.test.js,edge-router.js,edge-router.test.js}`,
`scripts/{check-analytics-bindings.mjs,edge-usage.mjs}` and their two test files,
`apps/rialto-web/src/components/CookieConsent/*` + `layouts/DemoLayout.test.tsx`,
root `package.json`, `metrics/ai-antipattern-baselines.json`. The run's six documentation
files and the regenerated `llms*.txt` were read for claims, not reviewed for style.

Not in scope: anything Verify already proved (the drift guard's five live mutations, the
Pulumi preview, the gate re-runs). Those are the floor this pass stands on.

**No finding in this review is Critical.** Nothing here blocks Ship unconditionally.
Two majors should be settled before the _apply_ — one of them, arguably, before the
merge — and both need Matt, because a review stage with no live user cannot accept a
deferral on his behalf.

## Findings

### Major 1 — a call that has never executed in production is being switched on in the hot path of the Worker that fronts every route, with no error containment and no test for it throwing

- **Scenario.** After the binding applies, `writeAnalytics` calls
  `analytics.writeDataPoint(toDataPoint({...}))` (`infrastructure/worker/edge-router.js:92-104`).
  It is invoked at `:246` (the API passthrough) and `:327` (every static route). Neither
  call site is inside a `try`, and `export default { async fetch }` (`:108`) has no
  top-level catch — the last two statements of the handler are literally:

  ```
  $ sed -n '327,329p' infrastructure/worker/edge-router.js
      writeAnalytics(env, request, routeName, response.status, startTime);
      return addHeaders(response, url.pathname, nonce, kvPolicy);
  ```

  So if `writeDataPoint` throws, the handler rejects _after_ the upstream response was
  already fetched successfully, and Cloudflare serves its own 1101 error page instead.

- **Why that is not a hypothetical.** Cloudflare documents per-data-point limits — ≤20
  blobs, ≤20 doubles, one index of ≤96 bytes, **all blobs ≤16 KB combined**, ≤250 points
  per invocation — and does **not** document what happens when one is exceeded. Fetched
  today from `developers.cloudflare.com/analytics/analytics-engine/limits/`: the page
  "simply states the limits without describing any enforcement mechanism or failure
  behavior." `blob4` is `new URL(request.url).pathname` — unbounded from this code's point
  of view and supplied by the caller. The run never established whether an over-limit
  point throws or is dropped, and it did not need to while the binding was absent.

- **The decayed contract is in the same file.** The other external binding read on the
  request path is guarded and tested:

  ```
  $ grep -n "falls back to hardcoded defaults when KV read throws" infrastructure/worker/edge-router.test.js
  822:    it("falls back to hardcoded defaults when KV read throws", async () => {
  ```

  That test exists because `HEALTH_STATE` can throw. `ANALYTICS` is now the second binding
  on the same path and gets neither a guard nor a test — no mock in
  `edge-router.test.js` makes `writeDataPoint` throw (`grep` for a throwing analytics mock
  returns nothing). `edge-router.test.js:816` asserts only that a _missing_ binding is
  tolerated, which is the state that is about to end.

- **Why this run in particular.** Its entire thesis is that a path nothing ever executed
  is not proven. Turning the path on for 100% of edge traffic in one apply, with no canary
  and no rollback but a revert, is the moment to spend five lines on containment.

- **Decision: not fixed here — routed to Implement.** The fix is a try/catch around the one
  `writeDataPoint` call that logs via `console.error` and swallows, plus one test with a
  throwing mock asserting the response still returns 200. Kept off Critical because the
  normal payload (four short blobs, two doubles,
  a ≤11-byte index) sits far inside every documented limit, and because nothing applies
  at all while Major 3 holds.

### Major 2 — a repo-wide regression ratchet was permanently loosened by +7, and both deltas had zero-cost honest fixes

Re-measured, not taken on report:

```
$ git diff origin/main...HEAD -- metrics/ai-antipattern-baselines.json | grep -E '^[-+] +"count"'
-      "count": 693,        (hardcodedRoutes)
+      "count": 694,
-      "count": 711,        (consoleLogs)
+      "count": 717,

$ node scripts/check-ai-antipatterns.mjs | grep -E "hardcodedRoutes|anyType|consoleLogs"
  OK       hardcodedRoutes: 694 (baseline: 694)
  OK       anyType:         291 (baseline: 291)
  OK       consoleLogs:     717 (baseline: 717)
```

`anyType` was fixed in code and is unchanged — that half was handled correctly. The other
two were accepted into the baseline, and **both are avoidable**:

- **The 6 `console.log`s are removable with no change to the script's output.** They are
  `check-analytics-bindings.mjs:145-149` (the three-source preamble) and `:160` (the
  trailing hint).

  ```
  $ grep -c "console\.log" scripts/check-analytics-bindings.mjs scripts/check-service-bindings.js scripts/check-ci-gate-coverage.mjs scripts/check-orphaned-tests.mjs
  scripts/check-analytics-bindings.mjs:6
  scripts/check-service-bindings.js:6
  scripts/check-ci-gate-coverage.mjs:0
  scripts/check-orphaned-tests.mjs:0
  ```

  The defence offered in `breakdown.md` is that the sibling `check-service-bindings.js` has
  the same 6 already inside the old baseline. True, and beside the point: `runCheck`
  already owns the printing, and its own `console.log`s (`scripts/lib/fitness-check.mjs:26,30,33`)
  are already counted. `passMessage` and `failMessage` are plain strings — prepending the
  preamble to both and appending the hint to `failMessage` yields byte-identical terminal
  output with zero `console.log` in the new file. That is exactly the convention the two
  newer checks follow, at 0 each.

- **The 1 hardcoded route is decorative.** It is
  `infrastructure/worker/analytics-schema.test.js:66`, `pathname: "/api/v1/reservations"`,
  inside a test whose assertions are three `toHaveLength` calls — the pathname's _value_ is
  never read. And unlike `consoleLogs`, which skips test files
  (`check-ai-antipatterns.mjs:174` `if (isTestFile(f)) continue;`), `hardcodedRoutes` scans
  every file, so any other string removes the delta outright.

- **The decayed contract.** The ratchet is the repo's only standing defence against exactly
  the kind of silent drift this run exists to end; `.husky/pre-push` is the one gate that
  saw items 1–5 at all. Moving a repo-wide floor to accommodate one branch, when neither
  delta needed to exist, is the same shape as the defect being fixed.

- **Decision: not fixed here — routed to Implement**, then revert
  `metrics/ai-antipattern-baselines.json` to 693 / 711. Mechanical, ~10 lines, no behaviour
  change, and it must precede the merge if the baseline is to stay meaningful. Implement
  and Verify both flagged this for human review; this stage agrees with the flag and adds
  that the "no honest fix exists" premise in `breakdown.md` § Notes is measurably false.

### Major 3 — the Auth0 deletes cannot ride along on this merge, and this run must not be described as carrying them

This is the verdict on Verify's finding 2, and the framing there is too pessimistic in one
direction and too optimistic in the other.

**They are not this run's fix for #5169, and this run does not carry them.** The deploy
workflow runs refresh as its own step, before any apply:

```
$ grep -n "name: Pulumi\|command:" .github/workflows/pulumi-up.yml
 75:      - name: Pin Pulumi CLI
 80:      - name: Pulumi Cancel + Clear Pending Operations
104:      - name: Pulumi Refresh (Sync state with cloud)
108:          command: refresh
123:      - name: Pulumi Up
127:          command: up
```

`Pulumi Refresh` carries no `continue-on-error`, and #5169 is a failure _in that step_ —
re-measured today, on a run that started after Verify finished:

```
$ gh run list --workflow pulumi-up.yml --branch main --limit 3
failure  2026-09-12T21:12:36Z  34719291428
failure  2026-09-12T05:50:36Z  34676613113
failure  2026-09-12T05:33:08Z  34675873114

$ gh run view 34719291428 --json jobs --jq '.jobs[].steps[] | select(.conclusion=="failure") | .name'
Pulumi Refresh (Sync state with cloud)

$ gh issue view 5169 --json number,state --jq '"#\(.number) [\(.state)]"'
#5169 [OPEN]
```

So `Pulumi Up` is skipped and **nothing in the plan is applied** — not the two Auth0
deletes, not the `/public/` ingress, not the provider bump, and not this run's `ANALYTICS`
binding either.

That the records are genuine orphans is confirmed — they exist in state and nowhere in
code:

```
$ grep -rn "auth0\.Branding\|auth0\.Tenant\|new auth0\." infrastructure/pulumi/*.ts
infrastructure/pulumi/auth0.ts:38:export const api = new auth0.ResourceServer(…)
infrastructure/pulumi/auth0.ts:48:export const hospitalityApp = new auth0.Client(…)
infrastructure/pulumi/auth0.ts:83:export const hospitalityApiGrant = new auth0.ClientGrant(…)
infrastructure/pulumi/auth0.ts:95:export const e2eUser = new auth0.User(…)
infrastructure/pulumi/auth0.ts:117:  ? new auth0.User("e2e-nonadmin-user", …)
```

No `Branding`, no `Tenant`. **Verdict, plainly:** the two deletes are neither a fix nor a
rider. They are downstream of the step that fails, so merging this run can neither trigger
them nor benefit from them. Whoever resolves #5169 chooses between granting
`read:branding` / `read:tenant_settings` and `pulumi state delete` on the orphans, and
that choice — not this merge — decides whether the deletes exist at all in the first
successful plan. This run should carry the binding and say nothing more about Auth0 than
that it is blocked behind #5169.

- **Why it is a finding and not a footnote.** Without this, `release.md` would say the
  first human step is "merge → `pulumi-up.yml` applies the binding → rows appear," which is
  false today in a way the reader cannot see. It would also inherit Verify's implication
  that merging might quietly resolve a total IaC outage, which would make this run the
  apparent owner of an Auth0 decision it has no business making.
- **Decision: fixed at Ship, in words.** `release.md` must state that this PR queues a
  binding that applies only after #5169 is resolved by someone else, that the first
  post-#5169 apply carries whatever the plan then holds, and that the Auth0 records belong
  to whoever fixes #5169.

### Minor 1 — the drift guard is not scoped to the edge-router resource, so the exact production state it exists to catch can still pass it

Probed today with the guard's own exported parsers, moving the binding from the edge router
to the `gen` worker (both are `WorkersScript` resources in the same file — `index.ts:326`
and `:350`):

```
$ node -e '…parsePulumiAnalytics(movedText)…'
edge-router still declares it?  false
parsePulumiAnalytics -> [{"name":"ANALYTICS","dataset":"edge_requests"}]
findings -> []
```

Guard green; edge router unbound. The S2 regex
(`check-analytics-bindings.mjs:66`) is global over the whole file and never asks which
resource the literal sits in, so the anti-vacuous rule — which fires only at _zero_
entries — does not help.

Defence in depth does hold: the new Pulumi assertion scopes properly
(`index.test.ts` `findResource(… name.includes("edge-router"))`) and goes red under the
same mutation, as Verify proved. So the pair is sound; the guard alone is not, and the
guard is the half wired into `repo-audit` and advertised as the anti-recurrence device.

- **Decision: deferred.** The unit test covers the case, the run is prepare-and-stop, and
  the fix (anchor S2 to the slice of `index.ts` following the edge-router constructor)
  is a behaviour change to a just-landed guard. Route: `docs/backlog.md` seed.

### Minor 2 — the read path this run adds has never executed against the real API, so the run ships a second never-run consumer

`buildUsageQuery` (`edge-usage.mjs:105-127`) emits `GROUP BY route, pathname` over SELECT
aliases, `NOW() - INTERVAL 'n' DAY`, and `FORMAT JSONEachRow` after `LIMIT`. Every
request-shape claim in `verification.md` T5 is against a stub `fetch`, and the gap is real
here too:

```
$ node scripts/edge-usage.mjs; echo "exit=$?"
Missing required environment variable: CLOUDFLARE_API_TOKEN
exit=1
```

This is the run's own defect class, reproduced in miniature: a shipped path nobody has
executed. It is Minor and not Major only because the run declares it in four places
instead of hiding it, and because no credential exists to close it.

- **Decision: deferred, with a named route.** `release.md` must list "run
  `node scripts/edge-usage.mjs` against the real API, once a token with
  _Account · Account Analytics · Read_ exists" as a post-merge verification step whose
  failure re-opens the run — not as an assumption that the SQL is correct.

### Minor 3 — `PrivacyPage.tsx` now contradicts the UI this run ships, and its route to being fixed may not exist

```
$ grep -n -i "analytic" apps/rialto-web/src/pages/PrivacyPage.tsx
48:  …we may collect anonymous usage data via analytics cookies (e.g. …
72:  …Analytics and functional cookies
73:  are optional and only set with your consent. You can change your preferences at any time
74:  using the cookie banner.
95:  This site may use third-party analytics providers. These providers may set their own
```

Scenario: a visitor reads "you can change your preferences at any time using the cookie
banner," opens the dialog looking for the Analytics toggle, and finds three toggles and no
Analytics. Meanwhile the page never mentions the cookie-free server-side edge log this run
turns on. Half of that contradiction is this run's doing.

`architecture.md` § Decisions scoped the copy out deliberately and `breakdown.md` § Notes
carries it as a seed "for Operate to append at run close." **That route is the weak part.**
This run is prepare-and-stop, and its sibling `hospitality-service-ux` has been formally
active for weeks with Operate blocked on production feedback the Auth0 gate makes
impossible. A seed that only gets written at a stage that may never run is not a route.

- **Decision: the copy edit is deferred (correctly — it is prose needing its own pass), but
  the seed is re-routed.** Ship should append it to `docs/backlog.md` itself, or name it in
  `release.md` as a human follow-up, rather than leave it waiting on Operate.

### Minor 4 — pre-existing, correctly not fixed: `node scripts/audit-markdown.mjs` exits 1

Verify proved attribution against a throwaway `origin/main` worktree; the offending file is
byte-identical to `origin/main`, last touched by #1397 on 2026-05-16, and zero findings land
on any file this run wrote. One thing worth adding for Ship's benefit: **it is not a gate on
this PR.**

```
$ grep -n "audit-markdown\|check:markdown" package.json
39:    "check:markdown": "node scripts/audit-markdown.mjs",

$ grep -rln "audit-markdown" .github/workflows/
.github/workflows/docs-audit.yml
```

`check:markdown` is not in the `repo-audit` chain (`package.json:16`), and the only
workflow that runs it is the weekly `Docs Audit`. So this FAIL will not red CI Gate on the
Ship PR.

- **Decision: deferred.** Route: `/md-audit`. Editing an unrelated file to green a gate is
  the scope creep the brief forbids, and Verify was right to leave it.

### Minor 5 — out of this run's scope, recorded for routing: `.claude/hooks/verify-push-sha.sh:38` resolves the branch in the wrong tree

```
$ sed -n '38p' .claude/hooks/verify-push-sha.sh
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
```

The script never `cd`s into the tree the push came from; its only path anchor is
`$CLAUDE_PROJECT_DIR` (`:24`, used to locate `hook-input.mjs`). When the push originates in
a linked worktree on a different branch, the hook compares the _main checkout's_ branch
name against `git ls-remote origin refs/heads/<that branch>` and reports a mismatch that is
not real. Observed independently by the orchestrating session and by Implement — which is
why `breakdown.md` § Notes records the push verified "against `git ls-remote` rather than
the pipe's exit code."

- **Decision: not fixed here** — it is not this run's code and touching `.claude/hooks/`
  from a fix run is scope creep. Route: `docs/backlog.md` seed, or
  `/claude-automation-recommender`, which owns guards that fire wrongly.

## Passes with no findings

- **Security — clean.** The SQL API takes raw text, and the allowlist really is the
  boundary: `--days` must match `/^\d+$/` _and_ pass `isValidDays` (integer 1..90),
  `--route` must match the literal `ROUTE_PATTERN = /^[a-z][a-z0-9_-]*$/`, `parseArgs`
  returns `{days: null, route: null}` on any usage error so a rejected value cannot reach
  the builder, and `buildUsageQuery` re-validates both at the interpolation point
  (`edge-usage.mjs:106-113`) so a caller bypassing `parseArgs` is still safe. `accountId`
  is `encodeURIComponent`'d into the URL (`:130`). The token is only ever an
  `Authorization` header and appears in no error message — the 401/403 path echoes status
  and body, never the credential. No secret is committed: the run adds two env-var _names_
  and documents that `MBE_CLOUDFLARE_API_TOKEN` is the wrong scope. The consent change
  reduces client-side data collection rather than adding any, and the edge log carries no
  cookie and no client identifier.
- **Design against `architecture.md` — matches, with the one deviation documented.** Every
  contract the architecture named is present as specified: the schema module's four
  exports and column map, the Pulumi literal `{ name: "ANALYTICS", dataset:
"edge_requests", type: "analytics_engine" }`, the guard's six finding kinds including the
  anti-vacuous `no-entries:<source>`, the script's pure/injected seams, the explicit-key
  read in `readStoredConsent`, and the runbook's nine sections. The documented deviation
  (`toDataPoint` states positions as an array while the test derives them from the map,
  `breakdown.md` item 2 design note) is the right call — two independent statements are
  what make the pin a pin.
- **Correctness of the consent change — clean.** `readStoredConsent` picks known keys
  explicitly, forces `essential: true`, coerces `functional`/`marketing` with `Boolean()`
  (same falsy outcome as the old `DEFAULT_PREFERENCES` spread, now type-honest), tolerates
  a legacy `analytics` key without crashing and without writing back, and still resolves
  malformed JSON to defaults via the surviving `catch`. The hook's public shape is
  unchanged. The two E2E specs that seed the legacy blob were deliberately left in place,
  which turns the legacy-key path into a real-browser exercise for free.
- **Correctness of the writer refactor — clean.** `env[ANALYTICS_BINDING]` matches house
  style, the early return on a missing binding is deliberately preserved (absence is now
  loud via the unit test and the guard rather than via a runtime error), and the field
  order survives the move — proven not by inspection but by Verify's column-swap mutation
  going red in two independent tests from opposite directions.

## Verdict

**Ready to ship, with three things Ship must carry — none of them Critical.**

The defect is fixed correctly and the fix is guarded by something that has been shown to
fail. That is a better standard of evidence than this repo usually gets, and the artifacts
are unusually honest about what they could not prove.

What Ship must not do is describe this merge as an event that produces data. Three items,
in the order they matter:

1. **Major 3 is a wording obligation on `release.md`** — the apply is blocked behind #5169,
   which fails in `refresh`, before anything in the plan runs. The Auth0 deletes are
   neither this run's fix nor this run's risk; say so and leave them to whoever resolves
   #5169.
2. **Major 2 wants Matt's explicit call before merge.** A repo-wide ratchet moved by +7 when
   both deltas had zero-cost fixes is either accepted knowingly or reverted; it should not
   land as a side effect.
3. **Major 1 wants five lines before the apply, not before the merge.** Nothing executes
   while #5169 holds, so there is time — but the first successful `pulumi up` is the moment
   an unguarded, never-executed call goes live on every route, and that is the wrong moment
   to find out what `writeDataPoint` does with an over-limit point.

The minors are all correctly scoped out, but two of them (Minor 3 and Minor 5) are routed
to places that may never be reached — Operate on a prepare-and-stop run, and a hook nobody
owns. Ship should write those seeds itself rather than inherit the assumption that a later
stage will.

Next stage: Ship.
