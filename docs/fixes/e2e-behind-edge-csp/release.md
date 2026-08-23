---
stage: ship
run: maintenance:e2e-behind-edge-csp
date: 2026-08-22
assumptions:
  - "The autorun brief authorized no externally visible release action, so ship would ordinarily prepare and stop. Merging to `main` was performed under the session's separate standing instruction to complete this run, and is the ONLY release action taken: nothing was deployed by hand, no package was published, no tag was cut, and `.changeset/` was not touched. The change has no production surface — it adds a test harness and a CI path filter — so merge is the whole of its release."
  - "The F1 path-filter fix is verified as present and correct by reading the merged workflow, not by observing a run it triggered. No commit touching `infrastructure/worker/**` has landed since the filter was added, so the specific trigger it exists to catch has not yet fired in anger. Recorded below as wired-but-not-yet-exercised rather than as verified end to end."
---

# Release: E2E behind the real production CSP

## What shipped

PR [#4476](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4476),
squash-merged to `main` as **`c2686caa`** on 2026-08-23T04:01Z.

Fourteen commits, closing the condition recorded in `defect.md`: `apps/rialto-web`'s
Playwright suite ran against `vite dev`, which sets no `Content-Security-Policy` header
at all, so every CSP-caused defect in that app was invisible to E2E **by construction**.

- `apps/rialto-web/e2e/support/edge-csp.ts` — fixture that imports the **real** policy
  from `@mbe/edge-worker/csp.js` (not a copy) and reproduces the edge's per-request
  nonce injection.
- `apps/rialto-web/e2e/csp.spec.ts` — A1/A2/A3 assertions across five routes.
- `apps/rialto-web/playwright.csp.config.ts` — a second config serving **built** output;
  `playwright.config.ts` `testIgnore`s the spec so it can never run under the policy-free
  server by accident.
- `.github/workflows/rialto-web-e2e.yml` — builds `apps/rialto-web` and runs the CSP
  suite in the `functional` job, and (the F1 fix) adds `infrastructure/worker/**` to both
  the `push` and `pull_request` path filters.

## Pre-flight

| Check                         | Result                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Verify stage evidence         | `verification.md` (593 lines) — real commands, quoted output                                 |
| Review stage                  | `review.md` — 1 major (**fixed in-stage**), 2 minor + 1 nit (deferred with reasons)          |
| Critical findings outstanding | none                                                                                         |
| `CI Gate`                     | `green` via `scripts/ci-gate-status.mjs check --pr 4476`                                     |
| Generated artifacts           | `llms.txt`, `llms-full.txt`, `dep-graph.json` regenerated and committed; Integrity job green |
| Release actions withheld      | deploy, publish, tag, changeset — none applicable, none taken                                |

## Outcome

**The guard runs, and it ran.** This is the check the repo's own _shipped ≠ run_ rule
demands, and it is the reason this section is written after the merge rather than before.

CI run [32616179962](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/32616179962),
job `Functional (rialto-web)`, step 10 — _Run CSP e2e tests (built output, real edge
policy)_ — `completed/success`:

```
Running 8 tests using 1 worker
········
  8 passed (9.4s)
```

Step 9 (`Build rialto-web`) succeeded before it, so the suite genuinely ran against
bundled, minified output rather than a dev module graph. The pre-existing functional
suite passed alongside it: `57 passed (1.7m)`. The push run on `c2686caa`
([32616796633](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/32616796633))
was still in progress at the time of writing; the PR run above executed the identical
step list on the identical tree.

### The guard has been observed failing

The distinction that makes this worth shipping: the suite was deliberately broken four
ways during Verify — including under the exact pre-fix condition of no CSP header at all
— and went red every time. Most tests have only ever been seen passing. This one has been
shown to do its job.

### What is wired but not yet exercised

The F1 fix — `infrastructure/worker/**` in the workflow's path filters — is present in
the merged file and correct by inspection. It has not yet been _triggered_, because no
commit touching that directory has landed since. The first edit to a CSP directive in
`infrastructure/worker/csp.js` will exercise it; until then this is a wiring claim, not
an end-to-end one. Without it, editing a directive — the change most likely to break the
app under CSP, and the cause of both the zero-web-fonts outage and the blocked Sentry
envelopes — would not have run the guard that exists to catch it.

### Deferred, and why they are safe to defer

- **A flake earlier in the `functional` job silently removes CSP coverage.** Sharing the
  job is a deliberate cost tradeoff (~2–3 billed minutes per run). The consequence is now
  written down, which was the missing part; re-litigating the tradeoff is not this run's
  job.
- **The guard is advisory, not blocking.** `Rialto Web E2E` is not a required status check
  — `required_status_checks.contexts` on `main` is exactly `["CI Gate"]`, measured
  2026-08-22 — so a red CSP suite fails the _run_ without blocking the _merge_. The run's
  stated target state ("a CSP refusal fails the run") is met; the stronger guarantee is
  branch-protection state, not repo code, and is the repo owner's call.
- **`@mbe/edge-worker/csp.js` relies on legacy subpath resolution.** Works today, proven
  by Verify. Pre-emptively adding an `exports` map to a package that does not need one is
  exactly the just-in-case change this repo's guidelines forbid.

## Release actions withheld

None were applicable and none were taken: no deploy (`doctl`/`wrangler` untouched), no
`npm publish`, no tag, no `.changeset/` entry, no `pnpm version-packages`.

Unrelated but worth carrying forward, because it was measured while checking this
section and is not what I first assumed: **six pending changesets sit in `.changeset/`**
(`daterange-iso-vocabulary`, `daterangepicker-popover-field`,
`meter-indeterminate-segmented-name`, `remove-auth-mascot`, `remove-radial-gauge`,
`toast-mobile-width-overflow`) and **none of them is the TapeChart change**. `e4c30808`
added no changeset, and no changeset in the directory mentions TapeChart at all.

So the next release publishes `@mattbutlerengineering/rialto` (currently `0.2.0`) with a
changelog covering six other things, while the TapeChart overlaps work — which added a
public `classifyOverlap` prop, an `overlap` field on every positioned bar, and a
row-height behavior change — ships undocumented. That is a gap in the _previous_ run, not
this one, and creating a changeset is outside this session's authorization; it is recorded
here and seeded to `docs/backlog.md` rather than fixed silently.

## Next

The run is shipped, not complete. Complete requires `retro.md`.
