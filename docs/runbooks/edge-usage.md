# Runbook: Edge usage

How many requests did a route or a page get? The Cloudflare Worker in
`infrastructure/worker/edge-router.js` writes one data point per request to the
`edge_requests` Analytics Engine dataset, and `scripts/edge-usage.mjs` reads it
back. No cookie, no client identifier, no script tag on the page — the count is
taken at the edge, so there is nothing for a visitor to consent to.

## When to run this

- **Operate stage of any run that ships a public surface.** Before closing the
  run, answer "did anyone hit `/…`?" with a number rather than a guess, and
  quote the number in the retro.
- **Weekly review.** [`docs/PLAYBOOK.md`](../PLAYBOOK.md) → Weekly Review
  Checklist → "Check analytics" points here.
- **Before deleting or redesigning a static route** — check it was unused
  before treating it as unused.

## Quick Diagnosis

```bash
# Requests per route and pathname over the last 7 days (the default window)
CLOUDFLARE_API_TOKEN=<token with Account · Account Analytics · Read> \
CLOUDFLARE_ACCOUNT_ID=<account id> \
node scripts/edge-usage.mjs

# One route, 30-day window. Route names are the routeName values in
# infrastructure/worker/routes-config.json (hospitality, rialto, gen, marketing)
# plus "api" for requests the router proxies to the API services.
node scripts/edge-usage.mjs --days 30 --route rialto
```

Flags: `--days <n>` is an integer from 1 to 90 (default 7; 90 is roughly the
retention window) and `--route <name>` must match `^[a-z][a-z0-9_-]*$`.
Anything else is a usage error, e.g.
`Invalid --days "0": expected an integer from 1 to 90`, exit 1. Both values are
interpolated into SQL only after validation — the API takes raw SQL, so that
allowlist is the injection boundary.

Successful output is a table followed by one summary line (illustrative
numbers):

```
route   pathname          requests
rialto  /rialto/          412
rialto  /rialto/assets/…  388

2 row(s) over the last 7 day(s), route rialto; requests = SUM(_sample_interval)
```

Counts are `SUM(_sample_interval)`, never `COUNT()`: Analytics Engine samples
under load, and the sample interval is the weight that restores the total. The
script issues exactly one read query per run.

## Data model

One row per edge-router invocation. The layout is declared once, in
`infrastructure/worker/analytics-schema.js`; the writer and the query both
import it, so the table below is documentation, not a second source of truth.

| Field       | Column    | Value                                                 |
| ----------- | --------- | ----------------------------------------------------- |
| `route`     | `blob1`   | `"api"`, or the `routeName` from `routes-config.json` |
| `method`    | `blob2`   | HTTP method                                           |
| `country`   | `blob3`   | `CF-IPCountry` header, or `"unknown"`                 |
| `pathname`  | `blob4`   | `new URL(request.url).pathname`                       |
| `status`    | `double1` | response status code                                  |
| `elapsedMs` | `double2` | milliseconds from request start to response           |
| (index)     | `index1`  | the route — Analytics Engine's sampling key           |

Binding name `ANALYTICS`, dataset `edge_requests`, declared in both
`infrastructure/worker/wrangler.toml` and `infrastructure/pulumi/index.ts`.
`node scripts/check-analytics-bindings.mjs` (part of `pnpm repo-audit`) fails
if either disagrees with the schema module.

## What zero rows means in the first hours after deploy

`0 rows — see docs/runbooks/edge-usage.md` is exit 0, not an error. What it
means depends on when you ask:

- **Before the binding is live: nothing, by design.** Points only start
  arriving once the `pulumi-up.yml` run that carries the `ANALYTICS` binding
  has completed on `main` — the Pulumi `WorkersScript` resource is the only
  deploy path (`wrangler.toml` is not what deploys). Until then the Worker's
  `writeAnalytics()` finds no `env.ANALYTICS` and returns early.
- **Known blockage as of 2026-09-12: `pulumi-up.yml` cannot complete on `main`
  at all.** Every recent run on `main` ends `failure` at the
  `Pulumi Refresh (Sync state with cloud)` step of the `Deploy Infrastructure`
  job (measured on runs `34676613113`, `34675873114`, `34674259495`,
  `34665165637`). Until that is fixed, merging the binding does **not** make
  rows appear, and a zero-row read is the expected, correct answer rather than
  a sign this runbook's other causes apply. Confirm which state you are in with
  the `gh run list` command below before chasing anything else.
- **Minutes after that run: the first rows.** Analytics Engine is eventually
  consistent; expect the first points within a few minutes of the deploy, not
  instantly, and expect small totals to move for a short while.
- **Still nothing after a day of site traffic: something is wrong.** Run
  `node scripts/check-analytics-bindings.mjs` and read the most recent
  `pulumi-up.yml` run. A run that reports `success` at the workflow level can
  still have skipped the `Deploy Infrastructure` job — check the job, not the
  workflow.

```bash
gh run list --workflow pulumi-up.yml --branch main --limit 5 \
  --json conclusion,createdAt,url \
  -q '.[] | "\(.conclusion)\t\(.createdAt)\t\(.url)"'
```

## Undercount caveat

The count sees **edge requests only**. The sites behind the router are
single-page apps, and a client-side navigation never leaves the browser — a
visitor who lands on `/rialto/` and clicks through six pages is one document
request, a handful of asset requests, and zero rows for those six pages.
Per-page numbers therefore read low, and a `pathname` with a small count may
have been reached far more often by in-app navigation.

Counted: the initial document, assets fetched from the edge, and API requests
the router proxies (`route = "api"`). Not counted: in-app route changes,
anything served from the browser cache, and requests that never reached the
Worker. `writeDataPoint` is fire-and-forget; a point Cloudflare drops is not
an error anywhere in this system.

## Common Causes

### 1. Missing environment variable

`Missing required environment variable: CLOUDFLARE_API_TOKEN` (or
`CLOUDFLARE_ACCOUNT_ID`), exit 1. Export both in the shell for the one command;
do not add them to any tracked `.env` file.

### 2. Token lacks the Account Analytics Read scope

`Analytics Engine SQL API failed: 401 …` or `403 …`, followed by the hint
`the token needs the Account Analytics Read scope (Cloudflare dashboard: Account · Account Analytics · Read)`.
The repo's deploy token does not carry this scope — see Token provisioning.

### 3. Binding not deployed yet

Zero rows from a green script. Check the `pulumi-up.yml` run and
`node scripts/check-analytics-bindings.mjs` as described above.

### 4. Route filter names a route that does not exist

`--route` accepts any `^[a-z][a-z0-9_-]*$` name, so a typo is a valid filter
that matches nothing and returns zero rows. Re-run without `--route` and read
the `route` column.

### 5. Window too short

A `--days` window shorter than the time since the binding shipped returns zero
rows even when everything works; widen it (up to 90).

## Recovery Steps

1. **Zero rows, binding just shipped**: wait a few minutes and re-run.
2. **Zero rows after a day**: `node scripts/check-analytics-bindings.mjs`; if
   it fails, fix `infrastructure/pulumi/index.ts` so the `analytics_engine`
   binding matches `analytics-schema.js`, merge, and read the resulting
   `pulumi-up.yml` run.
3. **401 / 403**: create a token with the right scope (next section) and
   re-run.
4. **Non-JSON line in the body**: the SQL API answered something other than
   `JSONEachRow`; re-run once, then check the Cloudflare status page.

## Token provisioning

The script needs a Cloudflare API token with **Account · Account Analytics ·
Read**. This is a different token from `MBE_CLOUDFLARE_API_TOKEN`: that
secret's documented scopes in [`docs/SECRETS.md`](../SECRETS.md) (Pages
deploys, KV, DNS, Pulumi) do not include Account Analytics, and it should not
be widened for a read-only report. Nothing in the repository or in GitHub
Actions holds an Analytics Read token; this runbook and the weekly-review
pointer are the trigger, not a cron.

To create one: Cloudflare dashboard → My Profile → API Tokens → Create Token →
Custom token → Permissions: _Account_ · _Account Analytics_ · _Read_ → Account
Resources: the one account → Continue to summary → Create Token. Put it in
`CLOUDFLARE_API_TOKEN` for the shell session only.

`CLOUDFLARE_ACCOUNT_ID` is not a credential ([`docs/SECRETS.md`](../SECRETS.md)
lists it under Non-Rotating Secrets); it is the 32-character id shown on the
account's Workers & Pages overview.

## Limits

Numbers from `developers.cloudflare.com/analytics/analytics-engine/pricing/`
and `…/analytics-engine/limits/`, as read on 2026-09-03:

- **Writes**: 100,000 data points per day on the Free plan. The Worker emits at
  most one point per invocation, and a Workers Free account is itself capped at
  100k requests/day, so writes cannot exceed the allowance.
- **Reads**: 10,000 SQL queries per day. This script issues one per run.
- **Retention**: three months — which is why `--days` stops at 90.
- **Per point**: 20 blobs, 20 doubles, 1 index (≤ 96 bytes), 16 KB of blobs
  in total; this dataset uses 4 blobs, 2 doubles and 1 index.
- **Billing**: the pricing page says "Currently, you will not be billed for
  your use of Workers Analytics Engine" and that pricing details will follow
  in the coming months. Re-read that page before assuming the number is still
  free.
