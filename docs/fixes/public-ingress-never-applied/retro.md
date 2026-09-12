---
stage: operate
run: maintenance:public-ingress-never-applied
date: 2026-09-12
assumptions:
  - "The operate skill's step 3 (`let it breathe` — offer to return once there is real usage to reflect on) was answered by writing the retro now rather than deferring. No user was present to choose. The usual reason to defer does not apply here and its inverse does: there is no usage to wait for, because the fix has never been applied and the surface is exactly as dead as on capture day. Waiting would only extend a run that is already complete on every artifact except this one, while the two things worth recording — that the criteria went green over a live defect, and that the apply is blocked on a human — are both fully measurable today and have been stable for three days."
  - "Outcome signal strength labels (`measured` / `pattern` / `anecdote`) are this stage's own assignment; the skill names the axis but no user graded any of them. Every `measured` label below is backed by a command run on 2026-09-12 and quoted; `pattern` is used only where at least ten independent observations agree; `anecdote` is used where the observation exists but cannot bear weight, and in each such case the reason is stated inline."
  - "The thirteen open `API surface invariant breach` issues were NOT closed by this stage and #5237 was not touched. `release.md` step 6 owns their closure and gates it on the apply, and they are the only standing automated evidence that the surface is still dead — closing them at run close would delete the outcome instrument at the exact moment the run stops watching. Nobody was present to override that reading."
  - "The one outstanding run finding with no carrier — the `--base` probe gap that `review.md` deferred to `a follow-up Implement work item / ready issue` — is recorded here as a backlog seed and flagged for human action rather than filed as a GitHub issue. `autorun-brief.md` records `Tracker mirror: None` for this run and this stage's dispatch authorizes exactly two writes (this artifact and a `docs/backlog.md` append) plus the PR that carries them. Filing an issue was not authorized, so the gap is seeded, not ticketed. It has now survived one review deferral and one Ship precondition without acquiring an owner; the seed is the third attempt."
  - "The blocker (two orphaned Auth0 state records failing `Pulumi Refresh`, tracked in #5169) was re-measured, reported, and deliberately not touched. `pulumi state delete` and Auth0 scope grants are destructive production-state changes outside this stage's authorization."
---

# Retro: `/public/v1/**` — the run met every criterion it set, and the defect is still live

**Verdict in one line.** The run succeeded at what it was authorized to do and
failed at what it exists for, and those are not in tension: its four success
criteria grade a _preparation_, and by construction none of them can go red while
the surface stays dead. All four are green. The surface is still dead — measured
again today, 119 days after the routes shipped and 3 days after the fix merged.

Calling this "success" would repeat, one level up, the exact mistake the run was
opened to fix: `ingress-coverage.test.ts` passed for three months over a 100%-dead
production surface, and this run's exit criteria passed for three days over the
same 100%-dead production surface. Calling it "failure" would be equally wrong —
`release.md` is unusually honest about its own state, the diagnosis is exact, the
regression test genuinely goes red on the defect, and the one thing standing
between merged and shipped is a human-gated blocker that this run did not create
and could not clear.

The useful output of this retro is neither label. It is: **the pipeline has no
state for "done but not delivered," and this run just proved it.** Once this file
exists the run is COMPLETE per the protocol (`retro.md` exists), with the defect
live, the apply unexecuted, and one review finding still without an owner.

## Ground truth, re-measured 2026-09-12T19:09Z

Both commands are the ones `release.md` puts at the top of itself so a reader can
tell "merged" from "shipped" without trusting prose. Both were run fresh:

```
$ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c /public
0                                  <- merged, NOT applied

$ doctl apps spec get … --format json | jq -r '.ingress.rules[]|"\(.match.path.prefix) -> \(.component.name)"'
/api/v1/users -> users-api
/api/gen -> agent-api
/v1/sessions -> agent-api
/v1/orchestrate -> agent-api
/v1/webhooks -> agent-api
/api -> reservations-api
/ -> users-api                     <- identical to the capture-day listing, 2026-08-24

$ curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://mattbutlerengineering.com/public/v1/venues/x
200 text/html                      <- edge gate still shut (marketing SPA)

$ curl -sS https://api.mattbutlerengineering.com/public/v1/venues/x
{"message":"Route GET:/public/v1/venues/x not found","error":"Not Found","statusCode":404}
HTTP 404 application/json          <- DO gate still shut (Fastify route-miss from users-api)

$ curl -sS -o /dev/null -w '%{http_code}\n' https://mattbutlerengineering.com/api/v1/venues   # control
401                                <- /api does proxy; the control is unchanged
```

The apply is blocked, and the block has not moved in three days:

```
$ gh run list --workflow pulumi-up.yml --branch main --limit 8
34676613113 failure    2026-09-12T05:50:36Z e929b3d2b
34675873114 failure    2026-09-12T05:33:08Z 7c5516959
34675776736 cancelled  2026-09-12T05:30:52Z 7c5516959
34675726842 cancelled  2026-09-12T05:29:54Z bf978d3b5
34674259495 failure    2026-09-12T04:55:21Z ad689377d
34665165637 failure    2026-09-12T01:33:16Z 754470f52
34656006414 failure    2026-09-11T22:55:02Z 17d8793d8
34650107003 failure    2026-09-11T21:35:19Z da0a01943

$ gh run view 34676613113 --json jobs
{"name":"Deploy Infrastructure","conclusion":"failure","failed":["Pulumi Refresh (Sync state with cloud)"]}

$ gh run view 34676613113 --log-failed | grep -i 'Insufficient scope'
auth0:index:Branding mattbutlerengineering-branding refreshing failed: 403 Forbidden: Insufficient scope, expected any of: read:branding: provider=auth0@3.51.0
auth0:index:Tenant   mattbutlerengineering-tenant   refreshing failed: 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings: provider=auth0@3.51.0
```

Same two orphan URNs, same provider, same step, three days on. `#5169` — the
open issue that tracks this failure — is still OPEN, last comment
`2026-09-09T18:44:39Z`. Nothing has happened.

**This blocks every infrastructure deploy on `main`, not just this run.**
`pulumi-up.yml` runs `refresh` unconditionally before `up`, so the entire IaC
delivery path has been dead since 2026-09-09T17:05Z. That is the single most
important fact in this document and it belongs to a human.

## Outcomes vs. intent

### Criterion 1 — a real `pulumi preview` shows the `/public` ingress rule being added to `digitalocean:index:App`, read and recorded

- What happened: **MET.** Two independent previews exist — `preview.txt` (run
  34379571653, SHA `02c8ecd0`) and the Ship-stage fresh run 34425499302 on
  `main` HEAD `6524f6aae`. Both render the App as `~ update` with the diff
  confined to `spec.ingress.rules`: `/public → reservations-api` inserted between
  `/api` and the `/` catch-all. The depth-2 `ignoreChanges` narrowing
  (`["spec.features","spec.jobs","spec.services"]`) was proven honored by the
  engine rather than assumed — which was the run's single largest open question
  at capture ("Pulumi's `ignoreChanges` path syntax for nested arrays has NOT
  been validated against this provider version").
- Signal strength: **measured** — but measured on a _plan_. A plan is a
  prediction about an apply that has not happened. This criterion cannot
  distinguish "the fix works" from "the fix would work."

### Criterion 2 — the preview reveals no unintended spec changes, or they are enumerated as the reason the apply is held

- What happened: **MET.** The Ship preview rendered 5 changes, not the 2 the run
  intends, and all five are enumerated with causes: the App ingress rule and the
  edge-router bundle (this run), the `mattbutlerengineering-gen` worker's
  `@pulumi/cloudflare 6.19.0 → 6.20.0` provider transition (#5167, unrelated),
  and two `- delete` rows for the orphaned Auth0 `Tenant`/`Branding` state that
  also cause the refresh failure. The capture-stage fear ("the spec has been
  unmanaged for months, the real diff may be large and scary") did not
  materialise: the narrowing held and nothing in `spec.services`/`jobs`/
  `features` churned.
- Signal strength: **measured.**

### Criterion 3 — `ingress-coverage.test.ts` is no longer vacuous

- What happened: **MET, and still holding.** Re-run today on `origin/main`
  (`0387fc3c2`) in a fresh worktree:

  ```
  $ pnpm --dir infrastructure/pulumi test
   ✓ ingress-coverage.test.ts (7 tests) 16ms
   ✓ index.test.ts (80 tests) 458ms
        Tests  87 passed (87)
  ```

  Verify had already demonstrated the other half — run against the pre-fix source
  (`9aaadd787`) the same file fails 4 of 7, naming each gate by mechanism rather
  than by assertion text. This is the one artifact of the run that will keep
  paying out whether or not the apply ever happens: the specific false green that
  hid this defect for three months cannot recur silently.

- Signal strength: **measured** (both directions demonstrated, not asserted).

### Criterion 4 — `release.md` records the exact apply steps, and nothing is applied

- What happened: **MET, and still literally true.** Seven numbered steps with
  commands and proofs, a rollback plan with a half-landed-apply branch, and
  nothing executed. Steps 0–6 are all still unexecuted three days later.
- Signal strength: **measured.** Note the shape: this criterion is _satisfied by
  the defect remaining live_. It is green today precisely because nothing
  shipped, and it would have to be rewritten before it could ever go red.

### The defect's own Expected — `/public/v1/**` reachable in production

- What happened: **NOT MET.** 119 days dead (routes shipped `ea99cad4b`,
  2026-05-16); 19 days since capture; 3 days merged-and-unapplied. The
  ground-truth block above is today's measurement.
- Signal strength: **measured**, on both hosts, with the `/api` control
  unchanged and the LAN-DNS sinkhole ruled out by the prior stages' `dig @1.1.1.1`
  cross-check.

### Is anyone actually suffering? — the honest answer

- **The gate the run built says yes, continuously.** `post-deploy-check.yml`'s
  `API Surface Invariants` job has failed on every run since the fix merged:
  since 2026-09-09T17:47Z, **12 failures, 12 cancelled, 36 skipped, zero
  successes**. Thirteen `API surface invariant breach` issues are open (#5168,
  #5171, #5173, #5181, #5195, #5197, #5198, #5220, #5222, #5223, #5229, #5231,
  #5237). Signal strength: **pattern** — thirteen independent filings, one cause.
- **Run today without CI's `--base`, the probe separates the two gates cleanly:**

  ```
  $ node scripts/check-api-surface-invariants.mjs      # no --base
  public-venue-lookup:reachable-at-origin    GET https://api.mattbutlerengineering.com/public/v1/…  404  wrong-service
  public-venue-lookup:reachable-through-edge GET https://mattbutlerengineering.com/public/v1/…      200  status-mismatch
  2 of 7 probes failed
  ```

  Signal strength: **measured.** The five non-`/public` probes pass, so the
  instrument is discriminating, not broadly broken.

- **Sentry says nothing, and that is not evidence of health.** Thirteen new
  issues in 7 days, every one `HTTP 429`, every one **0 users**, and the paths are
  credential-scanner probes hitting the `/` catch-all (`/.secrets.json`,
  `/.claude/.credentials.json`, `/actuator/env`, `/graphql`, `/gcp.json`). Not one
  relates to `/public`. **A failing booking widget cannot produce a Sentry event
  here by construction** —
  `apps/hospitality/src/hooks/useVenuePolicy.ts` still swallows the failure
  (verified on `origin/main` today):

  ```ts
  } catch {
    return null;
  }
  ```

  Signal strength: **anecdote, and specifically an anecdote that cannot bear
  weight.** Absence of errors from a surface whose only client discards its errors
  is not an observation about the surface. Any future reader tempted to read
  "Sentry is quiet" as "nothing is broken" should re-read this paragraph — that
  inference is exactly how a 119-day outage went unnoticed.

- **Realized harm, as far as any instrument here can see: zero.** Every Sentry
  issue reports 0 users; the only traffic reaching the catch-all is automated
  scanning; no human complaint exists anywhere in the record. The blast radius
  in `defect.md` is real (the whole booking widget, all guest self-service) and
  the unsubscribe-link half is latent, not live, because Resend is not configured
  in production. Signal strength: **anecdote** — "nobody complained" from a
  population that is, on this evidence, approximately nobody. It is a reason the
  119 days cost little, not a reason the fix matters less.

## Run retrospective

### Keep

- **Architect's independent re-measurement of the blast radius.** Capture
  measured one gate, concluded the DO ingress was the whole defect, and was wrong.
  Architect re-probed and found the Cloudflare edge worker never forwards
  `/public` at all — so the originally-scoped fix would have shipped, gone green,
  and changed nothing a user could observe. That single finding is the highest-value
  moment in the run, and it came from re-measuring a predecessor's evidence instead
  of inheriting it. Capture's own brief had said the apex host was the one the
  shipped bundle calls; nobody had checked.
- **Writing the "how a reader tells merged from shipped" commands into the top of
  `release.md`.** Two commands, no prose to trust. This retro's entire evidence
  base is those two commands re-run. It exists because the immediately preceding
  run's `release.md` claimed PREPARED-NOT-RELEASED for six days after it had
  actually shipped — a lesson that was learned, written down, and then paid out
  three days later in the opposite direction.
- **De-vacuuming the regression test before writing the fix, and demonstrating
  RED on the real defect source rather than asserting it.** Verify ran the current
  test against `9aaadd787` (the pre-fix `main`) and got 4 failures naming both
  gates by mechanism. That is the difference between a test and a claim about a
  test.
- **Leaving the breach issues open on purpose.** Ship's frontmatter records the
  reasoning explicitly: closing them before the apply lands "would hide the only
  automated signal that the surface is still dead." Three days later that decision
  is the reason this retro had outcome evidence at all.

### Change

- **Exit criteria that cannot go red while the defect is live.** All four of this
  run's criteria grade the preparation; criterion 4 goes further and is _satisfied
  by nothing shipping_. That is a defensible way to grade an authorized
  prepare-and-stop, and it is also structurally identical to the vacuous test this
  run existed to kill. A prepare-and-stop maintenance run should be required to
  carry a fifth criterion that stays explicitly unmet, names its owner, and has a
  carrier outside the run — because the run's own artifacts stop being read the
  moment `retro.md` lands.
- **A review's "deferred" has no carrier, and one evaporated in this run.**
  `review.md` classified the `--base` probe gap MAJOR and deferred it "to a
  follow-up Implement work item / `ready` issue." `release.md` carried it as
  precondition-to-trust and release step 5. **No issue was ever filed.** Searched
  today: `check-api-surface-invariants` → the drift-bot and one unrelated 2026-08
  issue; `reachable-through-edge` → only the thirteen breach issues; nothing names
  the gap. The workflow still runs `--base https://api.mattbutlerengineering.com`
  (`post-deploy-check.yml:206-207`, unchanged on `main`), so the moment the apply
  lands the gate will verify the DO half twice and the Cloudflare half never, and
  report green. A finding recorded only in a run artifact is a finding with a
  half-life of one run.
- **The over-merge's predicted cost landed, and the response was to mute the
  signal rather than act on it.** #4565 merged all of Milestones 1–3 past the
  brief's single-merge authorization; `breakdown.md` predicted the consequence and
  `review.md` recorded it as accept-as-is. Twelve SHA-keyed breach issues followed
  in 36 hours. What happened next is the part worth keeping: a separate automation
  session filed and shipped #5189 → #5236 (`fix(automation): dedupe
post-deploy-check issues by failure signature, not commit SHA`), which stopped
  the flood at #5237. Correct fix, wrong reading of the event — the volume was a
  true alarm about a dead production surface, and it was processed as issue-tracker
  noise. Nobody who saw twelve issues in 36 hours went and looked at what they said.
- **The blocker needs escalating, not recording.** The Auth0 orphans (#5169) have
  blocked _every_ `pulumi-up` on `main` for three days. This run reported it
  precisely and correctly and then closed. Nothing in the pipeline escalates a
  human-gated blocker that outlives the run that found it.

### Stop

- **Reading "run complete" as "defect fixed."** The protocol's completion rule is
  deliberately mechanical (`retro.md` exists). For a maintenance run under
  prepare-and-stop it is actively misleading, and this is the run that proves it:
  every artifact green, every criterion met, defect 100% live.
- **Treating "Sentry is quiet" as an outcome signal on any surface whose client
  swallows its own errors.** Named here because this run's defect was invisible for
  119 days for exactly that reason, and the temptation recurred while writing this
  retro.

## Idea seeds

Appended to `docs/backlog.md` (append-only; the two seeds this run already
contributed at lines 54 and 56 were not touched or duplicated).

- Make a maintenance run that ends with its defect still live say so in a place
  that outlives the run — a required, explicitly-unmet exit criterion naming an
  owner and a tracked carrier.
- Give a review's `deferred` finding a carrier that survives run close — the
  `--base` gap survived a MAJOR classification and a Ship precondition and still
  has no issue.
- Fix the `--base` override so the post-apply gate actually probes the edge.
- Assert declared-vs-live infrastructure after every apply, the way this run's
  probe now asserts declared-vs-live API surface.
- Treat `pulumi up` reporting `success` with the App `unchanged` on a commit that
  changed the App resource as a detectable contradiction, not a green.
- Make a silent-degradation `catch` on a network boundary report before it
  degrades.
- Escalate a human-gated blocker that outlives the run that found it — #5169 has
  blocked every infra deploy on `main` for three days.
- Read a burst of identical auto-filed issues as an alarm before deduping it.

## Run complete

Closed 2026-09-12 with the defect live and the apply unexecuted. This is a
_complete_ run, not a _delivered_ fix, and the distinction is the point.

> **Correction (2026-09-12, same day).** This document first named **#4848** as
> the blocker to unblock. That was wrong, and the error came from the
> orchestrating session, not from the evidence gathered here. #4848 is
> "[Audit] UX: Auth0 login page exposes raw dev tenant ID and stock branding" —
> the _feature request_. The chain this retro measured is correct and unchanged:
> #4924 implemented it and created `auth0:index:Branding` and
> `auth0:index:Tenant`; revert #5165 removed the source and left the two state
> records orphaned. The open issue that actually tracks the resulting
> `Pulumi Refresh` failure is **#5169** ("Pulumi Deploy failing on Auth0 403
> Insufficient scope"), and every pointer above now names it. Nothing else in
> this retro changed; the measurements stand.

**Outstanding, in priority order — all need a human:**

1. **#5169 — unblock `Pulumi Refresh`.** Two orphaned Auth0 state records
   (`Tenant`, `Branding`, created by #4924, source removed by revert #5165) 403 on
   every refresh. Blocks every infrastructure deploy on `main`, not only this fix.
   Options and exact commands: `release.md` step 0.
2. **`release.md` steps 1–4 — the apply.** Serialization check, fresh preview on
   the HEAD to be applied, `pulumi-up.yml`, post-apply probes on both hosts. The
   discriminator is the body: `Venue not found` means reservations-api answered;
   `Route GET:… not found` means the DO gate is still shut.
3. **The `--base` fix (`release.md` step 5)** — land it before trusting a green
   `API Surface Invariants` run to have verified the edge half. Seeded above; no
   issue exists.
4. **`release.md` step 6** — close the thirteen breach issues once step 4 passes.
   They are deliberately open until then.

Seeds above are the input to the next Idea-stage run.
