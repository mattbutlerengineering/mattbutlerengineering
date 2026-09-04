---
stage: architect
run: maintenance:rialto-web-usage-instrumentation
date: 2026-09-03
assumptions:
  - "No live user — autorun-brief.md is the whole interview; scaled as a maintenance run (bind what exists, delete what lies, add one read path)."
  - "The Cloudflare account is on the Workers Free plan. Taken from docs/evaluations/2026-03-25-routing-architecture.md:104 and 2026-02-26-hosting-providers.md:242 ('Free (…100K worker requests/day)'); not re-verified against the dashboard (no access this run)."
  - "The brief's 'rialto-game-ui-style retro checklist' has no in-repo counterpart (retro TEMPLATE is plugin-owned; docs/routines/mbe-weekly-retro.md is process-only). The pointer lands on the only checklist that mentions analytics — docs/PLAYBOOK.md Weekly Review Checklist ('Check analytics…') — plus the new runbook."
  - "Query-script env names reuse scripts/resource-audit.mjs's exact names, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (inputs silent on naming; one operator vocabulary beats two)."
  - "Runbook path is docs/runbooks/edge-usage.md, following the existing docs/runbooks/*.md format (brief says only 'under docs/')."
---

# Architecture: rialto-web usage instrumentation

## Approach

Almost nothing here is new capability. The edge router already writes one Analytics Engine data point per request (`infrastructure/worker/edge-router.js:60-69`, called at `:201` and `:282` on disjoint paths); the dataset is already named in `wrangler.toml:41-43`. The whole defect is that the Pulumi `WorkersScript` — the only declaration that deploys — never carried the `ANALYTICS` binding, so `if (!env.ANALYTICS) return;` has been the hot path since `bd5dd7083`.

The design is four moves, each small, in the order the value arrives:

1. **Bind what exists.** Add the `analytics_engine` binding to the Pulumi `WorkersScript` and assert it in `index.test.ts`. This is the fix.
2. **Make the field layout a module, not folklore.** The writer (`writeAnalytics`) and the reader (the new query script) must agree on which blob/double holds what. Today that agreement lives only in the writer's argument order. A tiny `analytics-schema.js` owns it; both sides import it; one test pins it.
3. **Guard against the shape of this defect recurring.** A sibling fitness check asserts wrangler, Pulumi and the schema module name the same binding and dataset, and _fails when either config parses to nothing_ — the exact vacuous pass that let this go unnoticed for months.
4. **Delete the lie, add the read path.** Remove the cookie banner's `analytics` toggle (it gates nothing; the instrumentation is server-side and cookie-free), and add `scripts/edge-usage.mjs` + a runbook so a retro can answer "did anyone hit `/…`?" with a number.

Cost and blind spots are stated up front rather than discovered later. Analytics Engine on the Free plan includes 100,000 data points written/day and 10,000 read queries/day (`developers.cloudflare.com/analytics/analytics-engine/pricing/`); the writer emits ≤1 point per Worker invocation, and a Workers Free account is itself capped at 100k requests/day, so writes cannot exceed the write allowance. Cloudflare also states "Currently, you will not be billed for your use of Workers Analytics Engine." No new paid infrastructure (PRODUCT.md:71,76). The counts see edge requests only: an SPA client-side navigation never reaches the Worker, so per-page numbers undercount — that goes in the runbook, not in a fix.

## Components

### `edge_requests` contract module — `infrastructure/worker/analytics-schema.js` (new)

- **Responsibility:** the single statement of the binding name, dataset name, and column layout of the `edge_requests` dataset. Exports `ANALYTICS_BINDING = "ANALYTICS"`, `EDGE_REQUESTS_DATASET = "edge_requests"`, `EDGE_REQUESTS_COLUMNS` (`route→blob1, method→blob2, country→blob3, pathname→blob4, status→double1, elapsedMs→double2, index→route`), and the pure `toDataPoint({ route, method, country, pathname, status, elapsedMs })` returning `{ blobs, doubles, indexes }` in that order. Plain ESM, zero imports.
- **Collaborators:** `edge-router.js` (`writeAnalytics` becomes `env[ANALYTICS_BINDING]?.writeDataPoint(toDataPoint({...}))` — dynamic binding lookup is already house style at `edge-router.js:231`); `scripts/edge-usage.mjs` (imports it by relative path, precedent `apps/rialto-web/e2e/csp.spec.ts:11` importing `@mbe/edge-worker/csp.js`); `scripts/check-analytics-bindings.mjs` (reads the two constants). esbuild bundles the sibling import into `dist/edge-router.js` exactly as it does `./circuit-breaker.js`. Test `analytics-schema.test.js` asserts `toDataPoint` positions equal `EDGE_REQUESTS_COLUMNS` — the one assertion that prevents writer/reader drift.

### Pulumi binding declaration — `infrastructure/pulumi/index.ts:306-320` (edit) + `index.test.ts` (edit)

- **Responsibility:** declare the binding on the deployed `WorkersScript`. Exact literal, from the installed `@pulumi/cloudflare` 6.19.0 types (`node_modules/@pulumi/cloudflare/types/input.d.ts:15589` `export interface WorkersScriptBinding`; `:15625` `dataset?: pulumi.Input<string | undefined>`; `:15684` `name: pulumi.Input<string>`; `:15748` `type: pulumi.Input<string>` with `analytics_engine` among the listed values):

  ```ts
  { name: "ANALYTICS", dataset: "edge_requests", type: "analytics_engine" },
  ```

- **Collaborators:** `pulumi-up.yml` (push to `main`, paths incl. `infrastructure/pulumi/**` and `infrastructure/worker/**`) deploys it; `pulumi-preview.yml` (`workflow_dispatch`-only, `refresh: false`) is the only pre-merge live check. The unit test finds the edge-router script via the existing `findResource(...)` helper and asserts `bindings.find(b => b.type === "analytics_engine")` has `name === "ANALYTICS"` and `dataset === "edge_requests"`. Honest limit: Pulumi mocks accept any input — the test proves _declaration_, not Cloudflare acceptance.

### Analytics bindings drift guard — `scripts/check-analytics-bindings.mjs` (new) + `scripts/__tests__/check-analytics-bindings.test.mjs` (new)

- **Responsibility:** fail `pnpm repo-audit` if the three declarations disagree. Sources: **S1** `wrangler.toml` `[[analytics_engine_datasets]]` tables → `{ binding, dataset }` (header-anchored regex in the style of `parseWranglerBindings`, matching the real layout at `:41-43`); **S2** `infrastructure/pulumi/index.ts` entries with `type: "analytics_engine"` → `{ name, dataset }` (regex `/\{\s*name:\s*"(\w+)",\s*dataset:\s*"(\w+)",\s*type:\s*"analytics_engine"\s*\}/g`, `\s*` so prettier reflow is harmless; order-dependent, matching the existing check's style); **S3** the schema module's two constants. Findings: any binding in one source and not another; any dataset mismatch for the same binding; **and zero entries in S1 or S2** (anti-vacuous rule — a parser that matches nothing must be a failure, never a pass).
- **Collaborators:** `scripts/lib/fitness-check.mjs` `runCheck` for exit code and output; root `package.json:16` `repo-audit` chain (append `node scripts/check-analytics-bindings.mjs`) and a `check:analytics-bindings` script beside `:21`. CI runs it in `ci.yml`'s `build` job, step `:319 - name: Run Full Repository Audit` / `:320 run: pnpm repo-audit`; `build` is in `ci-gate`'s `needs` (`:777-796`). Note the known gap: docs-only PRs skip `build` via `detect-changes.has_code`; a binding change is never docs-only, so the guard runs on every PR that can break it.

### Edge usage query script — `scripts/edge-usage.mjs` (new) + `scripts/__tests__/edge-usage.test.mjs` (new)

- **Responsibility:** answer "requests per route/path over the last N days" from a laptop with a token. Pure `buildUsageQuery({ days = 7, route })` builds the SQL from `EDGE_REQUESTS_COLUMNS`; `queryEdgeUsage({ fetchImpl, accountId, token, sql })` POSTs it; `main(env, { fetchImpl = fetch, argv })` wires env + args + printing. Entry guard `process.argv[1] === fileURLToPath(import.meta.url)`, `fetchImpl` injection, and `requireEnv` (six lines, copied from `resource-audit.mjs:34-39`, same message text) all follow `collect-domain-metrics.mjs` / `resource-audit.mjs`; `parseArgs` is hand-rolled like `record-audit-check.mjs:45`.
- **Collaborators:** Analytics Engine SQL API; the schema module; the runbook (which is where a human learns what "0 rows" means). Test injects `vi.fn()` fetch and asserts URL, method, `Authorization` header, SQL text (columns read from the schema import, so a layout change fails here too), missing-env exit, 401/403 message, and rejection of a malicious `--route`.

### Cookie consent — `apps/rialto-web/src/components/CookieConsent/*` (edit)

- **Responsibility:** stop offering a choice that controls nothing. `analytics` leaves `CookiePreferences`, `DEFAULT_PREFERENCES`, `ALL_ACCEPTED`, `CATEGORIES`, `handleSave`, and the banner copy ("…analyze site traffic…"). `readStoredConsent()` stops spreading `parsed.preferences` and picks known keys explicitly — `{ essential: true, functional: Boolean(p?.functional), marketing: Boolean(p?.marketing) }` — so a visitor whose `localStorage` still holds `analytics: true` is read without crash and without write-back; the stale key disappears on their next save.
- **Collaborators:** `DemoLayout.tsx` (unchanged API); `DemoLayout.test.tsx:23` fixture, `CookieConsent.test.tsx` (`toHaveLength(3)`, seven fixture literals), `useCookieConsent.test.ts` (drop `analytics` expectations, add "ignores a previously stored `analytics` key"). `tsconfig.json` `include: ["src"]` means `tsc --noEmit` typechecks the tests, so a missed fixture fails `pnpm --dir apps/rialto-web typecheck`, not production.

### Runbook and pointers — `docs/runbooks/edge-usage.md` (new), `docs/README.md:19`, `docs/PLAYBOOK.md` Weekly Review, `docs/backlog.md:13` (edits)

- **Responsibility:** make the read path findable at the moment someone asks the question. Runbook sections match the siblings (`# Runbook: Edge usage`, Quick Diagnosis, Common Causes, Recovery Steps) plus **When to run this** (Operate stage of any run that ships a public surface; weekly review), **What zero rows means in the first hours after deploy** (points arrive within minutes; nothing before `pulumi up` completes), **Undercount caveat** (SPA navigations), **Token provisioning** (a Cloudflare API token with _Account · Account Analytics · Read_, distinct from `MBE_CLOUDFLARE_API_TOKEN`, whose documented scopes at `docs/SECRETS.md:57` do not include it), **Limits** (Free: 100k writes/day, 10k reads/day; retention three months; "billing in coming months" per pricing page).
- **Collaborators:** `docs/README.md:19` runbooks row gains the word "usage"; `docs/PLAYBOOK.md` "Check analytics…" line gains `→ docs/runbooks/edge-usage.md`; `docs/backlog.md:13` gets `(claimed: maintenance:rialto-web-usage-instrumentation)` at Implement and is recorded resolved for rialto-web at Retro.

## Data model

One dataset, `edge_requests`, one row per edge-router invocation (fire-and-forget; `writeDataPoint` is non-blocking and never awaited). Analytics Engine columns: `dataset, timestamp, _sample_interval, index1, blob1..blob20, double1..double20`; retention three months; limits 20 blobs, 20 doubles, 1 index (≤96 bytes), 16 KB total blobs, ≤250 points per invocation (`…/analytics-engine/limits/`). This run uses 4 blobs, 2 doubles, 1 index.

| Field     | Column    | Source                               |
| --------- | --------- | ------------------------------------ |
| route     | `blob1`   | `"api"` or `routesConfig.routeName`  |
| method    | `blob2`   | `request.method`                     |
| country   | `blob3`   | `CF-IPCountry` header or `"unknown"` |
| pathname  | `blob4`   | `new URL(request.url).pathname`      |
| status    | `double1` | response status                      |
| elapsedMs | `double2` | `Date.now() - startTime`             |
| (index)   | `index1`  | route (sampling key)                 |

Access pattern that matters: **requests per route and pathname over a trailing window**. Analytics Engine samples under load, so counts are `SUM(_sample_interval)`, never `COUNT()` (`…/analytics-engine/sampling/`). Consistency is eventual and best-effort; a lost point is not an error anywhere in this system.

Persisted consent (rialto-web `localStorage`, key `rialto-cookie-consent`), after: `{ consented: boolean, preferences: { essential: true, functional: boolean, marketing: boolean } }`. Old records carrying `analytics` remain readable; the key is dropped on read.

## Interfaces & contracts

**Worker → Analytics Engine.** `env.ANALYTICS.writeDataPoint(toDataPoint(...))`. Input: the six fields above. Output: none. Failure modes: binding absent → early return (kept; the Pulumi test and drift guard are what make absence loud now); Cloudflare-side drop → silent by design.

**Query script → SQL API.** `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, header `Authorization: Bearer {CLOUDFLARE_API_TOKEN}`, body = SQL text (`…/analytics-engine/sql-api/`). Default query:

```sql
SELECT blob1 AS route, blob4 AS pathname, SUM(_sample_interval) AS requests
FROM edge_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY route, pathname
ORDER BY requests DESC
LIMIT 100
FORMAT JSONEachRow
```

The `NOW() - INTERVAL 'n' DAY` filter is the documented form (`developers.cloudflare.com/workers/examples/analytics-engine/`). Args: `--days <1..90>` (integer; 90 ≈ retention) and `--route <name>` (`^[a-z][a-z0-9_-]*$`, then `AND blob1 = '<route>'`); anything else is a usage error. Both values are interpolated only after validation — the API takes raw SQL, so the allowlist _is_ the injection boundary. Output: one line per row parsed from JSONEachRow, printed as a table; zero rows prints `0 rows — see docs/runbooks/edge-usage.md`. Exit codes: `0` success (zero rows included); `1` missing env (`Missing required environment variable: NAME`), usage error, non-2xx (`Analytics Engine SQL API failed: <status> <body>`; on 401/403 the message adds "token needs Account · Account Analytics · Read"), or unparsable body. One read query per run against a 10k/day allowance.

**Drift guard CLI.** `node scripts/check-analytics-bindings.mjs` → exit `0` with `passMessage` when all three sources agree and both configs are non-empty; exit `1` listing findings (`missing-in-pulumi`, `missing-in-wrangler`, `dataset-mismatch`, `no-entries:<source>`). Pure functions `parseWranglerAnalytics(text)`, `parsePulumiAnalytics(text)`, `diffAnalyticsBindings(wrangler, pulumi, schema)` are exported for the test.

**Consent hook.** `useCookieConsent()` keeps its shape (`preferences`, `acceptAll`, `rejectAll`, `savePreferences(Omit<CookiePreferences,"essential">)`, `reset`); only the type loses a key. Malformed or legacy stored JSON continues to resolve to defaults or to the explicit pick — never a throw.

## Stack & dependencies

No new dependencies. `@pulumi/cloudflare` stays at the installed `6.19.0` (`infrastructure/pulumi/package.json:18` `^6.19.0`, lockfile `6.19.0`). Node `fetch` (Node 22), vitest, esbuild bundling as today. `scripts/check-env-sync.js` scopes to `packages/*` and `services/*`, so the script's `process.env` reads in `scripts/` are outside its scan.

## Verification plan (nothing deploys)

- `pnpm --dir infrastructure/pulumi test` — new binding assertion passes (was: nothing asserted analytics).
- `pnpm --dir infrastructure/worker test` — `analytics-schema.test.js` + existing "Analytics Engine" describe (`edge-router.test.js:800-822`) pass; coverage thresholds hold.
- `pnpm --dir scripts test` — guard test: the real repo root yields 0 findings with non-empty S1/S2; a tmp-dir fixture with the binding in wrangler and absent from Pulumi (the production defect, verbatim) yields `missing-in-pulumi`; a fixture with an empty Pulumi bindings array yields `no-entries:pulumi`. Script test: mocked fetch asserts URL/header/SQL, 401 message, `--route "x' OR 1=1"` rejected.
- `node scripts/check-analytics-bindings.mjs` → exit 0 on the working tree; `pnpm repo-audit` still green.
- `pnpm --dir apps/rialto-web test` and `pnpm --dir apps/rialto-web typecheck`; `pnpm typecheck` at root.
- Optional live evidence, read-only: `gh workflow run pulumi-preview.yml --ref <branch>` and read `~ bindings` in the `preview.txt` artifact. `pulumi up` never runs in this run; the first live confirmation is the post-merge `pulumi-up.yml` run, after which the runbook query should return rows within minutes. If Cloudflare rejects the bindings update, `pulumi up` fails and the current script keeps serving; rollback is a revert.
- Not verifiable this run: any real query — no token with Account Analytics Read exists (⛔ surfaced in the brief and again below).

## Decisions & alternatives

- **Sibling `check-analytics-bindings.mjs`** over extending `check-service-bindings.js` — its `diffBindings` is a 3-way over a different source set (wrangler/routes-config/Pulumi) and compares names only; analytics needs a dataset comparison and the schema module as a source. Two 60-line checks beat one 150-line check with a mode flag.
- **Schema module** over a documented column map — a comment cannot be imported; the writer, the reader and the guard all import the same constants, and one test pins positions. Deletion test: remove it and the reader has to guess `blob4`.
- **Symmetric three-source drift check** over "Pulumi is truth" — `wrangler.toml` is dead config for deploys but it is what a human reads first (it is exactly what misled this run's own retro); keeping it honest is cheap and the anti-vacuous rule makes an empty parser a failure, not a pass.
- **Explicit key pick on read** over migrating stored consent — no write-on-read, no version field, no crash; the legacy key evaporates on the next save. Simplest safe option, as the brief asked.
- **Banner copy edit in, `PrivacyPage.tsx` out** — the banner sentence names analytics as a cookie purpose beside the toggle being removed; the privacy page (`:48,72,95`) is prose that now also omits server-side edge logging and deserves its own pass. Seeded as an adjacent smell, not fixed here.
- **`FORMAT JSONEachRow`** over the default `JSON` — the docs we could fetch name the formats but not the `JSON` envelope; one object per line is a contract the test can pin without guessing.
- **Copy `requireEnv`** over extracting it from `resource-audit.mjs` — six lines, two callers, no seam yet; extraction is a refactor for a later run.
- **No workflow for the script** — it needs a token the repo does not hold; a scheduled job would be a fifth cron producing a number nobody reads. The runbook and the weekly-review pointer are the trigger.
- **Reuse `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` names** over new `MBE_*` names — same vocabulary as `resource-audit.mjs`; the _token_ is different (scope), the _variable_ need not be.

## ADRs

None. No cross-cutting policy changes; the schema module is a local contract, and the guard follows the existing fitness-check convention.
