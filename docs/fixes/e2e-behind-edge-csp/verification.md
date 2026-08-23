---
stage: verify
run: maintenance:e2e-behind-edge-csp
date: 2026-08-21
assumptions:
  - "No live interview was available (autorun). Where this stage would have asked, it took its own recommendation and recorded it here."
  - "The falsifiability checks (variants A-D below) were run from copies of the committed spec placed OUTSIDE the repo, in the session scratchpad with `node_modules` symlinked in, rather than by temporarily editing tracked files. This stage is read-only on source and every falsifiability check requires deliberately breaking the guard; out-of-tree sabotage keeps the working tree provably untouched (`git status --porcelain` empty at start and finish, HEAD still `ac3a56ffa`)."
  - "The `visual` E2E job was deliberately NOT run. Its 48 screenshot baselines are Linux-CI-runner-specific and would fail on this macOS host for font-metric reasons unrelated to the change. Default taken: prove the visual job is byte-unchanged from the workflow diff and record the gap, rather than produce a meaningless red."
  - "Verification ran entirely on this macOS host at `ac3a56ffa`. No CI run and no PR exists for the branch (`gh run list --branch fix/e2e-behind-edge-csp` returns `[]`, `gh pr list --head …` returns `[]`), so nothing below is evidence about the `ubuntu-latest` runner. Default taken: run both CI steps locally, verbatim, from the repo root, and record the platform gap."
---

# Verification: rialto-web E2E behind the real edge CSP

## Summary

**10 criteria, 10 PASS, 0 FAIL.** Nothing routes back to Implement.

The criteria list is `breakdown.md`'s nine acceptance criteria plus the
"Target state that ends the run" recorded in `defect.md` — the run's actual
success condition, which no single work item states on its own.

The centerpiece holds: the guard was observed **going red**, four different
ways, including under the exact pre-fix condition this run exists to fix (the
app served with no CSP at all). A guard that has only ever been seen green
proves nothing; this one has now been seen failing for every reason it is
supposed to fail for.

Three findings are recorded that are **not** criterion failures and do not
block: a leftover factual contradiction in the corrected record, a
non-typechecked `e2e/` directory, and independent confirmation that
Implement's second logged gap (the coverage test's spec-path-only match) is
real and reproducible.

## Method notes

- Node 22 confirmed before any gate: `v22.22.3` (pnpm `9.15.4`).
- `apps/rialto-web/dist` was deleted and rebuilt from scratch before the E2E
  runs, so both CI steps were exercised against a freshly built tree.
- The first `pnpm typecheck` returned `48 successful, 48 total` but also
  `Cached: 48 cached, 48 total` — a full-turbo replay, not a real run. It was
  re-run with `--force` and only the forced result is quoted as evidence.

## The regression (centerpiece)

The condition being fixed is that the harness served the app with **no CSP at
all**, so CSP-caused defects were invisible by construction. Two things had to
be shown: that the policy is now really applied, and that the guard really
fails when it should.

### Baseline: the local server still emits no policy of its own

Everything the guard detects comes from the fixture, not from `vite preview`:

```
$ curl -sI http://localhost:4173/rialto/ | grep -i 'content-security-policy'
(no Content-Security-Policy header from vite preview)
```

### Clean vs. mutated, driving the committed fixture

Reproduced independently at Verify with a scratch harness that imports the
**committed** `apps/rialto-web/e2e/support/edge-csp.ts` and sweeps the five
covered routes against `vite preview` on :4173:

```
===== CLEAN =====
/                    http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/components/button   http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/demos/login         http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/demos/telemetry     http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/visual-test         http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
MUTATE_DEFECT=0 -> TOTAL VIOLATIONS = 0

===== MUTATED (rialto-web-fonts defect reintroduced) =====
/                    http=200 cspHeaderPresent=true violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/components/button   http=200 cspHeaderPresent=true violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/demos/login         http=200 cspHeaderPresent=true violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/demos/telemetry     http=200 cspHeaderPresent=true violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/visual-test         http=200 cspHeaderPresent=true violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
MUTATE_DEFECT=1 -> TOTAL VIOLATIONS = 5
```

0 clean, 5 mutated, every one `script-src-attr` / `inline` — matching
`architecture.md` and Implement's own measurement exactly. Note `pageErrors=0`
and `rendered=true` on every mutated route: the reintroduced defect leaves a
page that renders correctly and logs nothing. A rendering-based or
console-based assertion would miss it entirely.

### Four ways the guard was watched failing

Each ran a sabotaged copy of the committed spec from outside the repo.

**Variant A — the A4 mutation neutered** (`const mutated = html;`). The
negative self-test must fail rather than pass over an empty violation list:

```
  ✘  1 a-neutered-mutation.spec.ts:95:5 › A4 — the guard goes red when the rialto-web-fonts defect is reintroduced (1.0s)

    Error: the defect pattern no longer matches the built document — A4 would pass vacuously

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

  1 failed
```

**Variant B — the pre-fix world.** `applyEdgeCsp` replaced with a stub that
records violations but never routes and never sets a policy: exactly the
harness as it existed before this run. **All 8 tests fail:**

```
    Error: navigation response must carry the production CSP

    expect(received).toBeTruthy()

    Received: undefined

      55 |     // a green A2/A3 therefore means nothing.
      56 |     const policy = response?.headers()["content-security-policy"];
    > 57 |     expect(policy, "navigation response must carry the production CSP").toBeTruthy();
```

```
  8 failed
    b-no-policy.spec.ts:46:7 › overview (./) runs clean under the production CSP
    b-no-policy.spec.ts:46:7 › component page (components/button) runs clean under the production CSP
    b-no-policy.spec.ts:46:7 › login demo (demos/login) runs clean under the production CSP
    b-no-policy.spec.ts:46:7 › telemetry demo (demos/telemetry) runs clean under the production CSP
    b-no-policy.spec.ts:46:7 › visual-test harness (visual-test) runs clean under the production CSP
    b-no-policy.spec.ts:106:5 › A4 — the guard goes red when the rialto-web-fonts defect is reintroduced
    b-no-policy.spec.ts:144:7 › edge-CSP fixture contract › applies the policy to the document and leaves other requests untouched
    b-no-policy.spec.ts:175:7 › edge-CSP fixture contract › records violations with the full four-field shape
```

This is the decisive result. Ship the pre-fix harness and the new suite is
entirely red; there is no configuration in which the guard silently passes
over an unpoliced document.

**Variant C — A2 reading the content attribute instead of the IDL property**
(`script.getAttribute("nonce")` in place of `script.nonce`). All five route
tests fail, independently reproducing the measurement that the browser scrubs
the content attribute once CSP is applied:

```
  ✘  1 c-a2-attribute.spec.ts:35:7 › overview (./) runs clean under the production CSP (923ms)
  ✘  2 c-a2-attribute.spec.ts:35:7 › component page (components/button) runs clean under the production CSP (1.1s)
  ✘  3 c-a2-attribute.spec.ts:35:7 › login demo (demos/login) runs clean under the production CSP (1.2s)
  ✘  4 c-a2-attribute.spec.ts:35:7 › telemetry demo (demos/telemetry) runs clean under the production CSP (1.2s)
  ✘  5 c-a2-attribute.spec.ts:35:7 › visual-test harness (visual-test) runs clean under the production CSP (1.2s)
    Error: every <script> must carry the document's nonce
```

**Variant D — fail-closed.** A `mutate` that throws inside the route handler
must fail the navigation, never serve a policy-less document. Implement
recorded this as measured-but-not-committed; reproduced here under the real
test runner:

```
  ✘  1 d-fail-closed.spec.ts:4:5 › fail-closed: a throwing route handler must fail the navigation, not serve a policy-less document (5.1s)

    Error: deliberate fixture failure

    Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
    Call log:
      - navigating to "http://localhost:4173/rialto/", waiting until "load"
```

The request, the navigation, and the test all fail. Run outside the test
runner the same throw takes the process down instead — either way, nothing
passes through.

## Criteria & evidence

### T0 (from `defect.md`) — at least one E2E pass over `apps/rialto-web` executes against a served document carrying the real production CSP, such that a CSP refusal fails the run

- Check: ran the committed CSP suite exactly as CI invokes it, from the repo
  root, against a freshly deleted and rebuilt `dist/`; then the four
  falsifiability variants above.
- Evidence:

  ```
  $ rm -rf apps/rialto-web/dist && pnpm --dir apps/rialto-web build
  ✓ built in 588ms

  $ pnpm exec playwright test --config apps/rialto-web/playwright.csp.config.ts apps/rialto-web/e2e/csp.spec.ts
  Running 8 tests using 1 worker

    ✓  1 [chromium] › apps/rialto-web/e2e/csp.spec.ts:35:3 › overview (./) runs clean under the production CSP (1.0s)
    ✓  2 [chromium] › apps/rialto-web/e2e/csp.spec.ts:35:3 › component page (components/button) runs clean under the production CSP (1.0s)
    ✓  3 [chromium] › apps/rialto-web/e2e/csp.spec.ts:35:3 › login demo (demos/login) runs clean under the production CSP (1.1s)
    ✓  4 [chromium] › apps/rialto-web/e2e/csp.spec.ts:35:3 › telemetry demo (demos/telemetry) runs clean under the production CSP (1.1s)
    ✓  5 [chromium] › apps/rialto-web/e2e/csp.spec.ts:35:3 › visual-test harness (visual-test) runs clean under the production CSP (1.1s)
    ✓  6 [chromium] › apps/rialto-web/e2e/csp.spec.ts:95:1 › A4 — the guard goes red when the rialto-web-fonts defect is reintroduced (854ms)
    ✓  7 [chromium] › apps/rialto-web/e2e/csp.spec.ts:133:3 › edge-CSP fixture contract › applies the policy to the document and leaves other requests untouched (815ms)
    ✓  8 [chromium] › apps/rialto-web/e2e/csp.spec.ts:164:3 › edge-CSP fixture contract › records violations with the full four-field shape (826ms)

    8 passed (9.7s)
  ```

  The "such that a CSP refusal fails the run" half is the regression section
  above: reintroducing the literal `rialto-web-fonts` defect produces
  violations on all five routes, and removing the policy turns all 8 tests red.

- Result: **PASS**

### M1.1 — Claim the backlog seed

- Check: `git diff origin/main...HEAD -- docs/backlog.md`, inspecting the seed
  line for appended-text-only change and a byte-identical `(from: …)` marker.
- Evidence:

  ```
  -- Run at least one E2E pass behind the real edge CSP — `apps/rialto-web/playwright.config.ts` serves the suite with `vite dev` and no `Content-Security-Policy` header, so every CSP-caused defect (the zero-web-fonts outage, the blocked Sentry envelopes) is invisible to visual and functional E2E by construction, not by oversight (from: maintenance:rialto-web-fonts)
  +- Run at least one E2E pass behind the real edge CSP — `apps/rialto-web/playwright.config.ts` serves the suite with `vite dev` and no `Content-Security-Policy` header, so every CSP-caused defect (the zero-web-fonts outage, the blocked Sentry envelopes) is invisible to visual and functional E2E by construction, not by oversight (from: maintenance:rialto-web-fonts) (claimed: maintenance:e2e-behind-edge-csp)
  ```

  The line differs by the appended ` (claimed: maintenance:e2e-behind-edge-csp)`
  and nothing else; the `(from: …)` marker is byte-identical. The full backlog
  diff shows three changed lines total and no reordering.

- Result: **PASS**

### M1.2 — Correct the Cloudflare Insights beacon record

- Check: read both diffs in full; grepped both files for surviving
  beacon-failure assertions and for any claim that events reach the dashboard.
- Evidence — the backlog seed, rewritten as resolved-not-a-defect with its
  `(from: …)` marker intact and the measurements cited:

  ```
  - Resolved, not a defect — the Cloudflare Insights beacon is fine, and the `ERR_CONNECTION_REFUSED` was a LAN-level DNS sinkhole on the probing machine: measured 2026-08-21, `dig +short static.cloudflareinsights.com` returns `0.0.0.0` through the LAN resolver `192.168.4.40` but `104.16.80.73` / `104.16.79.73` through `@1.1.1.1`, and `curl --resolve static.cloudflareinsights.com:443:104.16.80.73` returns HTTP 200 with real JavaScript; the edge-injected tag is correctly nonced and CSP does not block it. Whether events reach the Cloudflare Web Analytics dashboard was not verified — that needs dashboard access. (from: feature:rialto-game-ui) (claimed: maintenance:e2e-behind-edge-csp)
  ```

  And the retro, which keeps the still-true absence claim while withdrawing the
  false one:

  ```
  +  There is also no first-party usage instrumentation and no server-side route
  +  counter. **Corrected 2026-08-21 (maintenance:e2e-behind-edge-csp):** the
  +  edge-injected Cloudflare Insights beacon does _not_ fail to load.
  ```

  No surviving assertion in either file says the beacon fails to load; both
  explicitly decline to claim dashboard delivery.

- Result: **PASS** — with a leftover contradiction recorded under _Findings_
  below (backlog line 10 still asserts the beacon does not exist at all).

### M2.1 — Dependency edge to the real policy

- Check: package diff; workspace link on disk; a real module under
  `apps/rialto-web/e2e/` importing both symbols and executing;
  `pnpm typecheck`; dependency-cruiser.
- Evidence:

  ```
     "devDependencies": {
       "@axe-core/playwright": "^4.12.1",
       "@mbe/config": "workspace:*",
  +    "@mbe/edge-worker": "workspace:*",

  $ ls -la apps/rialto-web/node_modules/@mbe/ | grep -i edge
  lrwxr-xr-x  1 mbutler staff 33 Aug 21 09:33 edge-worker -> ../../../../infrastructure/worker

  $ pnpm exec turbo typecheck --force
   Tasks:    48 successful, 48 total
  Cached:    0 cached, 48 total
    Time:    32.492s
  EXIT=0

  $ pnpm check:boundaries
  > depcruise apps services packages tools --config .dependency-cruiser.cjs
  ✔ no dependency violations found (2208 modules, 5146 dependencies cruised)
  ```

  Resolution-and-execution is proven by the 8-passing CSP suite: both
  `csp.spec.ts` and the fixture import from `@mbe/edge-worker/csp.js`, and A1
  asserts equality against the imported `buildCspDirectives`. The policy's own
  byte-lock still holds: `pnpm --dir infrastructure/worker exec vitest run csp.test.js`
  → `Test Files 1 passed (1) / Tests 29 passed (29)`.

- Result: **PASS** — but see _Not verified_: `pnpm typecheck` does not actually
  cover the new files.

### M2.2 — Settle the generated-artifact consequence of the new edge

- Check: re-ran the generators twice and asserted a clean `git diff --exit-code`
  each time; ran `pnpm regen --check`.
- Evidence:

  ```
  $ pnpm graph && pnpm generate:dep-graph && git diff --exit-code infrastructure/worker/dep-graph.json docs/architecture/dependency-graph.md
  DEP_GRAPH_CLEAN=yes (git diff --exit-code exit 0)
  ---- 2nd run idempotence ----
  SECOND_RUN_CLEAN=yes

  $ pnpm regen --check
  > node scripts/regen.mjs "--check"
  All generated artifacts are up to date.
  EXIT=0
  ```

  This is the claim that most mattered to re-run independently — root
  `llms.txt` drift is what CI's Integrity job fails on, and Implement needed an
  extra commit (`ac3a56ffa`) to settle it. It is settled.

- Result: **PASS**

### M2.3 — Edge-CSP fixture

- Check: the two committed fixture-contract tests; variant D for fail-closed;
  static inspection for a policy string of its own.
- Evidence:

  ```
    ✓  7 › edge-CSP fixture contract › applies the policy to the document and leaves other requests untouched (815ms)
    ✓  8 › edge-CSP fixture contract › records violations with the full four-field shape (826ms)
  ```

  Test 7 asserts `nonDocumentResponses > 0` and that no non-document response
  carries a policy — the document-only routing and untouched `route.continue()`
  clauses. Test 8 asserts the four-field record shape
  (`blockedURI`, `documentURI`, `effectiveDirective`, `sample`) and that
  `drain` clears. The `addInitScript`-before-page-scripts clause is proven by
  the mutated sweep: `script-src-attr` fires at parse time and was captured on
  all five routes. Fail-closed is variant D (`net::ERR_ABORTED` + test error).

  No policy of its own:

  ```
  $ grep -nE "default-src|script-src|style-src|nonce-|<script" apps/rialto-web/e2e/support/edge-csp.ts
  6: * a strict nonce-based CSP to every HTML response and nonces every <script>
  18: * that injector's plain-string mirror. On real <script> elements the mirror is
  ```

  Both hits are prose in the docstring. The only directive source is the
  imported `buildCspDirectives`; the only nonce insertion is the imported
  `injectNonceIntoHtml`.

- Result: **PASS**

### M2.4 — CSP Playwright config

- Check: read the config; collected tests under both configs; compared
  base-config collection against `origin/main` under CI's explicit-path form
  using a throwaway `origin/main` worktree; probed the SPA fallback.
- Evidence:

  ```
  $ pnpm exec playwright test --config apps/rialto-web/playwright.csp.config.ts apps/rialto-web/e2e/csp.spec.ts --list
  Total: 8 tests in 1 file
  ```

  Never 0 — the spread-`testIgnore` hazard is closed by the explicit
  `testIgnore: []` in the CSP config. Base-config collection, HEAD vs
  `origin/main` (`4aa48f562`), both under CI's explicit-path invocation:

  ```
  === FUNCTIONAL (HEAD) ===        Total: 55 tests in 7 files
  === VISUAL (HEAD) ===            Total: 48 tests in 1 file
  === origin/main FUNCTIONAL ===   Total: 55 tests in 7 files
  === origin/main VISUAL ===       Total: 48 tests in 1 file
  ```

  Identical. And the preview server plus SPA fallback:

  ```
  preview http_code=200
  spa-fallback /rialto/demos/login -> 200
  ```

- Result: **PASS**

### M2.5 — CSP spec, A1/A2/A3 over the five covered routes

- Check: the five committed route tests; variant B for A1's falsifiability;
  variant C for A2's IDL-property requirement; static check for
  `waitForTimeout`.
- Evidence: the five `✓` lines quoted under T0, plus:

  ```
  $ grep -n "waitForTimeout" apps/rialto-web/e2e/csp.spec.ts
  54:    // under-reports; a waitForTimeout is the flake this ordering prevents.
  ```

  The single occurrence is a comment; there is no call. Draining happens after
  `waitForLoadState("networkidle")` and an `#root` non-empty assertion, as the
  criterion requires.

  A1 is a live equality, not a truthiness check — variant B shows it red on
  every route the moment the header is absent. A2 is genuinely stricter than
  the policy and did **not** red on a correct page, so nothing routed back to
  Architect; variant C shows it is nonetheless a real assertion. A3 is green on
  all five routes (`TOTAL VIOLATIONS = 0` in the clean sweep), so the real
  policy surfaced **no pre-existing violations** on the covered routes.

- Result: **PASS**

### M3.1 — Negative self-test (A4)

- Check: the committed A4 test; the clean-vs-mutated sweep; variant A for A4's
  own vacuity guard.
- Evidence:

  ```
    ✓  6 › apps/rialto-web/e2e/csp.spec.ts:95:1 › A4 — the guard goes red when the rialto-web-fonts defect is reintroduced (854ms)
  ```

  It fails rather than passing vacuously when the mutation stops injecting the
  defect — variant A, quoted in full above:
  `the defect pattern no longer matches the built document — A4 would pass vacuously`.
  The `defectInjected` assertion is ordered before the violation assertion, so
  regex drift against a future built document reports itself rather than
  showing up as an unexplained empty drain. The mutation is confined to that
  one test — the five A1-A3 routes record 0 violations in the same run — and
  A4 runs in the same `playwright.csp.config.ts` invocation as A1-A3.

- Result: **PASS**

### M3.2 — CI wiring in the `functional` job

- Check: workflow diff; job inventory; glob check; `pnpm --dir apps/rialto-web test`.
- Evidence:

  ```
  +      - name: Build rialto-web (the CSP suite runs against built output)
  +        run: pnpm --dir apps/rialto-web build
  +      - name: Run CSP e2e tests (built output, real edge policy)
  +        run: pnpm exec playwright test --config apps/rialto-web/playwright.csp.config.ts apps/rialto-web/e2e/csp.spec.ts
  ```

  Two distinct steps; the spec is an explicit full path with no glob character
  anywhere in the invocation. Job inventory is unchanged at two:

  ```
  $ grep -nE "^  [a-z-]+:$" .github/workflows/rialto-web-e2e.yml
  50:  visual:
  81:  functional:
  ```

  The diff touches only the header comment and the `functional` job — hunk
  headers `@@ -18,6 +18,18 @@` and `@@ -94,6 +106,14 @@`, both outside the
  visual job's lines 50-80, so the visual job is byte-unchanged. The coverage
  gate is satisfied:

  ```
  $ pnpm --dir apps/rialto-web test
   ✓ e2e/workflow-coverage.test.ts (1 test) 2ms
   Test Files  45 passed (45)
        Tests  582 passed (582)
  ```

  Both CI steps were then run locally, verbatim from the repo root, against the
  freshly rebuilt `dist/`: functional `55 passed (1.4m)`, CSP `8 passed (9.7s)`.

- Result: **PASS**

## Independent reproduction of Implement's claims

| Implement's claim                                                                | Verdict                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` → 48 successful, 48 total                                       | **Reproduced**, and strengthened — the first run was a `48 cached` full-turbo replay, so it was re-run with `--force`: `48 successful, 48 total / 0 cached / 32.492s`                                      |
| `pnpm regen --check` → all up to date                                            | **Reproduced** — `All generated artifacts are up to date.`                                                                                                                                                 |
| CSP config collects 8 tests in 1 file                                            | **Reproduced** — `Total: 8 tests in 1 file`, all 8 named                                                                                                                                                   |
| Base-config collection unchanged vs `origin/main` (55/7 functional, 48/1 visual) | **Reproduced on both sides** via a throwaway `origin/main` worktree at `4aa48f562` (removed afterwards)                                                                                                    |
| Both CI steps pass from the repo root against a freshly deleted `dist/`          | **Reproduced** — `rm -rf dist` → build → `55 passed` → `8 passed`                                                                                                                                          |
| Clean = 0 violations, mutated = 5, all `script-src-attr`/`inline`                | **Reproduced exactly** with an independently written sweep over the committed fixture                                                                                                                      |
| A4 goes red when the mutation is neutered                                        | **Reproduced** (variant A)                                                                                                                                                                                 |
| A1 falsifiable; A2 requires the IDL property                                     | **Reproduced by a different route** — Implement broke A1 with a wrong nonce; this stage removed the policy entirely (variant B), which is the more meaningful case. A2 reproduced as-described (variant C) |
| M2.3 fail-closed (measured, not committed as a test)                             | **Reproduced** (variant D): `page.goto: net::ERR_ABORTED` plus the throw re-reported as a test error                                                                                                       |
| The bare-config 0-collect is pre-existing                                        | **Reproduced on `origin/main` itself** — `Total: 0 tests in 0 files` there too                                                                                                                             |
| The coverage test's spec-path-only match is a live hazard                        | **Reproduced**, see _Findings_ — it is real                                                                                                                                                                |
| Live production CSP header matches `csp.js` defaults                             | **Taken on trust** — not re-measured; needs a live request to `mattbutlerengineering.com`                                                                                                                  |
| `dig`/`curl --resolve` beacon measurements in the record correction              | **Taken on trust** — LAN-dependent, not reproducible as evidence from this session                                                                                                                         |

## Failures

None. Nothing routes back to Implement.

## Findings that are not criterion failures

1. **The corrected record still contradicts itself about the beacon.**
   `docs/backlog.md` line 10 survives unchanged and reads
   "the deployed document carries exactly one script tag (the app bundle), **no
   beacon and no edge injection**" — while the correction two lines below states
   the edge-injected beacon exists and is correctly nonced. Implement
   deliberately left line 10, reasoning in the Implement log that it "asserts
   absence of first-party instrumentation, not that the beacon fails." That
   reasoning does not hold for this line: it names the beacon and edge
   injection specifically. M1.2's criterion is scoped to "fails to load", which
   is satisfied, so this is not a criterion failure — but the record is still
   wrong in a way this run's own evidence refutes. Routes to **Review**, not
   Implement. (`retro.md` line 178's "no DSN, no beacon, and no route counter"
   is the same shape, one degree softer.)

2. **The withdrawn seed was also marked `(claimed: …)`.** The rewritten
   backlog line 23 ends `(from: feature:rialto-game-ui) (claimed: maintenance:e2e-behind-edge-csp)`.
   The protocol's claim marker means "a run started from this seed"; this run
   started from line 28 and merely withdrew line 23. Not required by M1.2, not
   forbidden by it, and harmless in effect — recorded so it is not mistaken for
   provenance later.

3. **Implement's second logged gap is real, and here is the reproduction.**
   The coverage test matches on spec path alone, so appending `csp.spec.ts` to
   the base config's explicit list would silently drop it:

   ```
   $ pnpm exec playwright test --config apps/rialto-web/playwright.config.ts \
       <the 7 CI specs> apps/rialto-web/e2e/csp.spec.ts --list
   Total: 55 tests in 7 files
   ```

   Fifty-five, not sixty-three: `csp.spec.ts` is `testIgnore`d away with no
   error and exit 0, while `workflow-coverage.test.ts` stays green because the
   path string is present in the workflow. Worth knowing for whoever closes it:
   the degenerate case is safe — `csp.spec.ts` **alone** under the base config
   errors out rather than passing vacuously:

   ```
   Error: No tests found.
   Make sure that arguments are regular expressions matching test files.
   EXIT=1
   ```

   So the hazard exists only in the append-to-an-existing-list form. Recorded,
   not fixed — out of this run's scope, as Implement noted.

4. **Repo hygiene held.** `git status --porcelain` was empty before and after
   every gate, and HEAD is still `ac3a56ffa`. Supporting gates all green:
   `pnpm --dir apps/rialto-web lint` → `0 errors, 149 warnings` (all
   pre-existing `react-refresh` warnings); `pnpm check:prettier` → `All matched
files use Prettier code style!`; `node scripts/check-orphaned-tests.mjs` →
   `PASS: Every test file lives under a workspace package that CI runs.`

## Not verified

Carried forward verbatim in substance from `architecture.md`'s _What a green
run proves — and what it does not_, plus what this stage itself could not
reach. Silence here would read as coverage.

**The harness structurally cannot prove:**

- **That production's nonce injection works.** The harness uses
  `injectNonceIntoHtml`, a plain-string mirror of production's
  `HTMLRewriter` + `NonceInjector` (a workerd API). A defect in
  `NonceInjector` or in HTMLRewriter itself is invisible here. Architecture
  quantified the divergence and argued it is biased toward false reds; this
  stage did not re-measure that argument.
- **Anything about the KV override path.** The fixture calls
  `buildCspDirectives` with no `kvPolicy`; a bad `security/csp` value in
  production is out of reach.
- **Anything Cloudflare injects after the Worker**, including the Web
  Analytics beacon.
- **Anything about the edge router** — rate limiting, circuit breaker,
  service-binding routing, cache headers.
- **Violations on routes the spec does not visit**, or that require
  interaction it does not drive. Coverage is 5 routes; `a11y-pages.spec.ts`
  alone collects 25 tests, so the covered set is a small representative
  sample, exactly as designed.
- **`apps/marketing` and `apps/hospitality`.** Identical hole, untouched by
  this run.

**What this stage could not verify:**

- **CI itself.** `gh run list --branch fix/e2e-behind-edge-csp` returns `[]`
  and there is no PR. Both CI steps were run locally on macOS, verbatim; none
  of this is evidence about the `ubuntu-latest` runner, about the cold-cache
  CI run that the `pnpm-lock.yaml` change forces across every task, or about
  `CI Gate`. That evidence arrives at Ship.
- **The `visual` job.** Not run — its 48 baselines are Linux-CI-specific and
  would fail on macOS for reasons unrelated to this change. What _was_ proven
  is that the change cannot affect it: the workflow diff does not touch the
  visual job, and the base config's visual collection is identical to
  `origin/main` at 48 tests in 1 file.
- **Types in the new files.** `apps/rialto-web/tsconfig.json` has
  `include: ["src"]`, so `e2e/` is outside `tsc --noEmit` — measured:
  `tsc --noEmit --listFiles | grep -c "apps/rialto-web/e2e/"` → `0`. A green
  `pnpm typecheck` therefore says nothing about `edge-csp.ts` or
  `csp.spec.ts`. Architecture recorded this as a deliberate consequence (it is
  why the untyped `.js` import cannot break typecheck); it is restated here as
  a coverage gap because a green typecheck otherwise reads as covering them.
  In practice Playwright's own transpile-and-run is the only type-adjacent
  gate these files have.
- **The live production CSP header.** Not re-measured against
  `https://mattbutlerengineering.com/rialto/`; the claim that the deployed
  header matches `csp.js`'s defaults is taken from the brief. The in-repo
  byte-lock (`csp.test.js`, 29 passing) proves the _builder_ is pinned, not
  what the edge is currently serving.
- **The beacon measurements** in the record correction (`dig`,
  `curl --resolve`). LAN-dependent and not reproducible as evidence from this
  session; taken on trust from capture.
