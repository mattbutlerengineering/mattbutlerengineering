---
name: site-audit
description: "Audit mattbutlerengineering.com with three modes: smoke (per-commit regression check), sweep (weekly zone rotation), scout (monthly improvement suggestions). Uses inventory tracking, parallel dispatch, and Lighthouse/Playwright. Invoke with /site-audit [smoke|sweep|scout]."
user-invocable: true
---

# Site Audit

Inventory-tracked audit system with three modes. Each mode targets different surfaces and creates GitHub issues for findings.

**Parse the argument to determine mode:** `smoke` (default), `sweep`, or `scout`.

## Inventory

The audit inventory at `.audit-state/inventory.json` tracks every auditable surface (22+ pages and API endpoints), when each was last checked, and Lighthouse score history. The `@mbe/agent-core` package provides `buildInventory()`, `loadInventory()`, `saveInventory()`, `mapFilesToSurfaces()`, `findStalestZone()`, `updateSurfaceScore()`, and `detectRegression()`.

**Before any mode runs:**

```bash
# Load or create inventory
cat .audit-state/inventory.json 2>/dev/null || echo "No inventory — will build fresh"
```

The agent-core functions handle building a fresh inventory if none exists and merging with existing data to preserve score history.

**After any mode completes**, save the updated inventory back.

## Mode 1: Smoke (per-commit regression check)

**Trigger:** `/site-audit smoke` or `/site-audit` (default)
**Purpose:** Check if recent changes broke anything.

### Steps

1. **Get changed files:**

```bash
git diff HEAD~1 --name-only
```

2. **Map to affected surfaces** using the file-to-surface mapping in agent-core's `mapFilesToSurfaces()`. The mapping rules:
   - `apps/<app>/src/pages/<Page>.tsx` → specific surface
   - `apps/<app>/src/components/**` → all surfaces in that app
   - `packages/rialto/src/**` → all frontend surfaces
   - `services/<svc>/src/**` → all API surfaces in that service
   - `infrastructure/**` → all surfaces
   - Files outside `apps/`, `services/`, `packages/`, `infrastructure/` → skip

3. **Dispatch parallel subagents** — one per affected surface. Each agent:
   - For pages: Run Lighthouse (performance + accessibility only), check console errors via Playwright
   - For API endpoints: `curl -sf <url>` and check for `"status":"ok"` in response

4. **Detect regressions** by comparing new scores against `lastScore` in inventory. A regression is a score drop >0.05 on any Lighthouse category.

5. **Create issues only for regressions** (not for stable-low scores). Use labels: `ci-fix` + `audit`.

6. **Update inventory** with new scores and timestamps.

If no files in `apps/`, `services/`, `packages/`, or `infrastructure/` changed, skip with: "No auditable changes detected."

## Mode 2: Sweep (weekly zone rotation)

**Trigger:** `/site-audit sweep`
**Purpose:** Full quality check on one zone, rotating to ensure all zones are covered over 4 weeks.

### Zones

| Zone               | Surfaces   | Auth  |
| ------------------ | ---------- | ----- |
| `marketing`        | 1 page     | none  |
| `hospitality`      | 11 pages   | auth0 |
| `rialto`           | 7 pages    | none  |
| `gen`              | 1 page     | auth0 |
| `api:users`        | 1 endpoint | none  |
| `api:reservations` | 1 endpoint | none  |
| `api:agent`        | 1 endpoint | none  |

### Steps

1. **Load inventory** and find the stalest zone (oldest average `lastChecked`) using `findStalestZone()`.

2. **List all surfaces** in the chosen zone.

3. **Filter surfaces with code changes** — before dispatching, check each surface to see if any of its source files changed since `lastChecked`. Skip Lighthouse entirely for surfaces with no changes.

For each surface, run:

```bash
# LAST_CHECKED = surface.lastChecked (ISO timestamp, e.g. "2026-03-01T12:00:00.000Z")
# SOURCE_FILES = space-separated list from surface.sourceFiles
git log --since='$LAST_CHECKED' --name-only -- $SOURCE_FILES | head -1
```

- If the output is **empty** → no changes since last audit → **skip this surface** (keep its existing inventory entry unchanged)
- If the output is **non-empty** → source changed → include in this sweep
- If `lastChecked` is **null** (never audited) → always include

Log skipped surfaces in the final report:

```
Skipped 4 unchanged surfaces: marketing/home, rialto/tokens, ...
```

4. **Dispatch parallel subagents** — up to 5 simultaneously (wave-based for larger zones), **only for surfaces that passed the change filter**. Each agent runs:
   - **Full Lighthouse** (all 4 categories: performance, accessibility, best-practices, SEO)
   - **Mobile responsive check** (375x812 viewport via Playwright `browser_resize`)
   - **Console error check** via Playwright `browser_console_messages`
   - **Network request check** via Playwright `browser_network_requests` (flag 4xx/5xx, >3s responses)
   - **Dead link check** — click navigation links, verify they load

5. **Update inventory** with new scores.

6. **Create issues** for anything below 0.9 threshold on any Lighthouse category, or any console errors.

7. **Report coverage stats:**

```
Sweep complete: zone "hospitality" (11 surfaces checked)
Coverage: 18 of 22 surfaces checked in last 30 days
Next stalest zone: "rialto" (last checked: never)
```

## Mode 3: Scout (monthly improvement suggestions)

**Trigger:** `/site-audit scout`
**Purpose:** AI-driven analysis that suggests features and improvements.

### Steps

1. **Load inventory** and analyze score trends from `checkHistory`:
   - Identify degrading scores (declining over 3+ checks)
   - Identify surfaces consistently below threshold

2. **Check dependency freshness:**

```bash
pnpm outdated 2>/dev/null | head -30
```

3. **Scan for TODOs/FIXMEs:**

```bash
grep -r "TODO\|FIXME" apps/ services/ packages/ --include="*.ts" --include="*.tsx" -l | head -20
```

4. **Check bundle sizes:**

```bash
# Build and check output sizes
ls -lh apps/*/dist/assets/*.js 2>/dev/null
```

5. **Review recently closed issues** for recurring patterns:

```bash
gh issue list --state closed --limit 20 --json title,labels,closedAt
```

6. **Create max 3 issues** with label `feature` or `meta-improvement`:
   - Focus on actionable, specific suggestions
   - Include evidence (score trends, outdated deps, bundle sizes)
   - Prioritize by impact

## Issue Creation

### Deduplication (CRITICAL)

Before creating ANY issue, check for existing duplicates:

```bash
gh issue list --label audit --state open --search "<key phrase>" --json number,title
```

If a substantially similar issue already exists, **skip it**.

### Issue Format

**Title:** `[Audit] <Category>: <Specific finding>`

**Labels:** Always apply `audit` + `ready` + one category label:

- `performance` — Lighthouse perf score, slow loads, large bundles
- `accessibility` — Missing labels, poor contrast, keyboard navigation
- `seo` — Missing meta tags, poor scores
- `ux` — Broken links, visual issues, responsive problems

For regressions detected by smoke mode, also add `ci-fix`.

**Body:**

```markdown
## Finding

[Clear description]

## Evidence

[Lighthouse score, console error text, score trend, etc.]

## Location

[Surface ID, URL, component if identifiable]

## Suggested Fix

[Brief suggestion if obvious, otherwise "Investigate and fix"]

---

_Found by automated site audit ({{mode}} mode) on YYYY-MM-DD_
```

## Authenticated Testing (Hospitality + Gen)

Surfaces with `auth: "auth0"` require authenticated access. Use Playwright E2E auth:

```bash
cd apps/hospitality
E2E_AUTH0_DOMAIN=dev-ytbgmz5ls3wh4xdx.us.auth0.com \
E2E_AUTH0_CLIENT_ID=<client-id> \
E2E_AUTH0_AUDIENCE=https://api.mattbutlerengineering.com \
E2E_AUTH_EMAIL=<test-user-email> \
E2E_AUTH_PASSWORD=<test-user-password> \
pnpm test:e2e
```

For browser-based audit of auth-protected pages, use the `authPage` fixture pattern:

```typescript
import { test, expect } from "./fixtures.js";

test("page loads", async ({ authPage }) => {
  await authPage.goto("/reservations");
  await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
});
```

If auth credentials are not available, skip auth-protected surfaces and note them in the report.

## Safety Rules

- Never modify code directly — only create issues
- Never create more than 5 issues per run (prioritize by severity)
- Always deduplicate before creating
- If the site is completely down, create a single high-priority `ci-fix` issue and stop
- Regressions (smoke mode) get `ci-fix` label for ship-loop priority handling

## Base URL

`https://mattbutlerengineering.com`

## Lighthouse Thresholds

All categories: **0.9 minimum** (from `lighthouserc.json`)

```bash
npx @lhci/cli collect --url="<surface-url>" --settings.preset=desktop --numberOfRuns=1
npx @lhci/cli assert --assertions.categories:performance="error,minScore,0.9" --assertions.categories:accessibility="error,minScore,0.9" --assertions.categories:best-practices="error,minScore,0.9" --assertions.categories:seo="error,minScore,0.9"
```
