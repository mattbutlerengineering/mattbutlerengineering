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
- [ ] **2. `analytics-schema.js` — one statement of the `edge_requests` layout,
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
- [ ] **3. Drift guard `scripts/check-analytics-bindings.mjs`, wired into
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

- [ ] **4. `scripts/edge-usage.mjs` — requests per route and pathname over a
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
- [ ] **5. Remove the cookie banner's `analytics` toggle** — `analytics` leaves
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

- [ ] **6. Runbook `docs/runbooks/edge-usage.md`, two pointers, and the line-13
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
- [ ] **7. Implement exit gates** — the brief's "`pnpm typecheck` before
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
