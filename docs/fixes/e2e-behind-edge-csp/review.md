---
stage: review
run: maintenance:e2e-behind-edge-csp
date: 2026-08-22
assumptions:
  - "Reviewed inline rather than via a dispatched review subagent. Two subagents died mid-stage earlier in this session (one on an API quota error, one on a 600s stall watchdog) and a stalled reviewer fails open — it returns nothing and reads identically to a clean pass. Inline keeps the failure mode visible."
  - "F1 was fixed during this stage rather than routed back to Implement. It is a one-line paths-filter addition to a workflow the run already owns, and it lands on the mechanism the run exists to produce; routing it would have cost a full stage round-trip for a change smaller than its own commit message."
---

# Review: rialto-web E2E behind the real edge CSP

## Scope

The diff from `origin/main` to `fix/e2e-behind-edge-csp`, after merging
`origin/main` in (the branch had drifted 27 commits behind while unshipped).

Ten commits, +1,635 / −12 across 18 files. The substance is five files:

| File                                       | What                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `apps/rialto-web/e2e/support/edge-csp.ts`  | the fixture — routes documents through the real policy, records violations             |
| `apps/rialto-web/e2e/csp.spec.ts`          | A1/A2/A3 over five routes, the A4 negative self-test, and three fixture-contract tests |
| `apps/rialto-web/playwright.csp.config.ts` | second config serving **built** output via `vite preview`                              |
| `.github/workflows/rialto-web-e2e.yml`     | build + CSP steps in the existing `functional` job                                     |
| `apps/rialto-web/package.json`             | `@mbe/edge-worker` devDependency, so the policy is imported, not copied                |

The rest is generated artifacts (`llms.txt`, `llms-full.txt`, `dep-graph.json`,
`pnpm-lock.yaml`) and the run's own documents.

Verify preceded this stage and reported 10 criteria, 10 PASS. Per the
protocol's maintenance scaling, this pass did not re-run what Verify covered;
it read the code cold and looked for what a green suite cannot see.

## Findings

### Major: the guard did not run when the CSP itself changed

- **Scenario:** an engineer tightens a directive in `infrastructure/worker/csp.js`
  — say, removing `https://fonts.gstatic.com` from `font-src` — and changes
  nothing under `apps/rialto-web/` or `packages/rialto/src/`. The workflow's
  `paths` filter matches neither, so `Rialto Web E2E` never triggers. The CSP
  suite, built precisely to catch that class, does not run. The change merges
  green and the fonts disappear in production.
- **Why it matters more than it first reads:** both incidents this run descends
  from were _policy_ changes, not app changes. The zero-web-fonts outage and
  the blocked Sentry envelopes were caused by what the CSP permitted, not by
  what rialto-web rendered. A guard watching the app but not the policy would
  have missed both of its own motivating cases — while appearing, in every
  green run, to cover them.
- **Decision: fixed** in `57493552c` — `infrastructure/worker/**` added to both
  the `push` and `pull_request` path lists, with a comment recording why.
  Verified: the YAML parses, both trigger blocks carry the path, prettier is
  clean, and `apps/rialto-web`'s 593 tests still pass including the
  `workflow-coverage` guard.

### Minor: a failure earlier in the `functional` job silently removes CSP coverage

- **Scenario:** `a11y-pages.spec.ts` flakes. GitHub Actions skips every later
  step in the job by default, so "Build rialto-web" and "Run CSP e2e tests"
  never execute. The run is red — but red for the flake, and the CSP suite
  contributed nothing. Re-run the flake to green and CSP coverage silently
  reappears. Nobody reading the result can tell which runs actually exercised
  the policy.
- **Not a defect in the change.** Sharing the `functional` job is a deliberate,
  documented cost tradeoff — the workflow header explains it avoids a second
  checkout, install, rialto build and Chromium install (~2–3 min billed per
  run). The tradeoff is defensible. What is missing is that its _consequence_
  is written down nowhere, so a future reader will reasonably assume a green
  functional job means the CSP suite ran.
- **Decision: deferred.** The honest fix is a separate job, which is exactly
  the cost the author consciously declined. Recording the consequence here is
  the proportionate response; re-litigating the tradeoff is not this run's job.

### Minor: the guard is advisory — a red CSP suite does not block a merge

- **Scenario:** the CSP suite goes red on a PR. `Rialto Web E2E` is not a
  required status check (`required_status_checks.contexts` on `main` is
  exactly `["CI Gate"]`, measured 2026-08-22), so the PR remains mergeable and
  auto-merge will complete it on `CI Gate` alone.
- The run's stated target state — "such that a CSP refusal fails the run" — is
  met: the workflow run does fail. But _fails the run_ and _blocks the merge_
  are different guarantees, and the gap is worth naming so nobody later reads
  the first as the second.
- **Decision: deferred.** Which checks are required is branch-protection state,
  not repo code — nothing in this tree changes it and no diff would record it.
  Out of scope for a maintenance run; a deliberate policy decision for the
  repo owner.

### Nit: the `@mbe/edge-worker/csp.js` import relies on legacy subpath resolution

- `infrastructure/worker/package.json` declares no `exports` map and no `main`,
  so `@mbe/edge-worker/csp.js` resolves straight to the file on disk. That
  works today and Verify proved it works.
- **Scenario:** someone adds an `exports` field to that package — routine
  hardening, entirely unrelated to this run — without listing `./csp.js`. The
  fixture's import stops resolving and the CSP suite dies at import time.
- **Decision: deferred.** Speculative, cheap to fix if it ever happens, and
  pre-emptively adding an `exports` map to a package that doesn't need one is
  the kind of just-in-case change this repo's guidelines tell me not to make.

## Passes with no findings

**Correctness — clean, and better than it needed to be.** Three specific
places where the obvious implementation would have produced a test that passes
without checking anything, and this code doesn't:

- `drain()` **throws** when the violation store is missing, instead of
  returning `[]`. A zero-violation result therefore cannot come from an init
  script that never ran.
- A2 asserts `scriptNonces.length > 0` before asserting every script is
  nonced, so "the page had no scripts" can't pass as "all scripts nonced". A3
  is likewise guarded by `#root` being non-empty — a blank page has nothing to
  refuse and would otherwise sail through.
- A2 reads the `script.nonce` **IDL property** rather than
  `getAttribute("nonce")`. The browser scrubs the content attribute once CSP
  applies, so the naive read returns `""` on a perfectly correct page. Getting
  this wrong yields a test that fails on correct code — the author found it and
  wrote down why.

The A1 equality check is not circular, which I checked specifically: only the
nonce is lifted out of the observed header, and the whole directive string is
then compared against the real `buildCspDirectives`. Any added, removed, or
reordered directive fails.

**Design — clean.** The fixture holds no policy of its own; the directive
builder and the nonce injector are both imported from the same module
production uses, so the harness cannot drift from the edge. The one fidelity
gap (production injects nonces with workerd's `HTMLRewriter`; the fixture uses
the plain-string mirror) is documented in the module header with its direction
of error stated — strict, so a false red, never a false green. That is the
correct direction and the correct way to record it.

**Security — clean.** No secrets, no new network surface, no user input. The
`mutate` hook re-introduces a CSP-violating defect on purpose, is exercised
only by the A4 self-test, and is documented as having no production
equivalent. Test-only code that makes the system _less_ safe is worth
suspicion; this is scoped to a single opt-in option on a fixture that never
ships.

## Verdict

**Ready to ship.** One major finding, fixed in this stage. Three lesser
findings recorded with reasons; none blocks.

Worth stating plainly, because it is the whole point of the run: this change
adds a guard that has been **observed failing** — four different ways,
including under the exact pre-fix condition of no CSP header at all. Most
tests in most repositories have only ever been seen passing. This one has been
shown to do its job, which is the difference between a guard and a decoration.
