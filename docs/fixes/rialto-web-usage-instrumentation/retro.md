---
stage: operate
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-20
assumptions:
  - "No live user. The stage interview was answered from autorun-brief.md and the run's seven predecessor artifacts. Every command and probe quoted below was executed from the worktree .claude/worktrees/rialto-usage-retro on branch docs/rialto-web-usage-retro (created from origin/main at b29551ece), in two windows — 2026-09-18T05:00Z and 2026-09-20T03:00Z, the host having slept between them. Every volatile signal (the deploy-run tallies, the live HTTP probes, the Sentry queries, the live cookie dialog and privacy copy, the blocked read path) was re-measured in the second window and the second window's numbers are the ones quoted below; the single observation belonging only to the first window is labelled inline. nothing is transcribed from release.md's post-release addendum, and every claim the addendum makes that could be re-measured here was re-measured rather than inherited."
  - "'Let it breathe' (operate SKILL.md step 3): taken as proceed-now rather than defer. The apply landed 2026-09-14T04:40Z and this retro is written ~2026-09-20T03:00Z — just under six days later. Deferring was considered and rejected on a measurable ground, not a schedule: the one signal more waiting would add is the usage number, and that number is blocked on a credential that does not exist, not on elapsed time. More days produce more unreadable rows, not more evidence."
  - "The read path is recorded as UNMEASURED and stays that way. `scripts/edge-usage.mjs` needs a Cloudflare API token carrying Account · Account Analytics · Read; the script's own header states this is not the scope of `MBE_CLOUDFLARE_API_TOKEN`, and `Object.keys(process.env).filter(/CLOUDFLARE/)` returned `[]` in this environment. No usage number is estimated, inferred, or extrapolated anywhere in this artifact, and no credential was sought — reading a service `.env` for production credentials is forbidden here and would have been unjustified anyway."
  - "Signal-strength labels are this stage's own judgement, applied per the skill's anecdote-vs-pattern rule. 'No complaints' is labelled as an absence of signal over a population of one, never as evidence of health."
  - "Seeds: four appended to docs/backlog.md. Four further candidates were NOT appended because existing lines already carry them — line 88 (prepare-and-stop runs are not reconcilable), line 124 (a deferred review finding needs a carrier that survives run close), line 136 (the SPA has no signal separating 'nobody used it' from 'it worked'), line 137 (PrivacyPage copy contradicts the shipped UI). Each is cited in place instead. Backlog line 140 ('Enable Cloudflare Analytics Engine once on the account') is satisfied in the world as of 2026-09-14 but left unedited: the protocol's seed-backlog rule is that producers append well-formed entries and never rewrite existing lines."
  - "Prepare and stop. This stage committed, pushed one branch, and opened one pull request against `main`. No merge, no auto-merge, no deploy, no apply, no tag, no publish, and — per the brief's Tracker policy — no issue created, edited, commented on, labelled or closed."
---

# Retro: the counter counts, and nobody can still read it

The run's bet was that rialto-web usage was invisible because a shipped
mechanism had never executed. The bet was right about the mechanism and the run
fixed it: the binding is applied, stable across twenty-nine subsequent applies, and
writing. The bet's _purpose_ — that a future retro could quote a number — is
unmet. **This retro is the first Operate stage in the repo since the apply, and
it cannot quote one either.** That is the honest headline.

## Outcomes vs. intent

### Intent 1 — the Pulumi `WorkersScript` carries an `ANALYTICS` binding on `edge_requests`, in production

- **What happened:** applied 2026-09-14T04:40Z and unchanged ever since. The
  source-side guard passes today:

  ```
  $ node scripts/check-analytics-bindings.mjs; echo "exit=$?"
    infrastructure/worker/wrangler.toml:        [ANALYTICS → edge_requests]
    infrastructure/pulumi/index.ts:             [ANALYTICS → edge_requests]
    infrastructure/worker/analytics-schema.js:  [ANALYTICS → edge_requests]
  PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the
  Analytics Engine binding (ANALYTICS → edge_requests).
  exit=0
  ```

  The live side is stronger, because Pulumi re-reads the real script on every
  run. Since the apply there have been **30 `pulumi-up.yml` runs on `main`: 29
  `success`, 1 `cancelled`, 0 failures** (oldest `2026-09-14T04:38:48Z` — the
  apply itself; newest `2026-09-20T01:00:31Z`). Four sampled across that window
  — `35024287754` (09-15), `35186774321` (09-17), `35296275312` (09-18) and
  `35480253745` (09-20, the newest) — each report `Pulumi Up: 18 unchanged`
  (and, on the three read at refresh level, `Pulumi Refresh: 16 unchanged`),
  with `cloudflare:index:WorkersScript mattbutlerengineering-edge-router`
  present and carrying no diff. A binding that had drifted off the live script
  would surface as a `~ 1 updated` on the next apply, exactly as the original
  apply did.

- **Signal strength: pattern.** Twenty-nine independent applies over six days,
  four logs read at job/step level rather than at the workflow rollup.

### Intent 2 — somebody can answer "did anyone use `/rialto/<route>` last week?"

- **What happened: no. Still unanswerable, for a different reason than before.**
  The dataset exists and is accruing; the read path has never executed.

  ```
  $ node scripts/edge-usage.mjs; echo "exit=$?"
  Missing required environment variable: CLOUDFLARE_API_TOKEN
  exit=1

  $ node -e 'console.log(JSON.stringify(Object.keys(process.env).filter(k=>/CLOUDFLARE/i.test(k))))'
  []
  ```

  The exact human step that closes this is release.md step 6, unchanged and
  still unperformed: Cloudflare dashboard → My Profile → API Tokens → Create
  Token → Custom token → Permissions **Account · Account Analytics · Read**,
  scoped to the one account; then
  `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/edge-usage.mjs --days 7`.
  Full instructions in [`docs/runbooks/edge-usage.md`](../../runbooks/edge-usage.md)
  § Token provisioning.

- **Signal strength: measured — as a failure, not as a number.** The blocked
  read is measured. The usage figure is **NOT MEASURED** and is deliberately
  absent from this artifact. Just under six days of `edge_requests` rows have
  now accrued that nobody in this repo can read, including the rows this
  retro's own live probes generated.

- **Worth stating once, because it is the run's own defect shape in miniature:**
  `scripts/edge-usage.mjs` (246 lines, 23 tests) is itself a shipped-and-never-
  executed consumer. review.md Minor 2 named it, release.md named it twice, and
  it is still true. The run ended one instance of shipped≠run and opened
  another, smaller one.

### Intent 3 — the cookie banner no longer offers a preference that governs nothing

- **What happened:** shipped and still correct six days on. Re-verified live at
  2026-09-20T03:29Z, and identically at 2026-09-18T05:01Z — not inherited from
  the addendum. On
  `https://mattbutlerengineering.com/rialto/demos/login`, the Cookie Preferences
  dialog contains **exactly three switches** — `Essential` (checked, disabled),
  `Functional`, `Marketing`. No Analytics switch, and no analytics row in the
  dialog body.
- **Unplanned bonus evidence, and the nicer find (first measurement window only
  — that probe cleared the key, so the second window found `null`):** the
  browser profile used for the probe still held a _pre-change_ consent value written by an older build —
  `{"consented":true,"preferences":{"essential":true,"analytics":false,"functional":false,"marketing":false}}`.
  It parsed without error and the app rendered normally. That is verification
  criterion T4's backward-compatibility case (`a stored value carrying the old
key still parses`) exercised against the real deployed bundle rather than in a
  unit test.
- **Signal strength: measured** for the three toggles; **anecdote** for the
  legacy-value parse — one browser profile, one workstation.

### Intent 4 — no harm from switching on a never-executed call in the hot path of every route

This is review.md Major 1's risk, and the reason the fix-up pass wrapped
`writeAnalytics`'s `writeDataPoint` in try/catch before Ship.

- **What happened:** nothing bad, measured four ways.
  - Every edge-fronted surface answers 200 today: `/`, `/hospitality`,
    `/rialto/`, `/gen`, and `api.mattbutlerengineering.com/health`.
  - Sentry, org `mattbutlerengineering`, `errors` dataset, `url:*/rialto/*`,
    last 14 days: **no results**. Org-wide issue search over the same window
    returns 21 issues, **zero** of them on a rialto-web URL — they are
    `agent-api`, `users-api`, `reservations-api` and `hospitality` (429 health
    probes, a Prisma tracing TypeError, the known-expected HOSPITALITY-7 401).
  - `deploy-static.yml` on `main` since 2026-09-13: **30 runs, 30 success**.
  - The 29 green applies above would have gone red on a Worker that failed to
    deploy or boot.
- **Signal strength: pattern** for "the change did not break production."
  **Absence of signal, not evidence,** for anything user-facing beyond that:
  nobody has complained, and the population that could complain is one person
  who already knows what shipped. rialto-web's deployed bundle _does_ carry a
  Sentry DSN, so an uncaught error would report — but
  `packages/sentry/src/react.ts` still inits with `integrations: []`, no
  tracing, replay sample rates 0, so Sentry is an error channel and not a usage
  channel. "Zero Sentry events" therefore says nothing whatsoever about traffic.
  That gap is already seeded at `docs/backlog.md` line 136.

### Intent 5 (unintended) — the run shipped a live contradiction, and it is still live

review.md Minor 3 predicted it; today it is measured in production. On
`https://mattbutlerengineering.com/rialto/privacy`:

> "When you visit this site, we may collect anonymous usage data via analytics
> cookies…"
> "Essential cookies are required for the site to function. **Analytics and
> functional cookies are optional and only set with your consent.** You can
> change your preferences at any time using the cookie banner."

Both sentences are now wrong in both directions: the banner offers no analytics
control to change, and the site's actual counting is server-side at the edge
with no cookie and no consent gate. A visitor reading the policy is told the
opposite of the mechanism. It is copy, not a defect in code, and it is already
seeded unclaimed at `docs/backlog.md` line 137 — this retro does not duplicate
the seed, it upgrades its status from "predicted at review time" to **confirmed
live in production**.

- **Signal strength: measured.**

### Intent 6 — "a future retro quotes the number"

- **What happened: no retro has had the chance.** The newest `retro.md` anywhere
  in the repo before this one is `docs/fixes/pulumi-refresh-blocks-apply/retro.md`
  (last commit 2026-09-13), i.e. _before_ the apply. No run has closed in the
  six days since. So the mechanism's only intended consumer has had exactly one
  opportunity to fire — this artifact — and it fires empty.
- The pointer the run shipped does exist and is wired into a human routine:
  `docs/PLAYBOOK.md:972` now reads "Am I building what users actually want?
  (Check analytics → `docs/runbooks/edge-usage.md`, feedback, support
  requests)". Nothing automated reads the dataset on a schedule; the number is a
  manual pull, gated on the missing token.
- **Signal strength: measured (as an absence).**

### Not measured, and why

| Question                                                                  | Status           | Why                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How many requests hit `/rialto/*` in the last 7 days?                     | **NOT MEASURED** | No token with Account · Account Analytics · Read exists in this environment. Not estimated, not inferred.                                                                                                                                                                                                                               |
| Does `buildUsageQuery`'s SQL actually parse against Cloudflare's SQL API? | **NOT MEASURED** | Same blocker. Every request-shape claim in the run remains against a stub `fetch`. release.md: a failure here re-opens the run.                                                                                                                                                                                                         |
| Did any human visit the showcase, as opposed to CI and this agent?        | **NOT MEASURED** | That is precisely what the unreadable dataset would answer.                                                                                                                                                                                                                                                                             |
| Is the Cloudflare Web Analytics beacon refused by the edge CSP?           | **NOT MEASURED** | Out of scope by the brief; seeded at line 101. The browser console error for `static.cloudflareinsights.com` observed today is **not** evidence either way: `dig static.cloudflareinsights.com` returns `0.0.0.0` on this workstation's resolver while `dig @1.1.1.1` returns `104.16.79.73`. LAN sinkhole, not production. Not seeded. |

## Run retrospective

### Which stage earned its keep

**Capture, decisively.** The condition brief identified the true mechanism from
the repository alone — that `wrangler.toml` is dead configuration on the deploy
path and Pulumi owns the bindings array — and it enumerated four _other_ things
that look like instrumentation so that none of them could be mistaken for the
fix. Three and a half months of invisibility ended because someone wrote down
which of five candidates was real.

**Verify, on one specific move.** T2 did not assert that a drift guard exists;
it mutated each of the three sources in turn, watched the guard go red, and
restored them. That is why review.md could then find the _one_ mutation the
guard misses (Minor 1) instead of trusting it wholesale.

**Review, on Major 1.** Wrapping `writeDataPoint` in try/catch was five lines,
found before the apply rather than by a visitor meeting a Cloudflare 1101 page
on every route of the domain. The measured absence of breakage in Intent 4 is
the payoff for a finding that cost almost nothing.

### What dragged

**Ship, and the shape of prepare-and-stop.** The stage produced an accurate,
heavily-measured release plan that a human then executed over two days — and the
plan was still missing the precondition that actually stopped it twice. Three
artifacts' worth of planning could not see it (below). The stage then needed an
addendum bolted on two days later to stop `release.md` from claiming "PREPARED,
NOT RELEASED" about a thing that had shipped — the second run in this repo to
hit that exact write-back hole (`docs/backlog.md` line 88 records the first,
`visual-tolerance-threshold`, which claimed it for six days).

**The external block.** The run sat behind #5169 — a total IaC delivery outage
owned by nobody — from Verify through merge. It was not this run's defect and
the run correctly refused to route around it, but it is the second-largest
contributor to the elapsed time between a correct diff and a live binding.

### The precondition nobody could have planned for — and the general lesson

The first two applies (`34801283091`, `34802756625`, both `workflow_dispatch`,
both `Deploy Infrastructure: failure`) died byte-identically on Cloudflare error
**10089, "You need to enable Analytics Engine"**. Analytics Engine had never
been switched on for the account. The third (`34806823155`) succeeded within
minutes of Matt creating the dataset by hand.

The interesting part is _why_ no stage caught it. The Pulumi unit test asserts
the binding is in the plan. `pulumi preview` (verification L1, read-only)
asserts the plan reaches the real stack. Both are plan-level checks, and **a
plan-level check cannot see an account-level capability that has never been
exercised** — the `wrangler.toml` declaration had sat unused since 2026-05-22
precisely because it never deployed, so nothing in the repo's history had ever
touched the feature flag. The tell was available in hindsight and is worth
naming: _identical_ failures on two dispatches is the signature of a
precondition, not a flake. Two identical failures should stop a retry loop and
start a capability check.

### The finding that nearly fell out of the run

review.md Minor 1 — the drift guard's S2 regex is global over
`infrastructure/pulumi/index.ts` and never asks _which resource_ the
`analytics_engine` literal sits in, so moving the binding from the edge router
to the `gen` worker leaves the guard green while production is unbound — was
routed by Review to "a `docs/backlog.md` seed", declined by Ship as out of its
instructed scope, and flagged in `release.md` § Flagged for human review as
"it needs a home". It crossed two stage boundaries with no carrier. Operate is
the last stage of the run: if this artifact did not write the seed, nothing
would. **It is now seed 1 below.** The class is already on the backlog at line
124; this is its second instance, which is itself the finding.

### Keep / Change / Stop

- **Keep:** the condition-brief form for shipped≠run defects. This is the repo's
  third instance of the class (`sentry-dsn-static-builds`,
  `backend-observability-blackout`, this run) and the brief format found the
  mechanism each time.
- **Keep:** proving a guard by mutating its inputs rather than by asserting its
  existence.
- **Keep:** declaring a run's own never-executed paths in the artifact instead
  of hiding them. The run named `edge-usage.mjs` as an unexecuted consumer in
  four separate artifacts, which is the only reason this retro can be exact
  about what is still missing rather than vaguely optimistic.
- **Change:** when a run's _value_ depends on a credential nobody holds, make
  acquiring it work item 1, not release step 6. The binding has been live for
  six days and the run's headline question is still unanswered for want of one
  dashboard visit.
- **Change:** before an apply that first exercises a cloud capability the
  account has never used, check the capability is enabled. Treat two
  byte-identical apply failures as a precondition signal and stop retrying.
- **Change:** give a deferred review finding its carrier at the moment of
  deferral, in the same sentence that defers it. "Route: backlog seed" that no
  stage is scoped to write is not a route (backlog line 124, second instance).
- **Stop:** reading "the unit test asserts the binding" as evidence the apply
  will succeed. It is evidence the plan is right, and the plan was right both
  times the apply failed.
- **Stop:** closing a prepare-and-stop Ship stage without a write-back path.
  Two runs now have shipped artifacts that lied about their own outcome for
  days (backlog line 88).

## Idea seeds

Appended to `docs/backlog.md` (append-only, per the protocol):

- Scope the drift guard's `analytics_engine` regex to the edge-router resource —
  review.md Minor 1, unowned across two stage boundaries.
- Provision the Account · Account Analytics · Read token and run
  `scripts/edge-usage.mjs` for the first time — the run's only end-to-end
  evidence, still missing six days after the apply.
- Check account-level cloud capability enablement before the first apply that
  uses it — the generalized form of the 10089 stop.
- Make a run surface credential preconditions as work items at Capture or
  Architect, not as release steps.

Four further candidates were matched to existing backlog lines and cited rather
than duplicated: line 88 (prepare-and-stop reconciliation), line 124 (deferred
finding carrier), line 136 (SPA usage signal), line 137 (PrivacyPage copy).
Line 140 ("Enable Cloudflare Analytics Engine once on the account") was
satisfied on 2026-09-14 and is left unedited, because producers append and never
rewrite.

## Run complete

Closed 2026-09-20. The defect this run was opened against — instrumentation that
shipped and never ran — is fixed and proven fixed. The question that motivated
it — "did anyone use `/rialto/<route>`?" — is still unanswered, now for a
one-step reason instead of an architectural one. The seeds above are the input
to the next Idea-stage run; the first of them is what turns this run's machinery
into an outcome.
