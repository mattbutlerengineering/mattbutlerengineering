---
stage: decompose
run: maintenance:e2e-behind-edge-csp
date: 2026-08-21
assumptions:
  - "No live interview was available (autorun). The skill's step 4 'Review the cut' — milestone boundaries and item sizing — was decided by this stage rather than by the user. Three milestones, nine items; rationale under *How this was cut*."
  - "Tracker export granularity: one GitHub issue per work item (nine), not one per milestone. The protocol's reference form maps a single issue to a single checkbox line, so per-milestone issues would leave several checkboxes sharing one number ambiguously. Cost accepted: nine small issues for a maintenance run."
  - "Every issue was created with labels `test-coverage` + `infrastructure` and deliberately WITHOUT `ready`, `in-progress`, `agent-*`, or `tier:*` — the repo's autonomous `/implement-queue` claims any open `ready` issue, and would race this run's own Implement stage into duplicate, conflicting PRs. This is a run-scoped instruction, not the repo's normal issue convention."
  - "M1.2's acceptance criterion accepts EITHER removing the false backlog seed OR rewriting it as resolved-not-a-defect. The brief offers both and names no default; rather than guess, the criterion is written to be satisfied by either form, with the `(from: …)` marker required to survive if rewritten. Implement picks."
  - "The five covered routes, the A1–A4 assertion set, and the fixture/config/spec/CI-step split are taken verbatim from `architecture.md` — they are design decisions already made, restated here only so each has a checkable criterion. This stage made no design decisions."
---

# Breakdown: rialto-web E2E behind the real edge CSP

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Scope check, so this does not inflate: one fixture, one spec, one config, one
CI step, one dependency edge, and a docs correction. Nine items, three
milestones, one branch, one PR.

## How this was cut

Milestone boundaries follow what is demonstrable, not what is convenient:

- **M1** finishes with the repo's own record no longer lying about a beacon and
  the backlog seed claimed. It is deliberately first because it is the only work
  that must land on a branch nothing else has touched yet, and because
  `architecture.md` assigns the seed claim to "whichever item opens the branch."
- **M2** finishes with the run's actual target state met — one E2E pass over
  `apps/rialto-web` executing against a served document carrying the real
  production CSP, green locally.
- **M3** finishes with that guard proven able to fail and enforced on every PR.
  M2 without M3 is a guard nobody has watched go red, running nowhere.

Within milestones, items are one sitting each and ordered by dependency; every
blocking edge is stated on the item.

## Milestone 1: The record is straight and the run's branch is open

- [x] **Claim the backlog seed** — append `(claimed: maintenance:e2e-behind-edge-csp)` in place to the "Run at least one E2E pass behind the real edge CSP" line in `docs/backlog.md` (tracker: #4436)
  - Accept: that line ends with `(from: maintenance:rialto-web-fonts) (claimed: maintenance:e2e-behind-edge-csp)`; `git diff docs/backlog.md` shows it changed by appended text only, with its existing `(from: …)` marker byte-identical and never rewritten; no other backlog line is reordered.
  - Blocked by: — (this item opens the branch)

- [x] **Correct the Cloudflare Insights beacon record** — remove or rewrite-as-resolved the false beacon seed in `docs/backlog.md`, and correct the beacon sentence in `docs/features/rialto-game-ui/retro.md` (lines 33–35) (tracker: #4428)
  - Accept: neither file any longer asserts that the beacon fails to load in production; the backlog seed is either removed or rewritten as resolved-not-a-defect so it cannot be re-picked (if rewritten in place, its `(from: feature:rialto-game-ui)` marker survives verbatim); the corrected text in both files attributes the observed `ERR_CONNECTION_REFUSED` to the LAN DNS sinkhole on the probing machine and cites the `dig`/`curl --resolve` measurements; **neither file asserts that events reach the Cloudflare Web Analytics dashboard** — that was not verified and needs dashboard access; the retro's separate, still-true claim that rialto-web has no first-party usage instrumentation is left intact.
  - Blocked by: —
  - Note: rides this run's PR. Do not open a separate one, and do not "fix" the beacon — there is nothing wrong with it.

## Milestone 2: One E2E pass over rialto-web runs under the real production CSP

- [x] **Dependency edge to the real policy** — add `@mbe/edge-worker` as a `devDependency` (`workspace:*`) of `@mbe/rialto-web` so the harness imports the production CSP by package specifier, not a copy and not a relative deep import (tracker: #4429)
  - Accept: `apps/rialto-web/package.json` lists `"@mbe/edge-worker": "workspace:*"` under `devDependencies`; `pnpm install` resolves with the workspace link present; a module under `apps/rialto-web/e2e/` importing `buildCspDirectives` and `injectNonceIntoHtml` from `@mbe/edge-worker/csp.js` resolves and executes; `pnpm --dir apps/rialto-web typecheck` passes; the dependency-cruiser check passes.
  - Blocked by: —
  - Covers architecture's `infrastructure/worker/csp.js` component: it is **unchanged**, and this item is the whole of the change to it — a new consumer, nothing else. The dependency direction is one-way: nothing about the harness appears in `csp.js`.

- [x] **Settle the generated-artifact consequence of the new edge** — regenerate the committed dependency graph after the `package.json` / `pnpm-lock.yaml` change (tracker: #4430)
  - Accept: after `pnpm graph && pnpm generate:dep-graph`, `git diff --exit-code infrastructure/worker/dep-graph.json docs/architecture/dependency-graph.md` is clean and a second run produces no further diff; both files are staged by explicit path, never `git add -A`; `pnpm regen --check` passes; CI's Build job does not fail on a stale dep-graph.
  - Blocked by: **Dependency edge to the real policy**
  - Note: `pnpm-lock.yaml` is a turbo `globalDependencies` entry, so this PR's CI run is **fully cold across every task** — budget for it, and treat every downstream package's default-5s-timeout suite as running under cold-cache conditions for that run.

- [x] **Edge-CSP fixture** — `apps/rialto-web/e2e/support/edge-csp.ts` exporting `applyEdgeCsp(context, options?) → CspRecorder` (tracker: #4431)
  - Accept: for `resourceType() === "document"` requests only, the fixture `route.fetch()`es the original, generates a nonce as `crypto.randomUUID().replace(/-/g, "")`, applies `options.mutate` when present, then `injectNonceIntoHtml`, then `route.fulfill`s with `Content-Security-Policy: buildCspDirectives(nonce)`; every non-document request is `route.continue()`d untouched; the `securitypolicyviolation` listener is installed via `addInitScript` so it exists before any page script runs; `drain(page)` returns records of shape `{ effectiveDirective, blockedURI, sample, documentURI }`; a throw inside the route handler fails the request and therefore the navigation and the test — **fail closed, never a silent pass-through**; the fixture contains no CSP directive string and no nonce-insertion logic of its own.
  - Blocked by: **Dependency edge to the real policy**

- [x] **CSP Playwright config** — `apps/rialto-web/playwright.csp.config.ts` spreading the base config and overriding `webServer` (`vite preview`), `use.baseURL`, and `testMatch`; base config gains a matching `testIgnore` (tracker: #4432)
  - Accept: `webServer.command` invokes `pnpm --dir apps/rialto-web exec vite preview --port 4173 --strictPort` with `url` `http://localhost:4173/rialto/`, and `use.baseURL` matches; `apps/rialto-web/playwright.config.ts` gains a `testIgnore` excluding `csp.spec.ts`; running the CSP config collects **1 or more** tests, never 0; running the base config collects exactly the specs it collected before, with `visual.spec.ts` and the seven functional specs unchanged; a smoke navigation to `http://localhost:4173/rialto/demos/login` returns 200, confirming the SPA fallback.
  - Blocked by: — (parallel with the three items above; the spec below needs it)
  - Hazard: spreading the base config carries the new `testIgnore` into the CSP config too. Clear or override it there, or the CSP config collects zero tests.
  - Hazard: `pnpm exec vite preview`, never `pnpm preview -- --port` — the `preview` script _is_ `vite preview`, so pnpm forwards `--` literally and vite ignores the flags. `apps/marketing/playwright.config.ts` already carries this warning; this is the second instance.

- [x] **CSP spec — A1/A2/A3 over the five covered routes** — `apps/rialto-web/e2e/csp.spec.ts` asserting policy-in-force, every-script-nonced, and zero violations on `/`, `components/button`, `demos/login`, `demos/telemetry`, `visual-test` (tracker: #4433)
  - Accept: for each of the five routes — **A1** the navigation response carries a `content-security-policy` header equal to `buildCspDirectives(n)` for the nonce `n` parsed out of that same header; **A2** every `<script>` in the document satisfies `script.nonce === n`, read from the **IDL property and never `getAttribute("nonce")`** (once CSP is applied the browser scrubs the content attribute, so an attribute-based assertion fails on a correct page); **A3** `drain(page)` returns `[]`, drained after `await page.waitForLoadState("networkidle")` plus an assertion on a rendered element, never after a `waitForTimeout`. `pnpm exec playwright test --config apps/rialto-web/playwright.csp.config.ts` is green locally against a freshly built `apps/rialto-web/dist`.
  - Blocked by: **Edge-CSP fixture**, **CSP Playwright config**
  - Hazard: A2 is deliberately stricter than the policy — `'self'` admits same-origin external scripts that A2 still requires to be nonced. If A2 reds on a script the policy legitimately allows, surface it; do not weaken A2 without routing back to Architect.
  - Hazard: turning the real policy on may surface **pre-existing** violations beyond the guarded one. Per the brief that is a success, not a failure — surface it, do not silently fix everything found.

## Milestone 3: The guard is proven able to fail, and CI enforces it

- [x] **Negative self-test (A4)** — reintroduce the literal `rialto-web-fonts` defect through the fixture's `mutate` hook and assert the guard goes red (tracker: #4434)
  - Accept: one test calls `applyEdgeCsp` with `mutate: html => html.replace(/(<link\s+rel="preload"\s+as="style")/, "$1 onload=\"this.rel='stylesheet'\"")` and asserts at least one recorded violation with `effectiveDirective === "script-src-attr"`; the test **fails** rather than passing vacuously when the mutation produces no violation; the mutation is confined to that one test and does not leak into the A1–A3 routes; the test passes in the same `playwright.csp.config.ts` run as A1–A3.
  - Blocked by: **CSP spec — A1/A2/A3 over the five covered routes**
  - Why it is an item and not a nicety: architecture measured clean = 0 violations and mutated = 5, and in the mutated run the page still rendered, the font link still reached `rel="stylesheet"`, and there were zero page errors. A rendering-based or console-based assertion would have missed the defect entirely. A green A4 with zero violations means the harness has stopped applying the policy and A1–A3 are worthless.

- [ ] **CI wiring in the `functional` job** — build `apps/rialto-web` and run the CSP config as a separate step of the existing `functional` job in `.github/workflows/rialto-web-e2e.yml`, referencing the spec by full path (tracker: #4435)
  - Accept: the `functional` job gains (a) a `pnpm --dir apps/rialto-web build` step and (b) a **distinct** step running `pnpm exec playwright test --config apps/rialto-web/playwright.csp.config.ts apps/rialto-web/e2e/csp.spec.ts`, with the spec written as an explicit full path and no glob anywhere in the invocation (#3955); `pnpm --dir apps/rialto-web test` passes, i.e. `e2e/workflow-coverage.test.ts` finds `apps/rialto-web/e2e/csp.spec.ts` referenced in the workflow; no third job is added; the `visual` job is byte-unchanged; the workflow's header comment is updated to describe the added CSP step.
  - Blocked by: **CSP spec — A1/A2/A3 over the five covered routes**, **Negative self-test (A4)**
  - Note: a step, not a third job — step-level separation keeps a CSP failure distinguishable from a functional one without re-paying checkout, install, the rialto build, and the Chromium install (~2–3 min of billed runner time per run). Budget ~45–60 s added per PR run.

## Dependency order

```
M1.1 claim seed ──┐
M1.2 record fix ──┤ (independent, open the branch)
                  │
M2.1 dep edge ────┼──> M2.2 dep-graph regen
                  └──> M2.3 fixture ──┐
M2.4 csp config ───────────────────── ┼──> M2.5 csp.spec.ts (A1–A3)
                                                   │
                                                   ├──> M3.1 negative self-test (A4)
                                                   └──> M3.2 CI wiring ── also blocked by M3.1
```

## Architecture coverage

Every component in `architecture.md` appears in an item:

| Architecture component                                                            | Item                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------- |
| `infrastructure/worker/csp.js` (`@mbe/edge-worker`) — unchanged, gains a consumer | M2.1 (the edge), M2.3 (the only importer) |
| Edge-CSP fixture `apps/rialto-web/e2e/support/edge-csp.ts`                        | M2.3                                      |
| `apps/rialto-web/e2e/csp.spec.ts`                                                 | M2.5 (A1–A3), M3.1 (A4)                   |
| `apps/rialto-web/playwright.csp.config.ts` (+ base `testIgnore`)                  | M2.4                                      |
| CI step in `.github/workflows/rialto-web-e2e.yml` → `functional`                  | M3.2                                      |

And every obligation in architecture's _Carried forward_ section:

| Carried-forward obligation                       | Item                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Claim the backlog seed                           | M1.1                                                             |
| Folded-in record correction rides this PR        | M1.2                                                             |
| New spec wired by full path (#3955)              | M3.2                                                             |
| Lockfile / dep-graph consequence                 | M2.2 (with M2.1)                                                 |
| Negative self-test                               | M3.1                                                             |
| Mechanism transfers to `marketing`/`hospitality` | **Deliberately no item** — named, not taken. See _Out of scope_. |
| Real policy may surface pre-existing violations  | **Deliberately no item** — a surfacing rule, recorded on M2.5.   |

## Out of scope

Not items, and not oversights:

- **`apps/marketing` and `apps/hospitality`.** Identical hole. The fixture
  depends only on a `BrowserContext` and transfers unchanged, but the brief
  scopes this run to rialto-web. Promotion carries a real constraint that a
  future run must respect: `.dependency-cruiser.cjs`'s `apps-not-imported` rule
  forbids another app importing from `apps/rialto-web/e2e/`, so adopting it
  elsewhere means **moving** the fixture next to the policy it wraps
  (`infrastructure/worker/`), not cross-importing.
- **Changing the production CSP.** Out by the brief; `csp.test.js` locks the
  policy byte-for-byte precisely so it cannot drift. The harness is what is wrong.
- **A CSP `report-to` / `report-uri` endpoint.** Separate backlog seed, separate run.
- **Repairing `scripts/cors-audit.mjs`'s dead CSP branch.** Flagged in
  `defect.md`, pre-existing, explicitly not this run's job.
- **Anything the harness cannot prove** — production's `HTMLRewriter` nonce
  injection, the KV `security/csp` override path, Cloudflare's post-Worker
  injection, and the edge router itself. Stated and accepted in
  `architecture.md`'s _What a green run proves_.

## Design gaps found

None. Decomposition surfaced two implementation hazards rather than design gaps,
and both are recorded on the items they threaten (M2.4's spread `testIgnore`,
M2.5's A2-stricter-than-policy) — neither requires a design decision to resolve,
so neither routes back to Architect. The one case that _would_ route back is
named on M2.5: if A2 reds on a script the policy legitimately admits via
`'self'`, weakening A2 is a design change, not an implementation fix.

## Tracker mirror

Mirror **out** only (ADR-0026). The checkboxes above are the state; the nine
issues are a mirror, and each closes as its item completes.

**None of these issues carries the `ready` label, and none may be given one.**
This repo runs an autonomous `/implement-queue` that claims every open `ready`
issue and implements it in a worktree agent. Labelling any of these `ready`
would race this run's own Implement stage into duplicate, conflicting PRs. Each
issue body says so in its opening lines. Labels applied: `test-coverage`,
`infrastructure`.

## Notes

Constraints carried from the brief, for whichever agent picks this up:

- Node 22 (`.nvmrc`) — run `nvm use`.
- One branch, one PR. The record correction rides it; do not open a second.
- The PostToolUse prettier hook leaves ~171 tracked files permanently dirty.
  Never `git add -A` — stage explicit paths only.
- Files written via Bash heredoc skip all formatting hooks. Run prettier on them
  with an explicitly resolved `--config .prettierrc.js`, or CI's Build job fails
  repo-wide.
- `.husky/pre-push` runs neither typecheck nor tests. Run `pnpm typecheck`
  yourself before pushing.
- Deploys go through GitHub Actions only — never manual `wrangler` or `doctl`.
- Visual baselines are Linux-CI-specific. This change should not affect them at
  all (it adds a server, it does not replace one); if it somehow does,
  regenerate from the `rialto-web-visual-diffs` CI artifact, never from macOS.

### Implement log

**2026-08-21 — M1.2 touched three lines beyond the two the brief named.** The
item's criterion is absolute ("neither file any longer asserts that the beacon
fails to load in production"), and the false claim had propagated past
`docs/backlog.md` line 23 and `retro.md` lines 33-35 into three more places:
`docs/backlog.md`'s live-surface-probe seed ("a dead analytics beacon"), the
same phrase in `retro.md`'s Change/Stop list, and `retro.md`'s Idea-seeds
mirror of the withdrawn backlog seed. All three were corrected in place,
minimally, in the same commit.

**Deliberately left intact:** `docs/backlog.md` line 10 ("no beacon and no edge
injection") and `retro.md` line 178 ("no DSN, no beacon, and no route
counter"). Both assert _absence_ of first-party instrumentation, not that the
beacon fails — and the brief explicitly protects that claim as still true and a
separate open seed. Correcting them would contradict the item's own last
clause.

**2026-08-21 — M2.3 `applyEdgeCsp` is `async`.** The architecture writes the
signature as `applyEdgeCsp(context, options?) → CspRecorder`. Both Playwright
calls it makes (`context.addInitScript`, `context.route`) are asynchronous, and
not awaiting them races the first navigation against route registration. The
function therefore returns `Promise<CspRecorder>` and callers `await` it. Same
inputs, same outputs, same behaviour — recorded because the written signature
differs.

**2026-08-21 — M2.3's fail-closed clause is verified by measurement, not by a
committed test.** Measured with a deliberately throwing `mutate`: `page.goto`
rejected with `net::ERR_ABORTED`, and Playwright additionally re-reported the
throw as a test error — so the request, the navigation, and the test all fail,
exactly as the criterion requires. It is not expressible as a self-asserting
test: a test cannot assert that it itself fails, and `test.fail()` would go
green for the wrong reason if the fixture ever started swallowing the throw.
The durable guard against the pass-through _outcome_ is A1, which requires the
policy header on every covered route. Measurement and reasoning are recorded in
the fixture's own docstring.

**2026-08-21 — M3.1 reproduced architecture's clean-vs-mutated measurement
exactly.** Driving the committed fixture over all five covered routes against
`vite preview` on :4173:

```
========== CLEAN ==========
/                    http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/components/button   http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/demos/login         http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/demos/telemetry     http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
/visual-test         http=200 cspHeaderPresent=true violations=0 pageErrors=0 rendered=true
MUTATE_DEFECT=0 → TOTAL VIOLATIONS = 0

========== MUTATED (rialto-web-fonts defect reintroduced) ==========
/                    ... violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/components/button   ... violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/demos/login         ... violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/demos/telemetry     ... violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
/visual-test         ... violations=1 pageErrors=0 rendered=true  [{"d":"script-src-attr","b":"inline"}]
MUTATE_DEFECT=1 → TOTAL VIOLATIONS = 5
```

Matches architecture.md's numbers (0 clean, 5 mutated, every one
`script-src-attr` / `inline`). Note `pageErrors=0` and `rendered=true` in the
mutated run: the defect leaves a page that renders correctly and logs nothing,
so a rendering-based or console-based assertion would miss it entirely. The
`securitypolicyviolation` event is the only signal. The shipped A4 asserts the
single-route form of this; the five-route sweep was a scratch script, not
committed.

**2026-08-21 — A4's own vacuity guard was itself proven to fail.** The criterion
requires A4 to fail, not pass, when the mutation produces no violation. Verified
by neutering the mutation to `const mutated = html;` and re-running: A4 goes red
with `the defect pattern no longer matches the built document — A4 would pass
vacuously / Expected: true / Received: false`. That `defectInjected` assertion is
deliberately ordered _before_ the violation assertion, so a future change to the
built document's shape reports the regex drift rather than an unexplained empty
drain.

**2026-08-21 — M2.5's A2 did NOT red, so nothing routed back to Architect.**
The item's hazard anticipated that A2 (stricter than the policy: `'self'` admits
un-nonced same-origin scripts that A2 still requires to be nonced) might fail on
a script the policy legitimately allows. Measured across all five covered
routes: every `<script>` in every document carries the document's nonce, and
A1/A2/A3 are green — `7 passed` in the CSP config. A2 stands exactly as
architecture wrote it; it was not weakened.

**2026-08-21 — A1 and A2 were proven falsifiable rather than assumed.** Both
pass on a correct app, so neither could be watched failing the ordinary
test-first way. Each was instead broken deliberately, once, and observed red on
all five routes before being restored byte-identical:

- **A1** compared against `buildCspDirectives("f".repeat(32))` (a nonce that is
  not the served one) → **5 failed**. The equality is live and exact, not a
  truthiness check that any policy string would satisfy.
- **A2** switched from the `script.nonce` IDL property to
  `script.getAttribute("nonce")` → **5 failed** with `every <script> must carry
the document's nonce`. This independently reproduces architecture.md's
  measurement that the browser scrubs the content attribute once CSP is applied,
  and is why A2 must read the IDL property.

A3's falsifiability is not a probe — it is M3.1, which ships as a committed test.

**2026-08-21 — M2.4 pins `webServer.cwd` to the repo root.** The architecture
writes the command as `pnpm --dir apps/rialto-web exec vite preview …`, which is
written from the repo root. Playwright defaults `webServer.cwd` to the _config
file's_ directory (`apps/rialto-web`), so `--dir apps/rialto-web` resolved to
`apps/rialto-web/apps` and died: `ERROR ENOENT: no such file or directory, lstat
'/Users/mbutler/github/mattbutlerengineering/apps/rialto-web/apps'`. Fixed by
adding `cwd: REPO_ROOT` rather than rewriting the command, so the architecture's
literal invocation survives and resolves identically no matter which directory
`playwright test` is launched from. Same server, same port, same flags.

**2026-08-21 — a bare `playwright test --config playwright.config.ts` collects 0
tests, and did so before this run.** Playwright's default `testMatch` also
matches `e2e/workflow-coverage.test.ts`, which is a **vitest** file; loading it
throws `TypeError: Cannot read properties of undefined (reading 'config')` and
aborts the whole listing. Verified identical on `origin/main` (no `testIgnore`
present), so it is **pre-existing and not caused by M2.4's `testIgnore`**. It
does not affect CI, which passes explicit spec paths: measured before and after
the `testIgnore` change, the functional list is `55 tests in 7 files` and the
visual list is `48 tests in 1 file`, unchanged. Flagged, not fixed — out of this
run's scope.

**2026-08-21 — `csp.spec.ts` is born at M2.3, not M2.5.** Test-first requires a
failing test before the fixture exists, and the highest existing seam is a
Playwright spec. The file starts as the fixture-contract block only; M2.5 adds
A1–A3 over the five covered routes and M3.1 adds A4, as planned. Consequence
inside the branch: `apps/rialto-web/e2e/workflow-coverage.test.ts` is red from
this commit until M3.2 wires the spec into the workflow by full path.
