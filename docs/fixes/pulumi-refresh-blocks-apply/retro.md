---
stage: operate
run: maintenance:pulumi-refresh-blocks-apply
date: 2026-09-14
assumptions:
  - "Soft gate: maintenance run — no `prd.md` and no `idea.md` exist by design (protocol § Maintenance-run orientation). `defect.md`'s four Done-when criteria (lines 36–47) are the success criteria this retro grades against; `release.md` (the predecessor, filled at `4ea618f8a`) is present, so no backfill and no proceed-past-a-gap was needed."
  - "Let it breathe: the bypass merged 2026-09-13T07:58Z and the apply ran 2026-09-14T03:03Z, so the release is hours old. For a CI-pipeline defect the `usage` is the apply run itself, and that signal is measured (job-level conclusions, the saved log of run 34801283091, and live probes re-run by this stage), not hoped. Closing now is honest because every criterion the run set is decidable from that one run and nothing this run controls changes the reading by waiting. What a later signal would still add — and is carried as seeds, not waited for: (a) the second dispatch after Cloudflare Analytics Engine is enabled, which would prove the edge-router half and turn Done-when 1's `Deploy Infrastructure = success` clause green — it is gated on a human step that belongs to the `rialto-web-usage-instrumentation` run's precondition, not this run's defect; (b) the bypass's eventual removal, which is a human decision with no pipeline signal (`release.md` § Human checklist)."
  - "Signal-strength labels are this stage's own assignment: `measured` = a command this stage ran on 2026-09-14 (quoted) or a line quoted from `release.md` § Release log / the saved log with its run ID; `pattern` = the same shape seen in at least two independent runs or artifacts; `anecdote` = a single unrepeated observation."
  - "Default taken: the run closes on a measured PARTIAL outcome (Done-when 1 half-met) rather than staying open across the human gate. The brief and the operate skill say nothing about a run staying open until a foreign precondition clears; the orchestrator's instruction for this stage was to close now and say so plainly, and the skill's own default (assumption 2) was weighed rather than skipped."
  - "Default taken: read-only. Re-measurements were limited to `gh run view` / `gh run list`, `curl` against the two production hosts, `dig`, `doctl apps spec get` and `doctl apps list-deployments`, plus one local `pnpm --dir scripts test`. No `gh workflow run`, no tracker write, no `pulumi`, no `doctl`/`wrangler`/Auth0/Cloudflare mutation, no `.env` read."
  - "The claim that the `rialto-web-usage-instrumentation` run's artifacts never recorded the account-level Analytics Engine enablement precondition is this stage's grep of its seven artifacts (no `10089`, no `enable Analytics Engine`, no `workers/analytics-engine` dashboard path; the 58 `Analytics Engine` mentions concern the dataset, the binding and the SQL API). That run's Operate is that run's to write — surfaced here as a seed, not run."
  - "Five seeds appended to `docs/backlog.md` in this stage's own wording; the tracker was not written to. `release.md` frontmatter cites the related seed as `docs/backlog.md` line 128; the file was 138 lines at the bypass merge `1301adfd0` and is unchanged since, and the seed it means (`Escalate a human-gated blocker that outlives the run that found it …`, from `maintenance:public-ingress-never-applied`) is at line 129. Recorded as a correction; the line stays unclaimed (the run's origin is the user's instruction)."
  - "`date:` is 2026-09-14 per the orchestrator (UTC date of the apply run and of this stage's measurements, 03:23Z); the local calendar at write time is still 2026-09-13 Pacific. Every timestamp below is UTC."
---

# Retro: `pulumi refresh` unblocked — the pipeline runs again, the first apply landed by half

**Verdict in one line.** The defect this run captured is fixed and measured:
`Pulumi Refresh (Sync state with cloud)` passes on `main` for the first time
since 2026-09-09, the two orphans are excluded exactly as designed, and the DO
`/public` ingress rule the outage had held back is live at the origin. The
`Deploy Infrastructure` job still concludes `failure` — not on anything this run
touched, but on a second, unrelated human gate (Cloudflare Analytics Engine has
never been enabled on the account) that a _different_ merged change (#5315)
put in front of the same `pulumi up`. The run closes on that measured partial
outcome, and says so, rather than on the green it was written to produce.

## Ground truth, re-measured 2026-09-14T03:23Z

Every line is a command this stage ran (read-only) or a field read from the
saved log of run `34801283091`.

```
$ gh run view 34801283091 --json conclusion,event,headSha,createdAt,updatedAt
{"conclusion":"failure","event":"workflow_dispatch","headSha":"b2a1d0c5f…","createdAt":"2026-09-14T03:03:55Z","updatedAt":"2026-09-14T03:06:41Z"}
$ gh run view 34801283091 --json jobs --jq '.jobs[]|{name,conclusion,steps:[.steps[]|select(.name|test("Pulumi|Report"))|"\(.name)=\(.conclusion)"]}'
{"conclusion":"failure","name":"Deploy Infrastructure","steps":["Pin Pulumi CLI=success","Pulumi Cancel + Clear Pending Operations=success","Pulumi Refresh (Sync state with cloud)=success","Pulumi Up=failure"]}
{"conclusion":"success","name":"Report Deploy Health","steps":[]}
$ gh run list --workflow pulumi-up.yml --branch main --limit 5   # newest first
34801283091  2026-09-14T03:03:55Z  workflow_dispatch  failure  b2a1d0c5f   <- the apply; nothing newer
34742533377  2026-09-13T06:21:09Z  workflow_run       failure  ec25f648b   <- last pre-bypass run (refresh 403)
```

Saved log, `run-34801283091.log` (1,493 lines): the refresh step's summary is
`Resources: ~ 1 updated / 15 unchanged / Duration: 2s`; the up step's is
`Resources: ~ 2 updated / 10 unchanged / 2 errored / Duration: 52s`. The two
orphan URNs appear **six** times in the whole log and every one is an argument
echo — the action's `exclude:` input dump on the refresh step (2) and the up
step (2), and the action's re-print of the failed command line
`pulumi up --yes --skip-preview --exclude urn:…tenant… --exclude urn:…branding…`
inside its error object (2). Zero lines pair an orphan URN with an error of its
own. The only error in the log is Cloudflare's, on the edge-router row:

```
cloudflare:index:WorkersScript (mattbutlerengineering-edge-router):
  error: [ERROR] PUT "https://api.cloudflare.com/client/v4/accounts/59d5bec2d6e979d474efe54ec76c3658/workers/scripts/mattbutlerengineering-edge-router": 403 Forbidden {
      "code": 10089,
      "message": "You need to enable Analytics Engine. Head to the Cloudflare Dashboard to enable: https://dash.cloudflare.com/59d5bec2d6e979d474efe54ec76c3658/workers/analytics-engine"
```

Live surface, both hosts, with a `dig @1.1.1.1` cross-check that matched the
LAN resolver (`api.` → `mattbutlerengineering-api-x6iga.ondigitalocean.app.`):

```
$ curl -sS -o /dev/null -w 'code=%{http_code} ct=%{content_type}\n' https://api.mattbutlerengineering.com/public/v1/venues/x
code=404 ct=application/json; charset=utf-8
$ curl -sS https://api.mattbutlerengineering.com/public/v1/venues/x
{"type":"about:blank","title":"Not Found","status":404,"detail":"No venue found with slug 'x'."}
$ curl -sS -o /dev/null -w 'code=%{http_code} ct=%{content_type}\n' https://mattbutlerengineering.com/public/v1/venues/x
code=200 ct=text/html                                   # the marketing SPA — edge gate still shut
$ curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/api/v1/venues
401                                                     # control
$ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public
1
$ doctl apps spec get … --format json | jq -r '.ingress.rules[]|"\(.match.path.prefix) -> \(.component.name)"'
/api/v1/users -> users-api … /api -> reservations-api
/public -> reservations-api
/ -> users-api
$ doctl apps list-deployments 5dbdcf45-4053-4518-a97b-f1e2b3122a61 | head -2
307e240d-…  ACTIVE      app spec updated  2026-09-14 03:05:53  2026-09-14 03:06:23   # 30 s
dfe13995-…  SUPERSEDED  manual            2026-09-14 01:27:57  2026-09-14 03:06:26
```

The bypass is intact on `main` (`exclude:` blocks 2/1, `TEMPORARY BYPASS`
markers 2/1 across `pulumi-up.yml` / `pulumi-preview.yml`) and its guard is
green here: `pnpm --dir scripts test pulumi-orphan-exclude-bypass` →
`Tests 11 passed (11)`.

## Outcomes vs. intent

`defect.md` Done-when 1–4 are the criteria. The run's Expected — "a push to
`main` … applies the Pulumi program to the `prod` stack" — is graded after them.

### Done-when 1 — a `Pulumi Deploy` run on `main` whose `Deploy Infrastructure` job concludes `success`, with the refresh step no longer 403ing

- What happened: **HALF MET, and the two halves are separable.** The refresh
  clause is met: `release.md` § Release log 9–10 — _"`Pulumi Refresh (Sync
state with cloud)=success` — the first passing refresh on `main` since
  2026-09-09 … orphan URN lines containing `error`/`forbidden`: `0` …
  `Resources: ~ 1 updated, 15 unchanged, Duration: 2s` … V5 is now verified:
  `--exclude` reaches the refresh engine and the two Auth0 records are never
  read."_ The job clause is **not** met: `Deploy Infrastructure` = `failure`,
  because `Pulumi Up` failed on `cloudflare:index:WorkersScript
mattbutlerengineering-edge-router` with Cloudflare error `10089` — _"You need
  to enable Analytics Engine"_ — the `ANALYTICS` `analytics_engine` binding
  that #5315 (`ec25f648b`) added at `infrastructure/pulumi/index.ts:342`.
  `release.md` log 11: _"Failure class: none of S-fail-1/2/3. The orphans are
  not involved … Deterministic, so no re-dispatch by this stage — it would fail
  identically."_ Re-read by this stage: same conclusions, no newer run.
- Signal strength: **measured** — job-level conclusions from `gh run view`,
  the summary and error lines from the saved log, and the zero-orphan-error
  count re-grepped over the whole log, not only the refresh step.

### Done-when 2 — the deploy debt is applied and observable: `/public` routed on the DO app

- What happened: **MET.** `release.md` § Post-release checks S5: _"DO gate
  OPEN … `grep -c /public` → `1`; ingress order … `/public → reservations-api,
/ → users-api`"_ and the 404 body `{"…","detail":"No venue found with slug
'x'."}` — reservations-api's own `createProblemDetails`, not users-api's
  `Route GET:… not found` catch-all. Re-measured today: `grep -c /public` = 1,
  the same eight-rule order, the same JSON 404 from the origin, deployment
  `307e240d` `ACTIVE` (`app spec updated`, 30 s), DB health `ok` (latency 10 ms).
  What did **not** land is the other half of #4565 — the edge-router
  `originRoutes: ["/api","/public"]` — because it rides the `WorkersScript`
  that failed: the apex `/public/v1/venues/x` still answers `200 text/html`
  (the marketing SPA), unchanged from before the apply. The criterion as
  written names the DO app only, and that is exactly what applied; the
  user-facing surface (`public-ingress-never-applied`'s defect) is still one
  gate short.
- Signal strength: **measured**, on both the spec and the live origin, twice
  (Ship at 03:0xZ, this stage at 03:23Z).

### Done-when 3 — a regression-guard test exists and is green, reading the real workflow file

- What happened: **MET.** `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs`
  (11 `it()`s over six invariants; textual, no YAML parser) was RED on
  `origin/main`'s workflow files first — `breakdown.md` § Notes 1.1: _"`Tests 5
failed | 6 passed (11)`"_ at `ec25f648b` — re-demonstrated by Verify in a
  throwaway worktree (V1), GREEN on the branch, and green on `main` through
  CI Gate `34745895030` (PR) and push CI `34746515919` (`release.md`
  § Outcome). This stage: `Tests 11 passed (11)` at `4ea618f8a`.
- Signal strength: **measured**, and **pattern** for the RED-first discipline —
  the third consecutive maintenance run (`public-ingress-never-applied`,
  `rialto-web-usage-instrumentation`, this one) to demonstrate RED on the real
  defect source rather than assert it.

### Done-when 4 — `release.md` carries the human checklist for retiring the bypass

- What happened: **MET.** `release.md` § Human checklist carries both fixes
  verbatim from `docs/fixes/public-ingress-never-applied/release.md` step 0 —
  Option 2, the `pulumi stack export` backup then two `pulumi state delete`
  commands with the exact URNs and a `jq` check that returns `0`; Option 1, the
  four scopes (`read:tenant_settings`, `update:tenant_settings`,
  `read:branding`, `update:branding`) on the Pulumi M2M grant with the
  `auth0 api get client-grants…` check — plus the removal PR's four steps and
  the two safe orderings (state-delete: removal PR **first**; scopes: grant
  first). The three marker comments, the gotchas bullet and the guard's
  `RECIPE` constant all point at that file, and it exists on `main`.
- Signal strength: **measured** (the file's contents on `main`). Whether the
  checklist is ever _executed_ is unmeasurable from inside the pipeline —
  `release.md` says it plainly: _"A scope grant produces no pipeline signal"_ —
  which is why seed (i) exists.

### The defect's own Expected — a push to `main` applies the program to `prod`

- What happened: **PARTIALLY.** The pipeline is no longer dead at its first
  step: refresh passes, `up` runs, and two of its three planned rows applied
  (`digitalocean:index:App` `[diff: ~spec]` in 36 s; `WorkersScript
mattbutlerengineering-gen` provider bump in 10 s). The third row fails
  deterministically until a human enables Analytics Engine, so every future
  push-triggered or `workflow_run`-triggered apply will land its non-edge rows
  and then report `failure` — `Report Deploy Health` correctly wrote KV
  `deploy/infrastructure` = `failure`. That is a materially better state than
  the outage (nothing applied, ever) and a materially worse one than green, and
  the difference is one dashboard click that no artifact of the run that
  needed it ever mentioned.
- Signal strength: **measured** for this run; **anecdote** for "every future
  apply will fail the same way" — one run, though the error is a provider-side
  precondition, not a flake.

## Run retrospective

### Keep

- **RED against the real `origin/main` workflow files before a single YAML
  line changed, and Verify re-demonstrating it in a throwaway worktree instead
  of trusting Implement's note.** `5 failed | 6 passed` with each failure
  naming the missing `exclude:` or marker by step name (`breakdown.md`
  § Notes 1.1; `verification.md` V1). The guard is a test, not a claim about a
  test, and it is what makes the removal PR safe to write later — deleting
  the blocks without deleting the test goes red.
- **Preview parity as the only pre-merge engine evidence, and saying what it
  could not prove.** Mirroring the `exclude:` list onto `pulumi-preview.yml`
  and dispatching one read-only preview from the branch (`34743839849`:
  `~ 3 to update / 15 unchanged`, 0 `delete` rows) answered GAP-2 — does
  `--exclude` suppress the orphan deletes? — before merge. V5 (the refresh
  side) was recorded as _"NOT VERIFIED — by design"_ rather than softened
  into a pass, and the first real run then proved it. The honest gap made the
  post-merge reading a one-line check instead of a debate.
- **Job-level reading and URN-grepping, not the rollup and not bare `403`.**
  Ship's S2/S3/S4 read the job conclusion, grepped the two URNs, and counted
  `error|forbidden` on those lines. That is why the failure was classified in
  one pass as _none of S-fail-1/2/3_ and attributed to #5315's binding, with
  no re-dispatch loop and no rollback — the failed `PUT` changed nothing on
  Cloudflare and the DO rule is the intended state.
- **The write-back path.** `release.md` was committed on the branch with
  `_pending_` placeholders so the marker comments' reference resolved at
  merge time, then filled through a docs PR after the apply (`4ea618f8a`).
  The two preceding runs' `release.md` said PREPARED-NOT-RELEASED for days
  after the fact; this one says exactly what landed within the hour. Keep the
  placeholder-then-fill shape for every run whose Ship evidence arrives after
  its own merge.

### Change

- **Enumerate failure branches for the rows the apply will execute, not only
  for the change the run made.** S-fail-1/2/3 all begin "…naming an orphan".
  The class that happened — a _foreign_ row's provider-side precondition —
  was visible pre-merge: `verification.md` § Findings recorded that #5315 had
  widened the edge-router row with a seven-entry `bindings` re-send including
  `ANALYTICS analytics_engine`, and nobody asked what Cloudflare requires for
  that binding to be accepted. When Ship applies accumulated deploy debt, each
  foreign `~` row needs one line: _what does the provider need for this to
  succeed, and is it known to hold?_ — or at minimum a fourth branch,
  "foreign-row failure: stop, attribute to the owning run, do not re-dispatch."
- **A brief's "full release authorization" is not authorization the harness
  honours; plan the production dispatch as a hand-off.** `gh workflow run
pulumi-up.yml --ref main` was denied by the auto-mode permission classifier
  twice (`release.md` log 8, 8b: 2026-09-13 ~07:59Z and 19:39Z), and the human
  ran the identical command from the prompt in seconds at 03:03:50Z the next
  day — ~19 h after the merge. The Ship stage even ran inline because
  dispatching a Ship subagent was denied on the same grounds. The fix is not
  to route around the classifier (the stage rightly did not) but to write the
  dispatch into the plan as the human's step with its own S0 instruction, so
  the wait is a scheduled hand-off rather than a discovered denial.
- **Scope duration expectations to the change type.** "~30 min DO deployment"
  came from the public-ingress plan and the `architecture.md` blast-radius
  note, both describing an image-rebuild deployment; an ingress-only spec
  change re-routed in **30 s** (`307e240d`, created 03:05:53Z, `ACTIVE` at
  03:06:23Z). The S0 serialization window and the G-G concurrency hazard were
  sized for a 30-minute exposure that did not exist. S6 should say which
  deployment type to expect, and S0's window should follow from it.
- **Derive probe discriminators from the handler's own string, never from a
  guess made while the route was unreachable.**
  `scripts/check-api-surface-invariants.mjs` asserts `expectBodyIncludes:
"Venue not found"` on both `public-venue-lookup:*` probes (lines ~124, ~138);
  reservations-api emits `No venue found with slug '…'.`
  (`services/reservations/src/routes/public-venues.ts:40`). The string was
  written when DO still refused `/public`, so it had never met a real 404 from
  the right service, and its first real encounter reported `wrong-service`
  against the right service. Seeded (iii).

### Stop

- **Stop retrying a classifier-denied production action under a fresh
  invocation.** The second attempt (19:39Z) produced the same denial, created
  no run, and the apply still waited for the human. Surface once, hand off,
  stop — the retry bought nothing and cost the re-invocation.
- **Stop carrying an upstream run's numbers forward without re-labelling them
  as that run's.** "2 updates, 14 unchanged" (brief) became `~ 3 / 13`
  (Capture, from the real transcript), then `~ 3 / 15` (Verify, after #5315),
  then `~ 2 updated / 2 errored` (the apply); "~30 min" became 30 s. Every
  stage re-measured and corrected — good — but each also inherited the stale
  figure one stage further than it needed to. Quote the source run ID next
  to any inherited number, or re-measure before quoting.

## Idea seeds

Appended to `docs/backlog.md` (append-only, at the end; nothing existing was
touched — the related public-ingress seed at line 129 stays unclaimed).

- **(i)** Retire the orphan-exclude bypass once the human fix lands: one PR
  that removes the three `exclude:` blocks with their marker comments
  (`pulumi-up.yml` refresh + up steps, `pulumi-preview.yml`), deletes
  `scripts/__tests__/pulumi-orphan-exclude-bypass.test.mjs` and drops the
  gotchas bullet — condition EITHER the four Auth0 scopes on the M2M grant OR
  both URNs deleted from prod state; state-delete order is removal PR **then**
  delete **then** dispatch, scopes order is grant **then** PR **then** dispatch
  (`release.md` § Human checklist). A scope grant produces no pipeline signal.
- **(ii)** Enable Cloudflare Analytics Engine once on the account
  (`https://dash.cloudflare.com/59d5bec2d6e979d474efe54ec76c3658/workers/analytics-engine`)
  and re-dispatch `pulumi-up.yml` on `main` — the one click that gates #5315's
  `ANALYTICS` binding and the edge half of #4565. The
  `rialto-web-usage-instrumentation` run's artifacts never recorded this
  account-level precondition; its Operate should capture it.
- **(iii)** Fix `check-api-surface-invariants.mjs`'s body discriminator:
  `Venue not found` never matches reservations-api's
  `No venue found with slug '…'.`, so `reachable-at-origin` reports
  `wrong-service` against the right service.
- **(iv)** Preventive, from the defect itself: catch a partial apply that
  leaves state records the pipeline's own credentials cannot read, before the
  next refresh dies on them — a post-`Pulumi Up`-failure step that lists
  newly-introduced resource types left in state as orphan candidates next to
  the revert instruction, and a Review/ADR-check question for any PR adding a
  new provider resource type: which scopes does it need, and does the CI
  credential hold them?
- **(v)** Make an autorun brief's "full release authorization" name the
  actions the harness's classifier is known to deny an agent, so Ship plans
  the production dispatch as a human hand-off with its own S0 instead of
  discovering the denial at the dispatch; a second attempt under a fresh
  invocation adds nothing.

## Run complete

Closed 2026-09-14. **The apply is half-landed pending a human step, so the run
closes on a measured partial outcome, not a full one.** Fixed and proven: the
refresh no longer 403s, the orphans are excluded on refresh, up and preview, the
guard is green on `main`, and the DO `/public → reservations-api` rule is live at
the origin. Not landed: the edge-router Worker (content, `ANALYTICS` binding,
`/public` `originRoutes`) — blocked by Cloudflare `10089` until Analytics Engine
is enabled on the account, after which one more dispatch is expected to show
refresh `16 unchanged`, up `~ 1 updated` (`mattbutlerengineering-edge-router
[diff: ~bindings,content]`) and `deploy/infrastructure` = `success`. No artifact
of this run will record that second run once this file exists; it belongs to
the `rialto-web-usage-instrumentation` run's Operate or to a `session:` seed.

**Outstanding, in order — all Matt's (`release.md` § Outcome):**

1. Enable Analytics Engine (dash link above), then S0 and exactly one
   `gh workflow run pulumi-up.yml --ref main`; read the `Deploy Infrastructure`
   **job**.
2. Retire the bypass — scopes or `state delete`, then the removal PR, in the
   stated order (`release.md` § Human checklist; seed (i)).
3. Only then does #5169's refresh half go away for good; #4848's Auth0 half
   stays open regardless.

Seeds above are the input to the next Idea-stage run.

**Addendum (written before this file left the branch):** a second human
dispatch at `2026-09-14T03:29:04Z` — run `34802756625`, `workflow_dispatch`,
`headSha=b2a1d0c5f` — repeated the result exactly: `Pulumi Refresh` `success`
with 0 orphan-error lines, `Pulumi Up` `failure` on the single remaining row
(`cloudflare:index:WorkersScript mattbutlerengineering-edge-router`, Cloudflare
`10089` "You need to enable Analytics Engine"). Analytics Engine had not been
enabled between the two runs. This changes no grade above (Done-when 1 stays
half-met; 2–4 stay met) and upgrades the failure's signal strength from
`measured` to `pattern`: two independent runs, one cause, deterministic. Seed
(ii) is the only path forward; a further dispatch without it is wasted.
