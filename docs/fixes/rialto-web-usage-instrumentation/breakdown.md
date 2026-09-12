---
stage: decompose
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-03
assumptions:
  - "No live user. The decompose interview was answered from autorun-brief.md, defect.md and architecture.md; the skill's 'review the cut' step had no reviewer, so the milestone boundaries below are the architecture's four moves taken in its own stated order (bind → contract → guard → delete the lie + read path), not a user's call. Every file:line cited was re-read in this worktree on 2026-09-03."
  - "Scale matches the precedent (docs/fixes/backend-observability-blackout/breakdown.md: 7 items in its shipped milestone): 8 items across 3 milestones, one of which is a branch-setup item the brief mandates and one an exit-gate item derived from the architecture's verification plan."
  - "Branch setup is a checkbox item (item 0). The protocol is silent on setup items; the brief makes the branch step mandatory and names files that must never be staged, so making it checkable is the only way Implement's first action is verifiable rather than assumed."
  - "docs/backlog.md line 13 is only CLAIMED during Implement (`(claimed: …)` appended, per protocol § Seed backlog). The 'resolved for rialto-web' marker and the PrivacyPage-wording seed the architecture flagged are carried in § Notes for Operate to write at run close — the protocol names Capture and Operate as the backlog's only producers, and architecture.md itself places the resolved marker 'at Retro'. This diverges from the orchestrator's phrasing ('line 13 resolved for rialto-web; PrivacyPage wording seed') on protocol grounds, and is surfaced in the stage report."
  - "Item 2 bundles the schema module, its test, and the writer's refactor to import it (4 files). The RED is the schema test on a missing module; the new positional pin added to edge-router.test.js is a pin that passes before and after the refactor, stated as such so nobody fakes a red. Splitting would leave a schema module nothing imports — the shipped≠run shape this run exists to end."
  - "Item 5 (cookie consent) touches five files in one TDD cycle, over the 1–3 guideline, because removing a key from `CookiePreferences` makes hook and dialog one compile unit: either half alone leaves `pnpm --dir apps/rialto-web typecheck` red, and every item must leave the tree green."
  - 'The two rialto-web E2E specs that seed `analytics: true` into localStorage (e2e/demo-nav.spec.ts:71, e2e/visual.spec.ts:126) are left untouched: they are outside `tsconfig include: ["src"]`, and after item 5 they exercise the legacy-stored-key read path in a real browser for free. Architecture.md does not list them; recorded here so their survival reads as deliberate.'
  - "The drift guard's finding kinds follow architecture.md's `missing-in-<source>` family; the schema source gets `missing-in-schema`. A label, not a design decision."
  - "`scripts/edge-usage.mjs`'s `main()` RETURNS its exit code and the entry guard calls `process.exit` — the seam that makes the missing-env path unit-testable without spawning. Architecture.md specifies the codes and messages but not the seam; this follows `scripts/lib/fitness-check.mjs`'s runCheck convention."
  - "Showing the guard FAIL against a live mutation (delete the Pulumi entry, watch exit 1) is Verify's, per defect.md § Verify shape. Implement proves the same thing mechanically with a tmp-dir fixture reproducing the pre-fix production state verbatim."
  - "Reconciled with origin/main by MERGE, not rebase (2026-09-12, commit 3c3fe2306). No live user and no skill-supplied default: the implement skill is silent on how a stale branch catches up. Chosen because the branch and main both changed docs/backlog.md and package.json — a rebase replays those conflicts across all six commits, a merge resolves each once. Consequence for later stages: origin/main..HEAD now lists a merge commit alongside the run's six, so item 7's 'lists only this run's commits' is read as 'this run's commits plus its own reconciliation merge'."
  - "docs/backlog.md's merge conflict was resolved by keeping BOTH sides in full (append-only, per protocol § Seed backlog), with this run's single seed placed before main's 29 later ones. Ordering is prioritization in that file, so the position is a choice: chronological append order was used, and no pre-existing line was reordered, reworded or dropped."
  - "package.json's repo-audit conflict was resolved as a union on top of main's version — main's new check-ci-gate-coverage.mjs and its removal of 'pnpm audit --audit-level=high' from the chain (now the standalone audit:security script, #4993) both kept, with this run's check-analytics-bindings.mjs re-inserted in its original slot after check-service-bindings.js."
  - "metrics/ai-antipattern-baselines.json was updated (hardcodedRoutes 693 → 694, consoleLogs 711 → 717) to let the branch push. No live user and no skill-supplied default; the script's own failure message offers exactly two options (fix, or --update after intentional work) and both remaining hits are the rule's known false-positive shape in a CLI check script and a test fixture. The third regression (anyType) was fixed in code rather than accepted. Verified that origin/main scores exactly baseline on all eight patterns first, so the update accepts these two deltas and nothing else. Flagged for human review — see the Notes entry."
  - "Item 6's runbook gained one bullet not in the written scope: a dated, measured statement that pulumi-up.yml currently fails on main at 'Pulumi Refresh (Sync state with cloud)', so the section that tells a reader rows appear after that workflow completes does not mislead. Judgement call flagged by the orchestrator, taken because the section's whole purpose is telling a reader what zero rows means."
---

# Breakdown: bind the counter that already exists, then make its number readable

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Ordering note that shaped the cut: **the fix lands first, the guard lands
before anything depends on it, and the docs land last so they describe a CLI
that exists.** Item 1 is the one-line Pulumi binding — it is the whole defect.
Item 2 gives the field layout one home so the reader (item 4) and the guard
(item 3) import the same constants the writer does. The cookie-toggle removal
(item 5) depends on nothing in Milestone 1 and can run in parallel with it. No
tracker interaction anywhere: the brief's policy is none, so no item carries a
`(tracker: …)` reference and nothing is imported or exported.

Before any item: `pnpm install --frozen-lockfile` in this worktree (Node 22 via
`.nvmrc`). Never `git add -A`; never stage `README.md` or
`docs/autonomous-loop.svg` (both dirty and unrelated). Two of the packages this
run edits carry committed `llms.txt`/`llms-full.txt` (`infrastructure/pulumi`,
`apps/rialto-web`): the post-commit `pack-changed` hook regenerates them, so
expect them in `git status` after items 1 and 5 and stage them by explicit path.

## Milestone 1: the counter runs in production, and its absence is loud

Demonstrable at the boundary: `pnpm --dir infrastructure/pulumi test` asserts
the edge router `WorkersScript` carries `{ name: "ANALYTICS", dataset:
"edge_requests", type: "analytics_engine" }`; `node
scripts/check-analytics-bindings.mjs` exits 0 on the tree and its test proves it
would have exited 1 on the tree as it stood for 3.5 months. Merging this
milestone alone fixes the defect and stops it recurring.

- [x] **0. Branch from `origin/main` and commit the run's paper trail** — the
      brief's mandated first step, made checkable. Run `git fetch origin`, then
      `git checkout -b fix/rialto-web-usage-instrumentation origin/main`. The
      dirty `docs/backlog.md` (capture's claim on line 12 and its appended
      CSP seed) and the untracked run directory carry across the checkout;
      measured 2026-09-03, HEAD is one commit behind `origin/main` and none of
      the files this run touches differ between them, so the checkout cannot
      conflict. Then `pnpm exec prettier --check
docs/fixes/rialto-web-usage-instrumentation/ docs/backlog.md`, stage exactly
      those paths (`defect.md`, `architecture.md`, `breakdown.md`,
      `docs/backlog.md`), and commit.
  - Files: `docs/fixes/rialto-web-usage-instrumentation/{defect,architecture,breakdown}.md`,
    `docs/backlog.md` — nothing else.
  - Red: none — no code changes in this item.
  - Prove: `git branch --show-current` → `fix/rialto-web-usage-instrumentation`;
    `git merge-base --is-ancestor origin/main HEAD` → exit 0;
    `git show --stat --oneline HEAD` lists exactly the four paths above;
    `git status --short` still shows ` M README.md` and
    `?? docs/autonomous-loop.svg`, unstaged. Baselines before any change:
    `pnpm --dir infrastructure/pulumi test` (83 passed),
    `pnpm --dir infrastructure/worker test`, `pnpm --dir apps/rialto-web test`
    — all green, numbers recorded in § Notes.
  - Accept: all four Prove commands hold, and the baseline suites are green so
    every later red is this run's.
  - Blocked by: —
- [x] **1. Declare the `analytics_engine` binding on the Pulumi
      `WorkersScript`** — the fix. Add
      `{ name: "ANALYTICS", dataset: "edge_requests", type: "analytics_engine" },`
      to the edge router's `bindings` array at
      `infrastructure/pulumi/index.ts:311-318` (the array that today holds
      `API_ORIGIN`, four `service` entries and `HEALTH_STATE`). Shape confirmed
      against the installed `@pulumi/cloudflare` 6.19.0:
      `WorkersScriptBinding` at `node_modules/@pulumi/cloudflare/types/input.d.ts:15589`,
      `dataset?: pulumi.Input<string | undefined>` at `:15625`, `type` at
      `:15748` documented with `analytics_engine` among the values. Note `type`
      is `pulumi.Input<string>`, not a union — a misspelt literal typechecks, so
      the test below is the only pin.
  - Files: `infrastructure/pulumi/index.test.ts`, `infrastructure/pulumi/index.ts`.
  - Red: beside the `HEALTH_STATE` assertion (`index.test.ts:601-612`), add
    `it("edge router has an Analytics Engine binding for the edge_requests dataset")`
    using the existing `findResource(...)` helper: `bindings.find((b) => b.type
=== "analytics_engine")` is defined, `.name === "ANALYTICS"`, `.dataset ===
"edge_requests"`. Run `pnpm --dir infrastructure/pulumi test` — fails
    (`undefined`). Then add the literal.
  - Prove: `pnpm --dir infrastructure/pulumi test` → 84 passed (was 83);
    `pnpm --dir infrastructure/pulumi typecheck` → exit 0;
    `pnpm --dir infrastructure/pulumi lint` → exit 0.
  - Accept: the new test is green; `grep -c "analytics_engine"
infrastructure/pulumi/index.ts` prints `1` and the hit is inside the
    `mattbutlerengineering-edge-router` script's `bindings` (not the gen
    worker's); after committing, the regenerated
    `infrastructure/pulumi/llms.txt` and `llms-full.txt` are staged by path and
    folded into this item's commit, and `pnpm regen --check` exits 0. `pulumi
preview` is NOT run here — Verify may dispatch `pulumi-preview.yml` on the
    branch; `pulumi up` never runs in this run.
  - Blocked by: 0
- [x] **2. `analytics-schema.js` — one statement of the `edge_requests` layout,
      imported by the writer** — new `infrastructure/worker/analytics-schema.js`
      (plain ESM, zero imports) exporting `ANALYTICS_BINDING = "ANALYTICS"`,
      `EDGE_REQUESTS_DATASET = "edge_requests"`, `EDGE_REQUESTS_COLUMNS =
{ route: "blob1", method: "blob2", country: "blob3", pathname: "blob4", status:
"double1", elapsedMs: "double2", index: "route" }`, and the pure
      `toDataPoint({ route, method, country, pathname, status, elapsedMs })` →
      `{ blobs, doubles, indexes }`. Then `writeAnalytics`
      (`edge-router.js:60-69`) becomes: look up `env[ANALYTICS_BINDING]`, keep
      the early return when absent (architecture keeps it; the Pulumi test and
      the guard are what make absence loud now), and call
      `writeDataPoint(toDataPoint({...}))`. esbuild's `--bundle` in
      `pulumi-up.yml:64-65` inlines the sibling import exactly as it does
      `./circuit-breaker.js`.
  - Files: `infrastructure/worker/analytics-schema.js` (new),
    `infrastructure/worker/analytics-schema.test.js` (new),
    `infrastructure/worker/edge-router.js` (the `writeAnalytics` body only),
    `infrastructure/worker/edge-router.test.js` (one added test in the
    "Analytics Engine" describe, `:800-822`).
  - Red: `analytics-schema.test.js` imports the four exports from
    `./analytics-schema.js` — fails to resolve. Its assertions: the two
    constants equal `"ANALYTICS"` / `"edge_requests"`; `EDGE_REQUESTS_COLUMNS`
    deep-equals the map above; for a sample input, every `blobN` / `doubleN` in
    the map satisfies `toDataPoint(input).blobs[N-1] === input[field]` (and
    likewise `doubles`), and `indexes` deep-equals `[input.route]` — positions
    are DERIVED from the map inside the test, so the test cannot agree with the
    module by copy-paste. Green: write the module. Refactor: the writer imports
    it. Pin (not a red — passes before and after): in `edge-router.test.js`,
    for `GET /`, `blobs` deep-equals `["marketing", "GET", "unknown", "/"]`,
    `indexes` deep-equals `["marketing"]`, `doubles[0] === 200`,
    `typeof doubles[1] === "number"`, with indices read from
    `EDGE_REQUESTS_COLUMNS`.
  - Prove: `pnpm --dir infrastructure/worker test` — `analytics-schema.test.js`
    green, "Analytics Engine" describe 3 → 4 green, and
    `does not fail when ANALYTICS binding is absent` (`:816`) still passes;
    `pnpm --dir infrastructure/worker test:coverage` → exit 0 (thresholds in
    `vitest.config.mjs` hold); `pnpm --dir infrastructure/worker lint` → exit 0.
  - Accept: all Prove commands green; `grep -n "blobs: \["
infrastructure/worker/edge-router.js` prints nothing — the inline literal is
    gone and the layout has exactly one home; `infrastructure/worker` carries no
    `llms.txt`, so nothing regenerates.
  - Blocked by: 0
- [x] **3. Drift guard `scripts/check-analytics-bindings.mjs`, wired into
      `repo-audit`** — a sibling of `check-service-bindings.js`, not an
      extension (architecture § Decisions). Three sources: **S1** wrangler.toml
      `[[analytics_engine_datasets]]` tables → `{ binding, dataset }`
      (header-anchored regex like `parseWranglerBindings`, matching the real
      layout at `wrangler.toml:41-43`); **S2** `index.ts` entries with `type:
"analytics_engine"` → `{ name, dataset }` (regex
      `/\{\s*name:\s*"(\w+)",\s*dataset:\s*"(\w+)",\s*type:\s*"analytics_engine"\s*\}/g`
      — `\s*` so a prettier reflow is harmless); **S3** the schema module's two
      constants, statically imported from
      `../infrastructure/worker/analytics-schema.js`. Pure exports
      `parseWranglerAnalytics(text)`, `parsePulumiAnalytics(text)`,
      `diffAnalyticsBindings(wrangler, pulumi, schema)`,
      `findAnalyticsBindingFindings(root)` (root governs only the two config
      reads); CLI via `runCheck` from `./lib/fitness-check.mjs` and the `isMain`
      guard pattern at `check-service-bindings.js:105`. Finding kinds:
      `missing-in-wrangler`, `missing-in-pulumi`, `missing-in-schema`,
      `dataset-mismatch`, `no-entries:wrangler`, `no-entries:pulumi`.
  - Files: `scripts/check-analytics-bindings.mjs` (new),
    `scripts/__tests__/check-analytics-bindings.test.mjs` (new), root
    `package.json` (`repo-audit` chain at `:16` — insert
    `&& node scripts/check-analytics-bindings.mjs` right after
    `node scripts/check-service-bindings.js` — and a
    `"check:analytics-bindings"` script beside `check:service-bindings` at `:21`).
  - Red: the test imports the four exports — fails to resolve. Cases, one `it`
    each: (a) `parseWranglerAnalytics` on the real `wrangler.toml` text →
    `[{ binding: "ANALYTICS", dataset: "edge_requests" }]`; on `[[services]]`-only
    text → `[]`. (b) `parsePulumiAnalytics` on the real `index.ts` text → one
    entry; on the same literal reflowed across four lines → still one; on text
    with no `analytics_engine` → `[]`. (c) `diffAnalyticsBindings`: all three
    agree → `[]`; wrangler has it, Pulumi `[]` → kinds include
    `missing-in-pulumi` AND `no-entries:pulumi`; the reverse →
    `missing-in-wrangler` AND `no-entries:wrangler`; same binding, different
    datasets → `dataset-mismatch`; schema constants naming a different
    dataset → `dataset-mismatch`; **both configs empty → NOT `[]`** (the
    anti-vacuous rule — a parser that matches nothing must be a failure, never
    a pass; this is the single assertion that would have caught the defect).
    (d) `findAnalyticsBindingFindings(REPO_ROOT)` → `findings: []` with
    `wrangler.length >= 1` and `pulumi.length >= 1` asserted explicitly; and on
    a tmp-dir fixture (`writeInfra` style, `check-service-bindings.test.mjs:6-14`)
    reproducing the pre-fix production state verbatim — the real
    `[[analytics_engine_datasets]]` block in wrangler.toml, the six-entry
    bindings array from `index.ts:311-318` as it stood before item 1 — kinds
    include `missing-in-pulumi`.
  - Prove: `pnpm --dir scripts test` → green, including
    `check-fitness-check-wiring.test.mjs` (it requires the filename to appear
    in root `package.json`; the chain edit satisfies it — do not allowlist);
    `node scripts/check-analytics-bindings.mjs` → exit 0 (read `$?` on the bare
    command, never through a pipe) with a PASS line naming all three sources;
    `pnpm --dir scripts lint` → exit 0.
  - Accept: all Prove commands hold; `grep -c "check-analytics-bindings.mjs"
package.json` prints `2`; the root `package.json` edit fires the
    `regen-dep-graph.sh` PostToolUse hook and leaves
    `infrastructure/worker/dep-graph.json` and
    `docs/architecture/dependency-graph.md` unchanged (a scripts-chain edit does
    not alter the package graph — confirm with `git status --short` on those
    two paths). The live mutation demo (remove the Pulumi entry, guard exits 1,
    restore) is Verify's.
  - Blocked by: 1 (else case (d) on the real tree yields `missing-in-pulumi`
    and the tree is red between items), 2 (S3)

## Milestone 2: the read path exists, and the banner stops lying

Demonstrable at the boundary: `node scripts/edge-usage.mjs` with no env exits 1
saying exactly which variable is missing; its test pins the request Cloudflare
will receive down to the SQL text; the rialto-web preferences dialog renders
three toggles and a visitor whose browser still holds `analytics: true` is read
without crash and without write-back.

- [x] **4. `scripts/edge-usage.mjs` — requests per route and pathname over a
      trailing window** — pure `buildUsageQuery({ days = 7, route })` builds the
      SQL from `EDGE_REQUESTS_COLUMNS` and `EDGE_REQUESTS_DATASET`;
      `parseArgs(argv)` hand-rolled like `record-audit-check.mjs:45`
      (`--days` integer 1..90, `--route` matching `^[a-z][a-z0-9_-]*$`, anything
      else a usage error; the allowlist IS the injection boundary because the
      API takes raw SQL); `queryEdgeUsage({ fetchImpl, accountId, token, sql })`
      POSTs to
      `https://api.cloudflare.com/client/v4/accounts/{accountId}/analytics_engine/sql`
      with `Authorization: Bearer {token}` and the SQL as the body;
      `parseRows(text)` splits JSONEachRow; `main(env, { fetchImpl = fetch,
argv })` wires `requireEnv` (six lines copied from `resource-audit.mjs:34-39`,
      same message text, `CLOUDFLARE_API_TOKEN` then `CLOUDFLARE_ACCOUNT_ID`),
      args, the call and printing, and RETURNS 0/1; the entry guard
      `process.argv[1] === fileURLToPath(import.meta.url)` calls
      `process.exit(await main(process.env, { argv: process.argv.slice(2) }))`.
      Default SQL, whitespace aside, is architecture § Interfaces verbatim:
      `SELECT blob1 AS route, blob4 AS pathname, SUM(_sample_interval) AS requests FROM edge_requests WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY route, pathname ORDER BY requests DESC LIMIT 100 FORMAT JSONEachRow`.
  - Files: `scripts/edge-usage.mjs` (new), `scripts/__tests__/edge-usage.test.mjs` (new).
  - Red: the test imports `buildUsageQuery`, `parseArgs`, `queryEdgeUsage`,
    `parseRows`, `main` — fails to resolve. Cases: (a) `buildUsageQuery()`
    whitespace-normalised equals an expectation the test assembles from
    `EDGE_REQUESTS_COLUMNS.route` / `.pathname` and `EDGE_REQUESTS_DATASET`
    imported from `../infrastructure/worker/analytics-schema.js` — never the
    literals `blob1` / `blob4` / `edge_requests` — so a layout change fails
    here too; it contains `SUM(_sample_interval)` and `FORMAT JSONEachRow` and
    never `COUNT(`. (b) `buildUsageQuery({ days: 30, route: "rialto" })`
    contains `INTERVAL '30' DAY` and `AND blob1 = 'rialto'`. (c) `parseArgs`:
    `[]` → days 7, no route; `["--days","0"]`, `["--days","91"]`,
    `["--days","7.5"]`, `["--route","x' OR 1=1"]`, `["--route","Rialto"]`,
    `["--bogus"]` → each yields a usage error and the bad value never reaches
    `buildUsageQuery`. (d) `queryEdgeUsage` with a `vi.fn()` fetch: called once;
    URL exactly `…/accounts/acct/analytics_engine/sql`; `method: "POST"`;
    `Authorization: Bearer tok`; `body === sql`. (e) 401 and 403 responses →
    an error whose message matches `/Analytics Engine SQL API failed: 40[13]/`
    and contains `Account Analytics Read`; 500 → contains `500` and the body.
    (f) `parseRows` on two lines → two objects; `""` → `[]`; a non-JSON line →
    error. (g) `main({}, { fetchImpl, argv: [] })` → returns 1 and stderr
    carries `Missing required environment variable: CLOUDFLARE_API_TOKEN`;
    with both env vars and a zero-row body → returns 0 and stdout contains
    `0 rows — see docs/runbooks/edge-usage.md`; with rows → one line per row;
    a usage error → returns 1 and prints usage. `process.exit` is never called
    inside `main`.
  - Prove: `pnpm --dir scripts test` → green; `node scripts/edge-usage.mjs`
    with the two variables unset → exit 1 (bare `$?`) and the
    `Missing required environment variable` line;
    `node scripts/edge-usage.mjs --days 0` → exit 1 with usage;
    `pnpm --dir scripts lint` → exit 0 (`security/detect-non-literal-regexp`
    is on — keep the route pattern a literal).
  - Accept: all Prove commands hold; the script imports the schema module and
    contains no `blob`/`double` column literal of its own. ⛔ No real query is
    run: no token with _Account · Account Analytics · Read_ exists to this run
    (`docs/SECRETS.md:18` scopes `MBE_CLOUDFLARE_API_TOKEN` to Pages deploys,
    KV, DNS, Pulumi). The item is complete without it and `verification.md`
    must say so in those words.
  - Blocked by: 2
- [x] **5. Remove the cookie banner's `analytics` toggle** — `analytics` leaves
      `CookiePreferences`, `DEFAULT_PREFERENCES`, `ALL_ACCEPTED`
      (`useCookieConsent.ts:5-33`), the `CATEGORIES` entry and the
      `analytics: draft.analytics` line in `handleSave` (`CookieConsent.tsx:85,124`),
      and the banner sentence drops "analyze site traffic" (`:52`).
      `readStoredConsent()` (`:35-56`) stops spreading `parsed.preferences` and
      picks known keys explicitly — `{ essential: true, functional:
Boolean(p?.functional), marketing: Boolean(p?.marketing) }` — so a stored blob
      still carrying `analytics: true` is read without crash and without
      write-back; the stale key evaporates on the visitor's next save. Hook API
      shape (`preferences`, `acceptAll`, `rejectAll`, `savePreferences`,
      `reset`) is unchanged. Five files in one cycle — the type change makes
      hook and dialog one compile unit (see `assumptions:`).
  - Files: `apps/rialto-web/src/components/CookieConsent/useCookieConsent.ts`,
    `CookieConsent.tsx`, `useCookieConsent.test.ts`, `CookieConsent.test.tsx`,
    `apps/rialto-web/src/layouts/DemoLayout.test.tsx:23`.
  - Red: in `useCookieConsent.test.ts`, (a) "ignores a previously stored
    `analytics` key without writing back": seed
    `{"consented":true,"preferences":{"essential":true,"analytics":true,"functional":false,"marketing":true}}`
    under `rialto-cookie-consent`; expect `result.current.preferences` to
    deep-equal `{ essential: true, functional: false, marketing: true }` (no
    `analytics` key — fails today, the spread keeps it) and
    `localStorage.getItem(STORAGE_KEY)` to still equal the seeded string;
    (b) `DEFAULT_PREFERENCES` deep-equals `{ essential: true, functional: false,
marketing: false }` — fails today. Green: the hook. Then the dialog and every
    fixture until typecheck is clean: `CookieConsent.test.tsx` loses
    `analytics: false` from its seven fixture literals (`:110,129,136,147,163,184,206`),
    `toHaveLength(4)` → `3` (`:171`) and the toggle-index comments
    (`toggles[1]` is now Functional); `useCookieConsent.test.ts` drops the
    `analytics` expectations at `:29,44,57,68,77,105,115,133`;
    `DemoLayout.test.tsx:23` → `preferences: { functional: false, marketing: false }`.
    Leave `e2e/demo-nav.spec.ts:71` and `e2e/visual.spec.ts:126` alone — they
    seed the legacy blob and now exercise the read path in a real browser.
  - Prove: `pnpm --dir apps/rialto-web test` → green;
    `pnpm --dir apps/rialto-web typecheck` → exit 0 (`tsconfig.json` includes
    `src`, so a missed fixture fails here, not in production);
    `pnpm --dir apps/rialto-web lint` → exit 0.
  - Accept: all Prove commands hold; `grep -rn "analytics" apps/rialto-web/src
--include="*.ts" --include="*.tsx"` returns only
    `pages/PrivacyPage.tsx` (`:48,72,95` — out of scope per architecture
    § Decisions, carried as a seed in § Notes); the dialog renders exactly
    three toggles; after committing, the regenerated `apps/rialto-web/llms.txt`
    and `llms-full.txt` are staged by path and folded into this item's commit.
  - Blocked by: 0 (independent of Milestone 1; may run in parallel with it)

## Milestone 3: a future retro can find the number and read it correctly

Demonstrable at the boundary: someone closing a run against a static route opens
`docs/runbooks/edge-usage.md` from the weekly-review checklist, runs one command,
and knows what "0 rows" means on the day of the deploy versus a week later.

- [x] **6. Runbook `docs/runbooks/edge-usage.md`, two pointers, and the line-13
      claim** — sibling format (`# Runbook: Edge usage`, Quick Diagnosis, Common
      Causes, Recovery Steps — cf. `docs/runbooks/deploys-unhealthy.md`) plus
      the architecture's five: **When to run this** (Operate stage of any run
      that ships a public surface; weekly review); **What zero rows means in
      the first hours after deploy** (points arrive within minutes of the
      `pulumi-up.yml` run that carries the binding completing on `main`;
      nothing before it; still nothing after a day of site traffic → run
      `node scripts/check-analytics-bindings.mjs` and read the `pulumi-up.yml`
      run); **Undercount caveat** (SPA navigations never reach the edge — only
      document, asset and API requests are counted, so per-page numbers read
      low); **Token provisioning** (a Cloudflare API token with _Account ·
      Account Analytics · Read_, distinct from `MBE_CLOUDFLARE_API_TOKEN` whose
      documented scopes at `docs/SECRETS.md:18` do not include it;
      `CLOUDFLARE_ACCOUNT_ID` is not a credential, `SECRETS.md:29`); **Limits**
      (Free: 100k data points written/day, 10k read queries/day; retention
      three months; the pricing page's "you will not be billed" wording and its
      "coming months" caveat). Includes the exact command with both env names,
      the `--days`/`--route` flags as item 4 implemented them, the column table
      from architecture § Data model, and the sentence "counts are
      `SUM(_sample_interval)`, never `COUNT()`". Pointers: `docs/README.md:19`
      runbooks row gains the word "usage"; `docs/PLAYBOOK.md:972` ("Check
      analytics…") gains `→ [docs/runbooks/edge-usage.md](runbooks/edge-usage.md)`
      as a link that resolves from `docs/`. Backlog: append
      ` (claimed: maintenance:rialto-web-usage-instrumentation)` to line 13 of
      `docs/backlog.md` and change nothing else in that file.
  - Files: `docs/runbooks/edge-usage.md` (new), `docs/README.md`,
    `docs/PLAYBOOK.md`, `docs/backlog.md`.
  - Red: none — documentation. The mechanical checks below are the gate.
  - Prove: `pnpm exec prettier --check docs/runbooks/edge-usage.md
docs/README.md docs/PLAYBOOK.md docs/backlog.md
docs/fixes/rialto-web-usage-instrumentation/` → exit 0 (docs-only diffs skip
    CI's prettier check and poison later builds — see gotchas § CI);
    `node scripts/audit-markdown.mjs` → exit 0 (no broken relative links);
    `sed -n '13p' docs/backlog.md` ends with the claim marker and
    `git diff --stat origin/main -- docs/backlog.md` shows only lines 12–13 and
    the appended seed changed; `grep -c "edge-usage.md" docs/PLAYBOOK.md` ≥ 1;
    `sed -n '19p' docs/README.md` contains "usage".
  - Accept: all Prove commands hold; `grep -c "^## " docs/runbooks/edge-usage.md`
    ≥ 8 (the three sibling sections plus the five above); the runbook names
    `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUM(_sample_interval)`,
    and `scripts/edge-usage.mjs` verbatim; every flag and message it quotes
    exists in the script (spot-check by grep).
  - Blocked by: 4 (write the runbook after the CLI it describes exists)
- [x] **7. Implement exit gates** — the brief's "`pnpm typecheck` before
      declaring any stage done" and the architecture's "`pnpm repo-audit` still
      green", run on the whole tree after items 1–6. A chained `&&` audit
      reports only its first failure, so re-run to green rather than reasoning
      from the last output (precedent note, 2026-09-02).
  - Files: none.
  - Red: none.
  - Prove: `pnpm typecheck` → exit 0; `pnpm repo-audit` → exit 0 (includes the
    new guard, `check:prettier` over the tree, `check-fitness-check-wiring`'s
    haystack via `pnpm --dir scripts test` is separate — run that too);
    `pnpm regen --check` → exit 0 (llms drift from items 1 and 5);
    `pnpm --dir infrastructure/worker test`, `pnpm --dir infrastructure/pulumi test`,
    `pnpm --dir scripts test`, `pnpm --dir apps/rialto-web test` → all green;
    `git status --short` shows ` M README.md` and `?? docs/autonomous-loop.svg`
    and nothing staged; `git log --oneline origin/main..HEAD` lists only this
    run's commits.
  - Accept: every command exits 0, and the exact output lines are quoted, dated,
    into § Notes so Verify can diff its own run against them.
  - Blocked by: 1, 2, 3, 4, 5, 6

## Design gaps found

None routed back to Architect. Four things recorded so nobody chases them:

- **`WorkersScriptBinding.type` is `pulumi.Input<string>`, not a union of the
  documented values** (`input.d.ts:15748`). TypeScript will accept
  `"analytics-engine"` or `"analytics_engin"` without complaint; only the item-1
  test and the item-3 guard pin the literal. This is why the guard's S2 regex
  anchors on the exact string `"analytics_engine"`.
- **The architecture's `DemoLayout.test.tsx:23` lives at
  `apps/rialto-web/src/layouts/DemoLayout.test.tsx:23`**, not under
  `src/components/`. Line number correct, directory omitted. Item 5 carries the
  full path.
- **The cited import precedent is a package import, not a relative one.**
  `apps/rialto-web/e2e/csp.spec.ts:11` imports `@mbe/edge-worker/csp.js` with
  `"@mbe/edge-worker": "workspace:*"` in rialto-web's devDependencies
  (`package.json:45`). `scripts/package.json` already carries workspace
  dependencies, so that form was available; the breakdown keeps the
  architecture's relative `../infrastructure/worker/analytics-schema.js` because
  it needs no `package.json` edit and therefore no dependency-graph regeneration.
  Either works; this one is smaller.
- **Two E2E specs seed `analytics: true`** (`e2e/demo-nav.spec.ts:71`,
  `e2e/visual.spec.ts:126`), unlisted by the architecture. Kept deliberately —
  see `assumptions:`.

## Notes

- **Implement log — item 0 (2026-09-03).** Branch
  `fix/rialto-web-usage-instrumentation` created from `origin/main`
  (`5f642aa42`); the worktree HEAD was `faea42888`, one commit behind, and that
  commit touched only `metrics/production-health/2026-09-04.jsonl`. Baselines,
  all green before any change: `pnpm --dir infrastructure/pulumi test` →
  `Tests 83 passed (83)`; `pnpm --dir infrastructure/worker test` →
  `Tests 249 passed (249)` (15 files); `pnpm --dir apps/rialto-web test` →
  `Tests 730 passed (730)` (62 files). Two environment steps were needed before
  the rialto-web suite would load, neither a code change:
  `pnpm --dir packages/rialto build` (its `vitest.config.ts` resolves
  `@mattbutlerengineering/rialto/styles` and `/manifest` from `dist/`) and
  `pnpm --dir packages/api-client build` (rialto's built `ChatPanel` chunk
  imports `@mbe/api-client/streaming`, whose `default` export condition points
  at `dist/`). _Assumption:_ `autorun-brief.md` is committed with the paper
  trail — five paths, not the "exactly four" this item's Prove line names —
  because the orchestrator's brief lists it and all six prior runs that had a
  brief committed theirs (`git ls-files 'docs/*/*/autorun-brief.md'`).
  _Adjacent smell, not fixed:_ `apps/rialto-web/token-count.config.ts`'s
  documented fallback (`require.resolve("@mattbutlerengineering/rialto/package.json")`)
  cannot work — `./package.json` is not in rialto's `exports` map — so an
  unbuilt rialto fails config load with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  instead of falling back to the token CSS sources as the comment promises.
- **Implement log — item 1 (2026-09-03).** RED:
  `× edge router has an Analytics Engine binding for the edge_requests dataset` /
  `AssertionError: expected undefined to be defined` /
  `Tests 1 failed | 83 passed (84)`. GREEN after adding the literal at
  `index.ts:322`: `Tests 84 passed (84)`; `pnpm --dir infrastructure/pulumi
typecheck` → exit 0; `lint` → exit 0;
  `grep -c "analytics_engine" infrastructure/pulumi/index.ts` → `1`. Environment
  note for later stages: the pre-commit `check-adr` hook runs `tsx src/index.ts`
  in `tools/cli`, which imports `@mbe/agent-core/dist` — absent in this
  worktree until `pnpm build --filter @mbe/cli...` was run once (the gotcha in
  `.claude/rules/gotchas.md § Build / pnpm / turbo`); the first item-0 commit
  attempt failed on it, nothing was committed, and the retry after the build
  succeeded.
- **Implement log — item 2 (2026-09-03).** RED:
  `Error: Cannot find module './analytics-schema.js'` / `Test Files 1 failed (1)`.
  GREEN: `✓ analytics-schema.test.js (4 tests)`. After the writer refactor and
  the pin: `pnpm --dir infrastructure/worker test` → `Tests 254 passed (254)`
  (was 249; +4 schema, +1 pin), "Analytics Engine" describe 3 → 4 with
  `does not fail when ANALYTICS binding is absent` still green;
  `test:coverage` → exit 0 (`All files 90.35 | 80.99 | 95.23 | 91.04` against
  floors 88/78/92/88); `lint` → exit 0; `grep -n "blobs: \["
infrastructure/worker/edge-router.js` → no match. _Design note:_
  `toDataPoint` keeps a positional literal rather than deriving positions from
  `EDGE_REQUESTS_COLUMNS` at runtime — the architecture frames the test as the
  thing that "asserts `toDataPoint` positions equal `EDGE_REQUESTS_COLUMNS`",
  which only pins something if the two are stated independently; the test
  derives positions from the map, the module states them once as an array.
- **Implement log — item 3 (2026-09-03).** RED:
  `Error: Cannot find module '../check-analytics-bindings.mjs'`. GREEN:
  `✓ scripts/__tests__/check-analytics-bindings.test.mjs (14 tests)`;
  `node scripts/check-analytics-bindings.mjs` → exit 0, `PASS: wrangler.toml,
pulumi/index.ts and analytics-schema.js agree on the Analytics Engine binding
(ANALYTICS → edge_requests).`; `pnpm --dir scripts test` →
  `Test Files 157 passed (157)` / `Tests 3041 passed (3041)` with
  `check-fitness-check-wiring.test.mjs` green off the `package.json` chain edit
  (no allowlist entry); `pnpm --dir scripts lint` → exit 0;
  `grep -c "check-analytics-bindings.mjs" package.json` → `2`;
  `infrastructure/worker/dep-graph.json` and
  `docs/architecture/dependency-graph.md` unchanged after the `package.json`
  edit. _Assumption:_ the S2 regex is the spec's plus an optional trailing
  comma before `}` — prettier's `trailingComma: "es5"`
  (`packages/config/prettier/index.js`) puts one on any multi-line reflow of
  the literal, and the spec's own case (b) requires a reflow to still parse;
  the reflow fixture in the test carries that comma. _Adjacent smell, not
  fixed:_ `scripts/README.md`'s check-script table lists 8 of the 26
  `scripts/check-*` files (18 were already absent before this run), so it is
  not a maintained list and the new guard was not added to it.
- **Implement log — item 4 (2026-09-03).** RED:
  `Error: Cannot find module '../edge-usage.mjs'`. GREEN:
  `✓ scripts/__tests__/edge-usage.test.mjs (23 tests)`; `pnpm --dir scripts
test` → `Test Files 158 passed (158)` / `Tests 3064 passed (3064)`;
  `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node scripts/edge-usage.mjs`
  → `Missing required environment variable: CLOUDFLARE_API_TOKEN`, `exit=1`;
  `node scripts/edge-usage.mjs --days 0` → `Invalid --days "0": expected an
integer from 1 to 90` + usage, `exit=1`; `pnpm --dir scripts lint` → exit 0;
  `grep -nE "blob[0-9]|double[0-9]" scripts/edge-usage.mjs` → no match (the
  dataset name appears once, in the file's doc comment, never in code — it is
  read from `EDGE_REQUESTS_DATASET`). ⛔ **No real query was run**: no token
  with _Account · Account Analytics · Read_ exists to this run
  (`docs/SECRETS.md:18` scopes `MBE_CLOUDFLARE_API_TOKEN` to Pages deploys,
  KV, DNS, Pulumi); the request shape is pinned against a `vi.fn()` fetch only.
  _Assumptions:_ (1) `requireEnv` reads the injected `env` argument rather
  than `process.env` — the six lines and message text are otherwise
  `resource-audit.mjs:34-39` verbatim; that is the seam that makes the
  missing-env path testable without spawning. (2) `main` also accepts injected
  `stdout`/`stderr` writers (defaulting to `process.*`) for the same reason.
  (3) The 401/403 message reads "the token needs the Account Analytics Read
  scope (Cloudflare dashboard: Account · Account Analytics · Read)" so it
  contains both the architecture's dotted form and the breakdown's plain
  `Account Analytics Read` substring. (4) `buildUsageQuery` re-validates
  `days`/`route` and throws — a second check at the interpolation point, so
  the allowlist holds even for a caller that bypasses `parseArgs`. (5) With
  rows, output is a header + one line per row + a one-line summary naming
  `SUM(_sample_interval)`; with zero rows, only the runbook pointer.
- **Implement log — item 5 (2026-09-03).** RED (`useCookieConsent.test.ts`):
  `Tests 2 failed | 9 passed (11)` — `× ignores a previously stored
`analytics` key without writing back` and `× has no analytics preference —
edge request logging is server-side and cookie-free`, both
  `AssertionError: expected { essential: true, …(3) } to deeply equal
{ essential: true, …(2) }` with `+ "analytics": true` / `+ "analytics": false`
  in the diff — the spread kept the legacy key and `DEFAULT_PREFERENCES` still
  carried it. GREEN: `pnpm --dir apps/rialto-web test` → `Test Files 62 passed
(62)` / `Tests 732 passed (732)`; `typecheck` → exit 0; `lint` → exit 0
  (154 warnings, 0 errors, all pre-existing
  `react-refresh/only-export-components`). Diffstat: 5 files, 53+/37−; the
  dialog test pins `toHaveLength(3)`. _Deviation from Accept:_ the clause
  "`grep -rn "analytics" apps/rialto-web/src …` returns only
  `pages/PrivacyPage.tsx`" was already false at baseline — it also matches
  `pages/navigation/NavbarPage.tsx:54-55` (a demo nav item `id: "analytics"`)
  and `pages/examples/PricingTableExamplePage.tsx:50,67,84` (`"Revenue
analytics"` pricing copy). Both are showcase demo content with no relation to
  consent and pre-date this run, so they are left untouched. After item 5 the
  grep's hits are exactly: those two files, `PrivacyPage.tsx:48,72,95` (as
  expected), and the word inside the new tests and code comment that describe
  the legacy-key read path (`useCookieConsent.test.ts:139-158`,
  `CookieConsent.test.tsx:170`, `useCookieConsent.ts:46-47`). No `analytics`
  key remains in any type, constant, fixture or expectation. _Assumptions:_
  (1) `readStoredConsent` types the parsed blob as
  `{ consented?: unknown; preferences?: Record<string, unknown> }` and reads
  `consented: Boolean(parsed.consented)` — previously `parsed.consented` passed
  through raw under an `as ConsentState` cast, so a blob missing the key
  yielded `undefined` typed as `boolean`; `Boolean()` is the same falsy
  outcome, now type-honest. (2) Two former `analytics` assertions were
  re-pointed rather than deleted so the tests keep their bite: "acceptAll
  persists to localStorage" now asserts `stored.preferences.functional` (was
  `.analytics`), and "restores consent from localStorage on mount" seeds and
  asserts `marketing: true` (was `analytics: true`). _Adjacent smell (not
  fixed):_ `PrivacyPage.tsx:48,72,95` still tells visitors analytics cookies
  may be set — already carried as a seed below.
- **Implement log — branch reconciliation before item 6 (2026-09-12).** Items
  0–5 landed on 2026-09-03 and the branch then sat untouched for nine days:
  `git rev-list --left-right --count origin/main...HEAD` → `165	6`, never
  pushed. Reconciled by **merge**, not rebase (`3c3fe2306`) — the branch and
  `main` both changed `docs/backlog.md` and `package.json`, and a rebase would
  replay those conflicts across all six commits while a merge resolves each
  once. Two conflicts, both content: (1) `docs/backlog.md` — append-only, so
  BOTH sides' additions were kept and no existing line was reordered (this
  run's one seed first, then `main`'s 29; file is now 130 lines); (2)
  `package.json` `repo-audit` — `main` had added
  `node scripts/check-ci-gate-coverage.mjs` and moved `pnpm audit
--audit-level=high` out of the chain into its own `audit:security` script
  (gotchas § Dependencies, #4993), while this branch had inserted
  `node scripts/check-analytics-bindings.mjs`; resolved as the union on top of
  `main`'s version, our guard kept in its original slot after
  `check-service-bindings.js`. All four run artifacts and all six commits
  survived. Every file:line citation in item 6 was then re-verified by content
  in the merged tree and **all four still resolve exactly as written**:
  `docs/backlog.md:13` is still the cookie-banner seed, `docs/README.md:19` is
  still the runbooks row, `docs/PLAYBOOK.md:972` is still the "Check
  analytics…" line, and `docs/SECRETS.md:18`/`:29` still carry the
  `MBE_CLOUDFLARE_API_TOKEN` (Pages deploys, KV, DNS, Pulumi) and
  `CLOUDFLARE_ACCOUNT_ID` ("not a secret per se") rows the runbook quotes. No
  discrepancy to record.
- **Implement log — item 6 (2026-09-12).** No RED — documentation. Prove, run
  in the merged tree: `pnpm exec prettier --check` over the four files plus the
  run directory → `All matched files use Prettier code style!`, exit 0;
  `sed -n '13p' docs/backlog.md` ends
  `…(from: feature:rialto-game-ui) (claimed: maintenance:rialto-web-usage-instrumentation)`;
  `git diff --stat origin/main -- docs/backlog.md` → `1 file changed, 3
insertions(+), 2 deletions(-)` (lines 12 and 13's claim markers plus this
  run's appended seed — nothing else);
  `grep -c "edge-usage.md" docs/PLAYBOOK.md` → `1`;
  `sed -n '19p' docs/README.md` contains `usage`;
  `grep -c "^## " docs/runbooks/edge-usage.md` → `9` (≥ 8);
  `grep -cF` in the runbook: `CLOUDFLARE_API_TOKEN` 4, `CLOUDFLARE_ACCOUNT_ID`
  3, `SUM(_sample_interval)` 2, `scripts/edge-usage.mjs` 3. Every message the
  runbook quotes was verified by **running** the script, not by transcription:
  `node scripts/edge-usage.mjs --days 0` →
  `Invalid --days "0": expected an integer from 1 to 90`, exit 1;
  `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node
scripts/edge-usage.mjs` → `Missing required environment variable:
CLOUDFLARE_API_TOKEN`, exit 1; `ZERO_ROWS_MESSAGE`, `SCOPE_HINT`,
  `--days <n>`, `--route <name>`, `JSONEachRow`, `DEFAULT_DAYS = 7`,
  `MAX_DAYS = 90` and `ROUTE_PATTERN = /^[a-z][a-z0-9_-]*$/` all matched
  `scripts/edge-usage.mjs` verbatim, and the runbook's column table matched
  `infrastructure/worker/analytics-schema.js` field-for-field. The four
  `routeName` values it names (`hospitality`, `rialto`, `gen`, `marketing`)
  come from `infrastructure/worker/routes-config.json`; `"api"` is
  `edge-router.js:246`. ⛔ **`node scripts/audit-markdown.mjs` exits 1, and it
  is NOT this run's doing** — the single finding is
  `packages/rialto-plugin/skills/rialto/SKILL.md:104 [broken-link]
"../../generated/component-reference.md"`, which is present on `origin/main`
  unchanged since #1397 and which this branch does not touch
  (`git diff --name-only origin/main...HEAD | grep -c rialto-plugin` → `0`).
  Zero findings against any file this item wrote. Recorded as an honest
  failure of the Prove line's global exit code rather than forced to match.
  _Deviation from the written scope, one sentence of judgement:_ the runbook's
  "What zero rows means" section told a reader rows appear after the
  `pulumi-up.yml` run carrying the binding completes on `main` — true in
  design, false today. Measured 2026-09-12: every recent `pulumi-up.yml` run on
  `main` ends `failure` at `Pulumi Refresh (Sync state with cloud)` in the
  `Deploy Infrastructure` job (runs `34676613113`, `34675873114`,
  `34674259495`, `34665165637`), so merging the binding will not produce a
  single row until that is fixed. A bullet saying exactly that, with the run
  ids, was added to the section, and the section's `gh run list` example gained
  `--branch main` so it answers the question the new bullet asks. Nothing else
  in the runbook was changed.
- **Implement log — item 7 (2026-09-12).** Every gate re-run on the merged
  tree, after `pnpm install --frozen-lockfile`,
  `pnpm build --filter @mbe/cli...` and
  `pnpm build --filter @mattbutlerengineering/rialto --filter @mbe/api-client`
  (the last is the item-0 environment step, still required — rialto-web's
  vitest config resolves `@mattbutlerengineering/rialto/styles` and
  `@mbe/api-client/streaming` from `dist/`). Exit codes and the lines Verify
  can diff against:

  | Gate                                    | Exit | Output                                                                       |
  | --------------------------------------- | ---- | ---------------------------------------------------------------------------- |
  | `pnpm typecheck`                        | 0    | `Tasks:    48 successful, 48 total` / `Time:    31.426s`                     |
  | `pnpm repo-audit`                       | 0    | `✔ no dependency violations found (2434 modules, 5747 dependencies cruised)` |
  | `pnpm regen --check`                    | 0    | `All generated artifacts are up to date.`                                    |
  | `pnpm --dir infrastructure/worker test` | 0    | `Test Files  16 passed (16)` / `Tests  269 passed (269)`                     |
  | `pnpm --dir infrastructure/pulumi test` | 0    | `Test Files  2 passed (2)` / `Tests  88 passed (88)`                         |
  | `pnpm --dir scripts test`               | 0    | `Test Files  166 passed (166)` / `Tests  3211 passed (3211)`                 |
  | `pnpm --dir apps/rialto-web test`       | 0    | `Test Files  66 passed (66)` / `Tests  767 passed (767)`                     |

  Counts moved from the item 1–5 baselines because the merge brought 165
  commits of `main` with it, not because anything here changed: worker
  254 → 269 (16 files, was 15), pulumi 84 → 88, scripts 3064 → 3211 (166
  files, was 158), rialto-web 732 → 767 (66 files, was 62). This run's own
  new suites all executed inside those totals —
  `check-analytics-bindings.test.mjs (14 tests)`,
  `edge-usage.test.mjs (23 tests)`, `analytics-schema.test.js (4 tests)` —
  and `check-fitness-check-wiring.test.mjs` is in the scripts run, green.
  `repo-audit` carried the new guard in its chain and printed
  `PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the
Analytics Engine binding (ANALYTICS → edge_requests).`; its
  `pnpm check:prettier` step over the whole tree printed
  `All matched files use Prettier code style!`. Note for anyone re-running
  this: `main` moved `pnpm audit --audit-level=high` out of `repo-audit` into
  a standalone `audit:security` script (#4993), so `repo-audit` no longer
  makes a network call and no longer fails on registry flake.
  `pnpm regen` was run and committed (`119a82c4a`) before `--check` — the
  root and `apps/rialto-web` llms bundles still embedded the pre-item-5
  `CookiePreferences` shape.
  `git status --short` → exactly ` M README.md` and `?? docs/autonomous-loop.svg`,
  nothing staged (`git diff --cached --name-only | wc -l` → `0`) — the
  2026-09-03 expectation held verbatim nine days later.
  `git log --oneline origin/main..HEAD` → eleven commits, all this run's: the
  original six, the reconciliation merge `3c3fe2306`, item 6 `2d74b59a6`, the
  llms regen `119a82c4a`, this item `0672fff7d`, and the pre-push ratchet
  resolution `69f415a4b` (see the entry below). Nothing foreign. Branch pushed
  to `origin` at `69f415a4b82a6b3f032497335e215571e5af8e9c`, verified against
  `git ls-remote` rather than the pipe's exit code. Prepare-and-stop: no PR,
  no merge, no deploy.

- **Implement log — the gate item 7 did not name: `.husky/pre-push`'s
  AI-antipattern ratchet (2026-09-12).** The push after item 7 was rejected by
  `scripts/check-ai-antipatterns.mjs` with three regressions —
  `hardcodedRoutes 693 → 694`, `anyType 291 → 292`, `consoleLogs 711 → 717`.
  The branch had never been pushed, so this was the ratchet's first sight of
  items 1–5; nothing in items 0–7's Prove lines runs it, which is why it
  surfaced only here. Attribution was measured, not assumed: `origin/main`
  checked out into a throwaway worktree scores **exactly** baseline on all
  eight patterns, and a per-file recount across both trees named three files
  and only three. Resolution:
  1. **`anyType` +1 — fixed, and it was not what it looked like.** The new
     `index.test.ts` assertion had copied the sibling tests' escape-hatch cast
     on `edgeRouter!.inputs.bindings`; it now narrows inline to
     `Array<{ name?: string; type?: string; dataset?: string }>` with `!` on
     the two reads, which is both stricter and drops an eslint-disable.
     `typecheck`, `lint` and `test` (88 passed) all still green. The first
     attempt at that fix did **not** move the count, because the explanatory
     comment I wrote contained the literal two-word cast — the scanner is a
     flat regex over file text with no comment stripping, so prose about a
     pattern counts as the pattern. Reworded; count back to 291.
  2. **`consoleLogs` +6 and `hardcodedRoutes` +1 — accepted, baseline updated**
     (`node scripts/check-ai-antipatterns.mjs --update`, which moved exactly
     those two counts and nothing else). The six are
     `check-analytics-bindings.mjs`'s three-source preamble — a CLI check
     script printing its own diagnosis, the same shape and the same count as
     its closest sibling `check-service-bindings.js`, whose six are already
     inside the 711. The one route literal is
     `analytics-schema.test.js:66`'s `pathname: "/api/v1/reservations"`
     fixture, which pairs with that case's `route: "api"`; `edge-router.test.js`
     already carries three of the same kind inside the baseline. Both are the
     rule's known false-positive shape (it targets route strings in production
     code), and neither has an honest fix — the only way to make either stop
     matching is to split or reword the literal, which games a regex rather
     than improving anything. ⛔ **Flagged for human review at Review/Ship:**
     this is a repo-wide ratchet being loosened by +7 for one run's
     convenience, and a reviewer may reasonably prefer the preamble be folded
     into `runCheck`'s pass/fail messages (the convention the newer
     `check-ci-gate-coverage.mjs` / `check-orphaned-tests.mjs` follow, both at
     zero `console.log`) instead.
- **Seeds for Operate to append to `docs/backlog.md` at run close** (Implement
  does not write them; the protocol's producers are Capture and Operate):
  1. Reword `apps/rialto-web/src/pages/PrivacyPage.tsx:48,72,95` — it still
     says "anonymous usage data via analytics cookies", "Analytics and
     functional cookies", and "third-party analytics providers" after the
     analytics toggle is gone, and it does not mention the server-side edge
     request log (route, method, country, pathname, status, elapsed ms; no
     cookie, no client identifier) that this run turned on. Architecture
     § Decisions scoped the privacy page out as prose deserving its own pass.
  2. Mark `docs/backlog.md:13` resolved for rialto-web once the merge that
     removes the toggle has landed — a `(claimed: …)` marker is all Implement
     writes; the resolved state is a fact only after Ship's PR merges, and
     this run is prepare-and-stop.
- **Verify owns** (per defect.md § Verify shape, not carried as checkboxes so a
  checked box can never stand in for the evidence): the live mutation of the
  drift guard (remove the Pulumi entry → exit 1 → restore); the optional
  read-only `gh workflow run pulumi-preview.yml --ref fix/rialto-web-usage-instrumentation`
  and reading `~ bindings` in its `preview.txt`; and the statement, in words,
  that no real Analytics Engine query was run because no token with Account
  Analytics Read exists to the run (⛔ in the brief). The first row in
  `edge_requests` is observable only after the post-merge `pulumi-up.yml` run,
  which is Ship's first human step in `release.md`.
- **Order of value.** Items 1–3 alone end the defect and guard its recurrence;
  they could ship without items 4–6 and the site would be counting. Items 4–6
  are what turn a count into an answer a retro can quote. Item 5 is a
  correctness fix to the UI's honesty and depends on none of it.
- **Two adjacent smells flagged by the architecture and not fixed here**, so
  Implement does not drift into them: `infrastructure/worker/wrangler.toml` is
  dead configuration for deploy purposes (kept for `wrangler dev`, the two
  bindings guards and `resource-audit`) and nothing warns a contributor that
  adding a binding there ships nothing; `csp.js:84-89` lets the KV key
  `security/csp` override any directive at runtime, so a CSP claim read from
  source is only a claim about the default.
