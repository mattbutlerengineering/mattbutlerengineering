---
stage: operate
run: maintenance:sentry-dsn-static-builds
date: 2026-08-17
---

# Retro: Sentry build env for the marketing and rialto-web deploys

## On letting it breathe

The release is ~20 minutes old, so the honest split is:

- **Measurable now, and measured:** the DSN is live in both bundles. That is a
  deterministic property of the deployed artifact, not a usage trend — waiting
  a week would not make it truer.
- **Not measurable yet:** whether real errors arrive, and whether their stack
  traces are readable. Those need production traffic and an actual exception.

Writing the retro now rather than deferring it, because the run's central claim
("these two apps can report errors") is fully settled, and the open half is
better carried as backlog seeds than as an open run. Flagged explicitly so this
isn't read as "verified end to end."

## Outcomes vs. intent

### Intent: marketing and rialto-web report client-side errors to Sentry

- **What happened:** both deployed bundles went from 0 → 1 occurrences of the
  Sentry ingest host, with new content hashes, while the hospitality control
  bundle stayed byte-identical (`index-DrccHO7c.js` before and after). The
  inlined values are well-formed DSNs (32-char key, same org/project as
  hospitality's) pointing at an origin already allowed by production's CSP
  `connect-src`.
- **Signal strength:** **measured** for "the DSN reaches the browser".
  **Unverified** for "an event is ingested" — no error has been deliberately
  thrown on production to prove the round trip.

### Intent: this class of drift cannot silently recur

- **What happened:** `scripts/__tests__/deploy-static-sentry-env.test.mjs`
  parses the real workflow and fails, naming the app, if any static app's build
  step loses the Sentry env. Verified against the pre-fix workflow — it flags
  marketing and rialto-web with all four variables absent while hospitality
  passes.
- **Signal strength:** **measured**, though only against the two known-bad
  states. Its behavior on a genuinely new fourth app is reasoned, not observed.

### Intent (implicit): the fix is actually in production, not merely merged

- **What happened:** it very nearly wasn't. See Keep, below.
- **Signal strength:** **measured** — the absence of a `deploy-static` run for
  the merge SHA is a checkable fact, and it was checked.

## Run retrospective

**Keep**

- **Probing the deployed surface both before and after.** The before-numbers
  (0/0/1) are what made the after-numbers mean anything. A post-only check
  showing "1" would not have distinguished a fix from a pre-existing state.
- **Writing the guard first, at the first fix.** This run existed _because_ the
  previous run's retro named this exact failure shape (fixed in one app, not
  the sibling). Acting on that seed cost about ten minutes here and produced
  the finding below.
- **Using the hospitality build as a control.** Its unchanged bundle hash is
  the single strongest piece of evidence in the run, and it was free.
- **Reviewing my own diff seriously.** The review found a **major** defect in
  the guard: a substring check would have false-passed on a comment merely
  naming the variable — green on precisely the case it exists to catch. The
  guard was the run's whole preventive value; shipping it broken would have
  produced a worse state than shipping nothing, because a false green stops
  anyone looking again.
- **Checking whether the merge actually deployed.** `deploy-static.yml`'s push
  filter covers `apps/**` but not `.github/**`, so a change _to the deploy
  workflow_ does not deploy itself. Verified there was no run for the merge SHA
  and dispatched explicitly. Reading "merged, CI green" as "live" would have
  been wrong, and would have looked right.

**Change**

- **Scope the fix from the code path, not from the seed text.** The seed named
  `VITE_SENTRY_DSN` only. Reading `vite.config.ts` showed three more variables
  gated by `disable: !process.env.SENTRY_AUTH_TOKEN` on the same root cause.
  Shipping the seed as literally written would have produced reports with
  unreadable stack traces and looked complete. Widened at Capture — but only
  because the config was read; nothing in the process forced that.
- **Corrections belong in the artifact.** The first draft of `defect.md` said
  both siblings had no `env:` block; marketing's exists and holds
  `VITE_BUILD_ID`. Corrected in place with a dated note rather than silently
  overwritten, so the brief doesn't read as more precise than the investigation
  was.

**Stop**

- **Trusting `pnpm exec prettier` / bare tool invocations without pinning the
  resolved config, and unquoted variables in `for` loops.** Hit the zsh
  no-word-splitting trap again mid-run (`for b in $bundle` treated two paths as
  one word and silently probed nothing). Both are known, both were recorded,
  and both still cost time. The pattern to stop is running a verification
  command whose _failure mode is a false green_ without first proving it
  matched anything.

## Idea seeds

Appended to `docs/backlog.md`:

- Alert when a Sentry project receives **zero** events for N days — this outage
  lasted 4.5 months and the only symptom was silence, which is indistinguishable
  from health.
- Make a change to a deploy workflow deploy itself — `deploy-static.yml`'s push
  filter excludes `.github/**`, so the fix to a deploy pipeline is exactly the
  class of change that never ships on merge.
- Prove the Sentry round trip end to end, once, per app.
- Confirm source maps actually upload and produce readable traces.
- Audit `deploy-static.yml` for other per-app build-env drift.

## Run complete

**2026-08-17.** Capture → Implement → Verify → Review → Ship → Operate, all
artifacts present. Three of three work items checked, the third against
production evidence rather than a merge trailer.

The preventive finding, stated plainly for the next run: **a fix to a deploy
pipeline does not deploy itself.** The previous run's lesson was "sweep sibling
apps"; this run's is "verify the artifact users receive actually changed,"
because merge-green and CI-green are both fully compatible with production
never having moved.
