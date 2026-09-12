---
stage: verify
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-12
assumptions:
  - "No live user. The stage interview was answered from autorun-brief.md, defect.md, architecture.md and breakdown.md. Every command below was executed in the worktree .claude/worktrees/docs+readme-world-class on branch fix/rialto-web-usage-instrumentation at 158078b42, on 2026-09-12; nothing is transcribed from a prior stage's log."
  - "The optional read-only `pulumi-preview.yml` dispatch WAS run. The brief permits it ('Verify may dispatch it on the run branch and read the plan') and breakdown § Verify owns lists it as optional; no default existed, so the decision is logged here. It is read-only by construction — the workflow runs `command: preview` with `refresh: false` and `permissions: contents: read`, and pins those properties with scripts/__tests__/pulumi-preview-workflow.test.mjs. No `pulumi up`, no deploy, no merge, no tag, no publish was run by this stage."
  - "The mandated mutation was widened from one direction to five. defect.md § Verify shape and breakdown § Verify owns require ONE live mutation (remove the Pulumi entry, watch the guard exit 1). Five were run instead — all three of the guard's sources in both drift directions, plus anti-vacuous mutations of the Pulumi unit test, the schema positional pin and the cookie legacy-key test. A guard proven to fail in one direction is still only proven in one direction, and this run exists to kill vacuous tests. Every mutation was reverted with `git checkout --` and each revert was confirmed byte-identical or by a clean `git status`."
  - "Markdown-audit attribution was measured against a throwaway `git worktree` at origin/main rather than reasoned from the diff. The extra two findings that appear there and not here are the gitignored Prisma `services/*/src/generated/` directories, absent in a checkout with no `pnpm install`; that difference is noted rather than hidden."
  - "Evidence 2 of the defect brief (the Cloudflare Web Analytics beacon vs. the edge CSP `connect-src`) was NOT probed. The brief scopes it out and parks it as a backlog seed; re-opening it here would be scope creep, and the LAN resolver still makes a local probe unable to distinguish CSP refusal from DNS sinkholing."
---

# Verification: the counter is bound, the guard is proven to fail, and the number is still unreadable

## Summary

**14 criteria checked: 12 PASS, 1 PASS-with-caveat, 1 FAIL (pre-existing, not
this run's).**

The defect is fixed and its recurrence is guarded. The `analytics_engine`
binding is on the Pulumi `WorkersScript` — confirmed not only by the unit test
but by a **live read-only `pulumi preview` against the real prod stack**, whose
plan carries `[6]: { dataset: "edge_requests", name: "ANALYTICS", type:
"analytics_engine" }` on `mattbutlerengineering-edge-router`. The drift guard
was **mutated in all three of its sources and went red every time**, then
restored — it is not a decoration.

Two things this run cannot demonstrate, and says so plainly rather than
softening:

1. **No real Analytics Engine query was ever run.** No Cloudflare API token
   with _Account · Account Analytics · Read_ exists to this run. Every
   request-shape assertion is against a stub `fetch`.
2. **No row can exist yet, and cannot exist on merge either.** `pulumi-up.yml`
   — the only path that applies the binding — fails on every recent run on
   `main`, re-measured today. Tracking issue **#5169**.

The one FAIL is `node scripts/audit-markdown.mjs` exiting 1. It reproduces on a
clean `origin/main` checkout that contains none of this run's work, so it is
reported as an honest gate failure with its attribution, not fixed and not
excused.

## Criteria & evidence

### T1 (brief § Target state) — the Pulumi `WorkersScript` carries an `analytics_engine` binding named `ANALYTICS` on dataset `edge_requests`

- Check: read the literal in `infrastructure/pulumi/index.ts`, counted it, and
  ran the unit suite plus the single new assertion in isolation.
- Evidence:

  ```
  $ sed -n '332,344p' infrastructure/pulumi/index.ts
    bindings: [
      { name: "API_ORIGIN", text: `https://api.${domain}`, type: "plain_text" },
      { name: "MARKETING", service: "mattbutlerengineering-marketing", type: "service" },
      { name: "HOSPITALITY", service: "mattbutlerengineering-hospitality", type: "service" },
      { name: "RIALTO", service: "mattbutlerengineering-rialto-web", type: "service" },
      { name: "GEN", service: "mattbutlerengineering-gen", type: "service" },
      { name: "HEALTH_STATE", namespaceId: healthKv.id, type: "kv_namespace" },
      // Analytics Engine sink for edge-router.js writeAnalytics(). The dataset
      // is also declared in ../worker/wrangler.toml, but this resource is what
      // deploys — scripts/check-analytics-bindings.mjs keeps the two in sync.
      { name: "ANALYTICS", dataset: "edge_requests", type: "analytics_engine" },
    ],

  $ grep -c "analytics_engine" infrastructure/pulumi/index.ts
  1

  $ pnpm --dir infrastructure/pulumi test
   ✓ ingress-coverage.test.ts (7 tests) 11ms
   ✓ index.test.ts (81 tests) 420ms
   Test Files  2 passed (2)
        Tests  88 passed (88)

  $ pnpm --dir infrastructure/pulumi test -- -t "Analytics Engine" --reporter=verbose
   ✓ index.test.ts > Configuration Validation > Cloudflare Configuration > edge router has an Analytics Engine binding for the edge_requests dataset 1ms
   Test Files  1 passed | 1 skipped (2)
        Tests  1 passed | 87 skipped (88)
  ```

- Result: **PASS**

### T2 (brief § Target state; defect.md § Verify shape) — the drift guard FAILS when one source loses the binding — proven by live mutation, three sources, then restored

This is the criterion the run exists for. A guard that has only ever been seen
to pass is indistinguishable from a guard that cannot fail — that is the exact
defect shape (`writeAnalytics` mocked green in the unit suite for 3.5 months
while production never wrote a point).

- Check: baseline green; then, one at a time, (a) delete the Pulumi binding
  line — the pre-fix production state verbatim; (b) delete the
  `[[analytics_engine_datasets]]` table from `wrangler.toml`; (c) change the
  schema module's `EDGE_REQUESTS_DATASET`. Guard run bare each time and `$?`
  read directly, never through a pipe. Each mutation reverted with
  `git checkout --` and the revert confirmed.
- Evidence — **baseline, green**:

  ```
  $ node scripts/check-analytics-bindings.mjs; echo "exit=$?"
  Checking Analytics Engine binding consistency across 3 sources...

    infrastructure/worker/wrangler.toml:        [ANALYTICS → edge_requests]
    infrastructure/pulumi/index.ts:             [ANALYTICS → edge_requests]
    infrastructure/worker/analytics-schema.js:  [ANALYTICS → edge_requests]

  PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the Analytics Engine binding (ANALYTICS → edge_requests).
  exit=0
  ```

- Evidence — **mutation (a): Pulumi binding removed (the production defect, reproduced)**:

  ```
  $ git diff -U1 -- infrastructure/pulumi/index.ts | tail -4
  @@ -341,3 +341,2 @@ const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-ro
       // deploys — scripts/check-analytics-bindings.mjs keeps the two in sync.
  -    { name: "ANALYTICS", dataset: "edge_requests", type: "analytics_engine" },
     ],

  $ node scripts/check-analytics-bindings.mjs; echo "exit=$?"
  Checking Analytics Engine binding consistency across 3 sources...

    infrastructure/worker/wrangler.toml:        [ANALYTICS → edge_requests]
    infrastructure/pulumi/index.ts:             [(none)]
    infrastructure/worker/analytics-schema.js:  [ANALYTICS → edge_requests]

  FAIL: Analytics Engine binding drift detected:

    [no-entries:pulumi] infrastructure/pulumi/index.ts parsed to no { type: "analytics_engine" } binding — a parser that matches nothing is a failure, not a pass
    [missing-in-pulumi] Binding "ANALYTICS" is not declared in infrastructure/pulumi/index.ts

  The Pulumi WorkersScript is what deploys; wrangler.toml and analytics-schema.js must match it.
  exit=1
  ```

  Under the same mutation the Pulumi unit test is red too — so that assertion
  is not vacuous either:

  ```
  $ pnpm --dir infrastructure/pulumi test
       × edge router has an Analytics Engine binding for the edge_requests dataset 1ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected undefined to be defined
   Test Files  1 failed | 1 passed (2)
        Tests  1 failed | 87 passed (88)
  ```

  Restore:

  ```
  $ git checkout -- infrastructure/pulumi/index.ts
  $ node scripts/check-analytics-bindings.mjs > /dev/null 2>&1; echo "guard-after-restore-exit=$?"
  guard-after-restore-exit=0
  $ diff -q <pre-mutation backup> infrastructure/pulumi/index.ts && echo "byte-identical"
  byte-identical to pre-mutation backup
  ```

- Evidence — **mutation (b): the other direction, `wrangler.toml` table removed**:

  ```
  $ git diff --stat -- infrastructure/worker/wrangler.toml
   infrastructure/worker/wrangler.toml | 3 ---
   1 file changed, 3 deletions(-)

  $ node scripts/check-analytics-bindings.mjs; echo "exit=$?"
    infrastructure/worker/wrangler.toml:        [(none)]
    infrastructure/pulumi/index.ts:             [ANALYTICS → edge_requests]
    infrastructure/worker/analytics-schema.js:  [ANALYTICS → edge_requests]

  FAIL: Analytics Engine binding drift detected:

    [no-entries:wrangler] infrastructure/worker/wrangler.toml parsed to no [[analytics_engine_datasets]] table — a parser that matches nothing is a failure, not a pass
    [missing-in-wrangler] Binding "ANALYTICS" is not declared in infrastructure/worker/wrangler.toml
  exit=1
  ```

- Evidence — **mutation (c): the third source, the schema module's dataset constant**:

  ```
  $ perl -i -pe 's/"edge_requests"/"edge_requests_v2"/' …/analytics-schema.js   # EDGE_REQUESTS_DATASET only
  $ node scripts/check-analytics-bindings.mjs; echo "exit=$?"
    infrastructure/worker/wrangler.toml:        [ANALYTICS → edge_requests]
    infrastructure/pulumi/index.ts:             [ANALYTICS → edge_requests]
    infrastructure/worker/analytics-schema.js:  [ANALYTICS → edge_requests_v2]

  FAIL: Analytics Engine binding drift detected:

    [dataset-mismatch] Binding "ANALYTICS" names different datasets: wrangler=edge_requests, pulumi=edge_requests, schema=edge_requests_v2
  exit=1

  $ git checkout -- infrastructure/worker/analytics-schema.js
  $ node scripts/check-analytics-bindings.mjs > /dev/null 2>&1; echo "restore-exit=$?"
  restore-exit=0
  $ git status --short -- infrastructure/
  (no output — fully restored)
  ```

- Result: **PASS**. All three sources are live; the guard is red in both drift
  directions and on a dataset mismatch; the tree is byte-identical to where it
  started.

### T3 (brief § Target state) — the `writeAnalytics` field layout has one home, shared with the reader, and cannot silently drift

- Check: read the module, confirmed the inline literal is gone from the writer,
  enumerated every importer, then mutated the column order and watched two
  independent tests go red.
- Evidence:

  ```
  $ grep -c 'blobs: \[' infrastructure/worker/edge-router.js
  0                                  # the inline literal is gone

  $ grep -rn "analytics-schema" --include=*.js --include=*.mjs --include=*.ts . | grep -v llms | grep -v node_modules
  scripts/edge-usage.mjs:30:} from "../infrastructure/worker/analytics-schema.js";
  scripts/check-analytics-bindings.mjs:31:} from "../infrastructure/worker/analytics-schema.js";
  scripts/__tests__/check-analytics-bindings.test.mjs:21:} from "../../infrastructure/worker/analytics-schema.js";
  scripts/__tests__/edge-usage.test.mjs:16:} from "../../infrastructure/worker/analytics-schema.js";
  infrastructure/worker/edge-router.test.js:82:import { EDGE_REQUESTS_COLUMNS } from "./analytics-schema.js";
  infrastructure/worker/edge-router.js:36:import { ANALYTICS_BINDING, toDataPoint } from "./analytics-schema.js";
  infrastructure/worker/analytics-schema.test.js:17:} from "./analytics-schema.js";
  ```

  Anti-vacuous proof — swap two columns in `toDataPoint` and both the schema
  test and the writer's positional pin fail, from opposite directions:

  ```
  $ git diff -U0 -- infrastructure/worker/analytics-schema.js | tail -2
  -    blobs: [route, method, country, pathname],
  +    blobs: [route, method, pathname, country],

  $ pnpm --dir infrastructure/worker test
       × toDataPoint places every field at the position its declared column implies 4ms
       × lays the data point out per EDGE_REQUESTS_COLUMNS 7ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: country at blob3: expected '/rialto/components/button' to be 'US' // Object.is equality
  AssertionError: expected [ 'marketing', 'GET', '/', 'unknown' ] to deeply equal [ 'marketing', 'GET', 'unknown', '/' ]
   Test Files  2 failed | 14 passed (16)
        Tests  2 failed | 267 passed (269)

  $ git checkout -- infrastructure/worker/analytics-schema.js && pnpm --dir infrastructure/worker test
   Test Files  16 passed (16)
        Tests  269 passed (269)
  ```

- Result: **PASS**

### T4 (brief § Target state) — the cookie banner has no `analytics` preference, tests updated, and a stored value carrying the old key still parses

- Check: read the type and the dialog's categories; ran the two suites; grepped
  the whole of `src` for the word; then mutated the hook back to the old spread
  and watched the legacy-key test fail.
- Evidence:

  ```
  $ sed -n '5,9p' apps/rialto-web/src/components/CookieConsent/useCookieConsent.ts
  export interface CookiePreferences {
    readonly essential: true;
    readonly functional: boolean;
    readonly marketing: boolean;
  }

  $ grep -n "toHaveLength(3)" -B 2 …/CookieConsent.test.tsx
  170-    // There is deliberately no analytics toggle — usage is counted at the edge
  171-    // with no cookie and no client identifier, so there is nothing to consent to.
  173:    expect(toggles).toHaveLength(3);

  $ pnpm --dir apps/rialto-web test
   ✓ src/components/CookieConsent/CookieConsent.test.tsx (10 tests) 66ms
   ✓ src/components/CookieConsent/useCookieConsent.test.ts (11 tests) 53ms
   Test Files  66 passed (66)
        Tests  767 passed (767)
  ```

  Anti-vacuous proof — restore the old `{ ...DEFAULT_PREFERENCES, ...parsed.preferences }`
  spread and the legacy-key test fails with the stale key visible in the diff:

  ```
  $ pnpm --dir apps/rialto-web exec vitest run src/components/CookieConsent/useCookieConsent.test.ts
       × always forces essential to true even if storage says otherwise 4ms
       × ignores a previously stored `analytics` key without writing back 2ms
  AssertionError: expected { essential: true, …(3) } to deeply equal { essential: true, …(2) }
  +   "analytics": true,
   Test Files  1 failed (1)
        Tests  2 failed | 9 passed (11)

  $ git checkout -- …/useCookieConsent.ts   # restored byte-identical
  $ pnpm --dir apps/rialto-web exec vitest run src/components/CookieConsent/
   Test Files  2 passed (2)
        Tests  21 passed (21)
  ```

  Remaining `analytics` hits in `apps/rialto-web/src` — no type, constant,
  fixture or expectation among them:

  ```
  CookieConsent/{CookieConsent.test.tsx,useCookieConsent.ts,useCookieConsent.test.ts}   comments + the legacy-key test's seed string
  pages/PrivacyPage.tsx                    prose, out of scope (carried as an Operate seed)
  pages/navigation/NavbarPage.tsx:54       demo nav item id, unrelated, pre-dates this run
  pages/examples/PricingTableExamplePage.tsx:50,67,84   "Revenue analytics" pricing copy, unrelated
  ```

  The two E2E specs that seed the legacy blob survive on purpose, so a real
  browser exercises the read path:

  ```
  $ grep -n analytics apps/rialto-web/e2e/{demo-nav,visual}.spec.ts
  apps/rialto-web/e2e/visual.spec.ts:126:   preferences: { essential: true, analytics: true, functional: true, marketing: true },
  apps/rialto-web/e2e/demo-nav.spec.ts:71:  preferences: { essential: true, analytics: true, functional: true, marketing: true },
  ```

- Result: **PASS**

### T5 (brief § Target state) — `node scripts/edge-usage.mjs` prints route/path counts, or exits non-zero with a clear message when the token or account id is absent

- Check: ran the script's real failure paths bare and read `$?` directly; then
  drove the **real `main()`** with a stub `fetch` so the request the script
  would send, and how it renders a response, are visible rather than asserted.
- Evidence — failure paths, run for real:

  ```
  $ env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node scripts/edge-usage.mjs; echo "exit=$?"
  Missing required environment variable: CLOUDFLARE_API_TOKEN
  exit=1

  $ env -u CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN=x node scripts/edge-usage.mjs; echo "exit=$?"
  Missing required environment variable: CLOUDFLARE_ACCOUNT_ID
  exit=1

  $ node scripts/edge-usage.mjs --days 0; echo "exit=$?"
  Invalid --days "0": expected an integer from 1 to 90

  Usage: node scripts/edge-usage.mjs [--days <1..90>] [--route <name>]
  …
  exit=1

  $ node scripts/edge-usage.mjs --route "x' OR 1=1"; echo "exit=$?"
  Invalid --route "x' OR 1=1": expected a name matching /^[a-z][a-z0-9_-]*$/
  …
  exit=1

  $ grep -cE "blob[0-9]|double[0-9]" scripts/edge-usage.mjs
  0                                  # no column literal of its own
  ```

- Evidence — the real `main()` with a **stub** `fetch` (⛔ **not** a live query):

  ```
  REQUEST URL    : https://api.cloudflare.com/client/v4/accounts/STUB_ACCOUNT/analytics_engine/sql
  REQUEST METHOD : POST
  REQUEST HEADERS: {"Authorization":"Bearer STUB_TOKEN"}
  REQUEST BODY   : SELECT blob1 AS route, blob4 AS pathname, SUM(_sample_interval) AS requests
  FROM edge_requests
  WHERE timestamp > NOW() - INTERVAL '30' DAY AND blob1 = 'rialto'
  GROUP BY route, pathname
  ORDER BY requests DESC
  LIMIT 100
  FORMAT JSONEachRow
  ---- stubbed response ----
  route      pathname                   requests
  rialto     /rialto/components/button  42
  marketing  /                          17

  2 row(s) over the last 30 day(s), route rialto; requests = SUM(_sample_interval)
  ---- main() returned ----
  exit code: 0
  ```

  Zero-row and 403 paths, same real `main()`:

  ```
  === zero rows ===
  0 rows — see docs/runbooks/edge-usage.md
  exit code: 0

  === 403 (token lacks the scope) ===
  Analytics Engine SQL API failed: 403 {"errors":[{"code":9109,"message":"Unauthorized to access requested resource"}]} — the token needs the Account Analytics Read scope (Cloudflare dashboard: Account · Account Analytics · Read)
  exit code: 1
  ```

- Result: **PASS for the failure modes and the request shape; the "prints
  counts" half is proven only against a stub.** See
  [Not verified](#not-verified) — this is the run's honest boundary, not a
  softened pass.

### T6 (brief § Target state) — the runbook tells a future retro what to run and what "no rows" means

- Check: read the runbook's structure, counted the verbatim terms the breakdown
  requires, and resolved both pointers plus the backlog claim.
- Evidence:

  ```
  $ grep -n "^## " docs/runbooks/edge-usage.md
  9:## When to run this
  19:## Quick Diagnosis
  55:## Data model
  76:## What zero rows means in the first hours after deploy
  109:## Undercount caveat
  124:## Common Causes
  154:## Recovery Steps
  166:## Token provisioning
  185:## Limits
  count: 9                                  # breakdown requires >= 8

  $ grep -cF … docs/runbooks/edge-usage.md
  CLOUDFLARE_API_TOKEN         4
  CLOUDFLARE_ACCOUNT_ID        3
  SUM(_sample_interval)        2
  scripts/edge-usage.mjs       3
  Account Analytics            6

  $ sed -n '19p' docs/README.md
  | [`runbooks/`](runbooks/)         | Runbooks for CI, deploys, services, static sites, edge usage |

  $ grep -n "edge-usage.md" docs/PLAYBOOK.md
  972:- [ ] Am I building what users actually want? (Check analytics → [docs/runbooks/edge-usage.md](runbooks/edge-usage.md), feedback, support requests)

  $ sed -n '13p' docs/backlog.md
  - Make the cookie banner's analytics toggle gate something, or drop it … (from: feature:rialto-game-ui) (claimed: maintenance:rialto-web-usage-instrumentation)
  ```

  The runbook's "What zero rows means" section already carries the dated,
  measured statement that `pulumi-up.yml` cannot complete on `main` — so the
  document does not tell a reader rows will appear on merge when they will not.

- Result: **PASS**

### L1 (architecture § Verification plan, optional) — live read-only `pulumi preview` shows the binding reaching the real prod stack

- Check: `gh workflow run pulumi-preview.yml --ref fix/rialto-web-usage-instrumentation`,
  then downloaded the `pulumi-preview` artifact and read the plan. The workflow
  is preview-only, `refresh: false`, `permissions: contents: read`.
- Evidence (run `34718503393`, conclusion `success`):

  ```
  dispatched ref: refs/heads/fix/rialto-web-usage-instrumentation
  evaluated sha:  158078b42d9d6dfb360968848a7280e22cfba981
  pulumi CLI:     3.253.0 (pinned)
  refresh:        no

      ~ cloudflare:index/workersScript:WorkersScript: (update)
          [id=mattbutlerengineering-edge-router]
        + bindings: [
        …
        +     [6]: {
                + dataset: "edge_requests"
                + name   : "ANALYTICS"
                + type   : "analytics_engine"
              }
          ]
  ```

  The plan also shows the bundled worker, which proves esbuild really does
  inline `analytics-schema.js` the way the architecture assumed:

  ```
          + // infrastructure/worker/analytics-schema.js
          + var ANALYTICS_BINDING = "ANALYTICS";
          + var EDGE_REQUESTS_COLUMNS = Object.freeze({
          +   route: "blob1", method: "blob2", country: "blob3", pathname: "blob4",
          +   status: "double1", elapsedMs: "double2", index: "route"
          + });
            function writeAnalytics(env, request, route, statusCode, startTime) {
          -   if (!env.ANALYTICS) return;
          -   env.ANALYTICS.writeDataPoint({ blobs: [route, request.method, country, …
          +   const analytics = env[ANALYTICS_BINDING];
          +   if (!analytics) return;
          +   analytics.writeDataPoint(toDataPoint({ … }));
            }

  Resources:
      ~ 3 to update
      - 2 to delete
      5 changes. 13 unchanged
  ```

- Result: **PASS**, with two caveats carried to [Findings for Review](#findings-for-review):
  the preview ran with `refresh: false` (plan compares against **recorded**
  state, not live), and the plan contains three changes this run did not author.

### G1 (breakdown item 7, re-run independently) — repo gates green on the merged tree

- Check: every gate re-executed today in this worktree after
  `pnpm install --frozen-lockfile`, `pnpm build --filter @mbe/cli...` and
  `pnpm build --filter @mattbutlerengineering/rialto --filter @mbe/api-client`.
  `typecheck` was re-run with `--force` because the first run came back
  `FULL TURBO` off Implement's cache and a cache hit is not a verification.
- Evidence:

  ```
  $ pnpm turbo typecheck --force
   Tasks:    48 successful, 48 total
  Cached:    0 cached, 48 total
    Time:    32.649s
  typecheck-exit=0

  $ pnpm repo-audit        → repo-audit-exit=0
      All matched files use Prettier code style!
      Checking Analytics Engine binding consistency across 3 sources...
      PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the Analytics Engine binding (ANALYTICS → edge_requests).
      ✔ no dependency violations found (2434 modules, 5747 dependencies cruised)

  $ pnpm regen --check     → regen-check-exit=0
      All generated artifacts are up to date.

  $ pnpm --dir infrastructure/worker test    Test Files  16 passed (16)   Tests  269 passed (269)
  $ pnpm --dir infrastructure/pulumi test    Test Files   2 passed (2)    Tests   88 passed (88)
  $ pnpm --dir scripts test                  Test Files 166 passed (166)  Tests 3211 passed (3211)
      ✓ scripts/__tests__/check-analytics-bindings.test.mjs (14 tests)
      ✓ scripts/__tests__/edge-usage.test.mjs (23 tests)
      ✓ scripts/__tests__/check-fitness-check-wiring.test.mjs (1 test)
  $ pnpm --dir apps/rialto-web test          Test Files  66 passed (66)   Tests  767 passed (767)

  $ git status --short
   M README.md
  ?? docs/autonomous-loop.svg
  $ git diff --cached --name-only | wc -l
         0
  ```

  The guard's **wiring** is proven by `repo-audit` printing the guard's own
  PASS line from inside the chain, not by inspection alone — `package.json:16`
  runs `node scripts/check-analytics-bindings.mjs` immediately after
  `check-service-bindings.js`, `&&`-chained, so the mutation-proven exit 1
  would red the whole audit.

- Result: **PASS**

### G2 (breakdown item 6 Prove) — `node scripts/audit-markdown.mjs` exits 0

- Check: ran it here, then ran the **same script on a throwaway `git worktree`
  checked out at `origin/main`**, which contains none of this run's work.
- Evidence:

  ```
  # this branch
  $ node scripts/audit-markdown.mjs > mdaudit.log 2>&1; echo "exit=$?"
  exit=1
  FAIL: 1 markdown finding(s) needing judgement:
    packages/rialto-plugin/skills/rialto/SKILL.md:104  [broken-link]  link "../../generated/component-reference.md" points at nothing

  # clean origin/main, nothing from this run present
  $ git worktree add --detach …/mainbase origin/main
  HEAD is now at d3bbc04e6 docs(public-ingress): correct the blocker reference from #4848 to #5169 (#5312)
  $ node scripts/audit-markdown.mjs > mdaudit-main.log 2>&1; echo "exit=$?"
  exit=1
  FAIL: 3 markdown finding(s) needing judgement:
    packages/rialto-plugin/skills/rialto/SKILL.md:104  [broken-link]  …
    services/agent/CLAUDE.md:89   [stale-tree-entry]  …
    services/users/CLAUDE.md:71   [stale-tree-entry]  …

  # attribution
  $ git diff --name-only origin/main...HEAD | grep -c rialto-plugin
  0
  $ <SKILL.md on branch> vs <SKILL.md on origin/main>  → byte-identical
  $ git log -1 --format="%h %ad %s" --date=short origin/main -- packages/rialto-plugin/skills/rialto/SKILL.md
  122cfadd0 2026-05-16 feat(rialto): add useBoop hook for spring scale microinteraction (#1397)
  $ grep -c <this run's doc paths> mdaudit.log
  0
  ```

  The two extra findings on the clean checkout are the gitignored Prisma
  `services/*/src/generated/` directories, which only exist after `postinstall`
  runs — absent in a worktree with no `pnpm install`. They are an artifact of
  the comparison tree, not a difference this branch introduced.

- Result: **FAIL** — and the failure is inherited, not caused. `origin/main`
  alone exits 1 on the same check for the same file, last touched on
  2026-05-16 by #1397. **Not routed back to Implement**, and deliberately not
  "fixed": editing an unrelated file to make a gate green is exactly the
  scope creep the brief's Constraints forbid, and the correct link target is a
  judgement call the `/md-audit` pass owns.

### G3 (defect.md § Verify shape, negative criterion) — no real Analytics Engine query is claimed

- Check: attempted the bare invocation with the ambient environment, and read
  the documented scopes.
- Evidence:

  ```
  $ node scripts/edge-usage.mjs; echo "exit=$?"
  Missing required environment variable: CLOUDFLARE_API_TOKEN
  exit=1

  $ sed -n '18p;29p' docs/SECRETS.md
  | `MBE_CLOUDFLARE_API_TOKEN`    | Cloudflare API (Pages deploys, KV, DNS, Pulumi)         | Quarterly          | — |
  | `CLOUDFLARE_ACCOUNT_ID`       | Cloudflare account identifier (not a secret per se)     | No rotation needed | N/A |

  $ grep -rn "Account Analytics" docs/SECRETS.md
  (no output — the scope is documented nowhere)
  ```

  **⛔ No real Analytics Engine query was run by this stage.** No Cloudflare API
  token carrying _Account · Account Analytics · Read_ exists to this run. No
  credential was requested from the user and none was sought from any secret
  store.

- Result: **PASS** (the criterion is that the gap is stated, and it is stated).

### G4 (runbook claim, re-measured) — `pulumi-up.yml` cannot apply the binding today

- Check: the runbook asserts this and names four run ids; re-measured rather
  than trusted.
- Evidence:

  ```
  $ gh run list --workflow pulumi-up.yml --branch main --limit 6
  failure     2026-09-12T05:50:36Z  34676613113
  failure     2026-09-12T05:33:08Z  34675873114
  cancelled   2026-09-12T05:30:52Z  34675776736
  cancelled   2026-09-12T05:29:54Z  34675726842
  failure     2026-09-12T04:55:21Z  34674259495
  failure     2026-09-12T01:33:16Z  34665165637

  $ gh run view 34676613113 --json jobs   → Deploy Infrastructure: failure
  failing step: Pulumi Refresh (Sync state with cloud)

  $ gh run view 34676613113 --log-failed | grep "Insufficient scope"
    * 403 Forbidden: Insufficient scope, expected any of: read:branding
    * 403 Forbidden: Insufficient scope, expected any of: read:tenant_settings
   ~  auth0:index:Branding mattbutlerengineering-branding refreshing (0s) error: … read:branding: provider=auth0@3.51.0
   ~  auth0:index:Tenant   mattbutlerengineering-tenant   refreshing (0s) error: … read:tenant_settings: provider=auth0@3.51.0
  ```

  Tracking issue, confirmed by title:

  ```
  $ gh issue view 5169  → #5169 [OPEN] fix(ci-fix): ciHealth.pass_rate_pct regressed (100 → 94) — Pulumi Deploy failing on Auth0 403 Insufficient scope
  $ gh issue view 4848  → #4848 [OPEN] [Audit] UX: Auth0 login page exposes raw dev tenant ID and stock branding — the flagship front door has no vibe
  ```

  **The blocker is #5169, not #4848.** #4848 is the UX issue whose
  implementation created the Auth0 resources a later revert orphaned — a
  cause, not the tracker. No artifact in this run cites either number
  (`grep -rn "4848\|5169"` over the run directory and the runbook returns
  nothing), so there was nothing to correct; the correct number is recorded
  here for Ship. Independently corroborated: `origin/main`'s current HEAD is
  `d3bbc04e6 docs(public-ingress): correct the blocker reference from #4848 to
#5169 (#5312)` — a sibling run made the same correction.

- Result: **PASS** (the claim is true as written).

## Failures

**One**, and it is not this run's work:

- `node scripts/audit-markdown.mjs` exits 1 on the one pre-existing broken link
  at `packages/rialto-plugin/skills/rialto/SKILL.md:104`. Reproduced on a clean
  `origin/main` worktree; the file is byte-identical to `origin/main` and
  untouched by this branch; zero findings land against any file this run wrote.
  **Not routed back to Implement.** It belongs to the `/md-audit` pass.

No criterion failed on this run's own code. No verification routes back to
Implement; the next stage is Review.

## Findings for Review

1. **The `.husky/pre-push` AI-antipattern ratchet was loosened by +7 for this
   branch** — re-measured today, not taken on report:

   ```
   $ git diff origin/main...HEAD -- metrics/ai-antipattern-baselines.json
   -      "count": 693,     "hardcodedRoutes"  →  +      "count": 694,
   -      "count": 711,     "consoleLogs"      →  +      "count": 717,

   $ node scripts/check-ai-antipatterns.mjs
     OK  hardcodedRoutes: 694 (baseline: 694)
     OK  anyType:         291 (baseline: 291)
     OK  consoleLogs:     717 (baseline: 717)
   All patterns within baseline. No regressions detected.
   ```

   The concrete deltas: `scripts/check-analytics-bindings.mjs` has exactly 6
   `console.log` calls (its three-source preamble) — its closest sibling
   `scripts/check-service-bindings.js` has exactly 6 as well, already inside
   the old baseline — and the one route literal is the test fixture
   `infrastructure/worker/analytics-schema.test.js:66`
   (`pathname: "/api/v1/reservations"`). The third regression (`anyType +1`) was
   fixed in code rather than accepted. **This is a repo-wide ratchet moved to
   accommodate one branch**; Review should weigh whether the preamble should
   instead be folded into `runCheck`'s pass/fail messages, the convention the
   newer `check-ci-gate-coverage.mjs` / `check-orphaned-tests.mjs` follow at
   zero `console.log`. Recorded, not re-litigated here.

2. **The `pulumi preview` plan carries three changes this run did not author.**
   Alongside `[6] ANALYTICS`, the plan contains the `/public/` ingress work
   (rate-limiter entry, `originRoutes: ["/api", "/public"]`, a DO App ingress
   rule), a provider bump `cloudflare default_6_19_0 => default_6_20_0`, and
   **two Auth0 deletes** (`auth0:index/branding:Branding`,
   `auth0:index/tenant:Tenant` — the orphans behind #5169). Whoever merges this
   run's binding is queueing an apply that also applies all of that. That is a
   Ship-time fact, surfaced here because the preview is where it became visible.

3. **The preview does not isolate `ANALYTICS` as the only binding delta.**
   Because the provider version changes, old state records `bindings: [secret]`
   and the plan renders all seven bindings as additions rather than one. Entry
   `[6]` is unambiguously in the planned state, but "only the analytics binding
   changed" is not something this plan proves on its own — the unit test and
   the drift guard are what pin that.

4. **The preview ran with `refresh: false`** (by design — refresh writes shared
   state). The plan therefore compares desired state against **recorded** state,
   not against live Cloudflare. A drift between recorded and live would not
   appear.

5. **The branch is 2 commits behind `origin/main`** as of writing
   (`b27a5a22f` metrics, `d3bbc04e6` docs). Neither touches a file this run
   owns. Ship decides whether to update the branch.

## Not verified

Stated as gaps, because a silent gap reads as coverage.

- **⛔ No real Analytics Engine query, at all.** No Cloudflare API token with
  _Account · Account Analytics · Read_ exists to this run;
  `MBE_CLOUDFLARE_API_TOKEN`'s documented scopes (`docs/SECRETS.md:18` — "Pages
  deploys, KV, DNS, Pulumi") do not include it and the scope appears nowhere in
  that file. Every request-shape and response-rendering claim in T5 is against
  a **stub `fetch`**, including the two-row output and the `0 rows` and 403
  messages. A mocked query was deliberately **not** presented as a verified
  end-to-end result. Provisioning that scope is `release.md`'s first human step.
- **No row in `edge_requests` was observed, and none can be yet.** A row
  requires the binding to be live, which requires a `pulumi-up.yml` run to
  complete on `main` after this merges — and that workflow currently fails on
  every run (G4, **#5169**). Until #5169 is resolved, merging this run does not
  produce a single data point. The end-to-end claim in the brief's target state
  — "rows appear and `scripts/edge-usage.mjs` counts them" — is **unverified by
  this run and unverifiable by it.**
- **No live Cloudflare read of any kind.** The binding's existence on the
  deployed script was not confirmed against Cloudflare's API; the evidence is a
  plan, not a live resource.
- **Analytics Engine free-tier limits** (100k writes/day, 10k read queries/day,
  three-month retention) are transcribed into the runbook from Cloudflare's
  documentation. Not measured, and not checked against this edge's real request
  volume — there is no volume figure to check against, because nothing has ever
  been counted.
- **The SPA-navigation undercount** is a reasoned design limitation documented
  in the runbook. Its magnitude is unmeasurable until rows exist.
- **Evidence 2 of the defect brief — the Web Analytics beacon vs. the edge CSP
  `connect-src`** — was not probed. Out of scope per the brief, parked as a
  backlog seed, and still untestable from this LAN (resolver 192.168.4.40
  sinkholes `cloudflareinsights.com`, so a local probe cannot separate a CSP
  refusal from DNS).
- **Nothing was deployed, merged, tagged, published, or applied.** Prepare and
  stop: the only externally visible action this stage took was dispatching the
  read-only `pulumi-preview.yml` workflow, which applies nothing.
