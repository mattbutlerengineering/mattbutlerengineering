---
name: site-audit
description: "Audit mattbutlerengineering.com: smoke/sweep/scout modes. Invoke: /site-audit [smoke|sweep|scout]."
user-invocable: true
---

# Site Audit

Inventory-tracked 3-mode audit: smoke (regression), sweep (zone rotation), scout (improvements).

## Inventory

`.audit-state/inventory.json` tracks surfaces, check times, scores via agent-core: `buildInventory()`, `loadInventory()`, `saveInventory()`, `mapFilesToSurfaces()`, `findStalestZone()`, `updateSurfaceScore()`, `detectRegression()`.

```bash
cat .audit-state/inventory.json 2>/dev/null || echo "No inventory"
```

## Mode 1: Smoke (per-commit)

1. `git diff HEAD~1 --name-only`
2. Map via `mapFilesToSurfaces()`: `apps/<app>/src/pages/*` → surface, `components/**` → all app surfaces, `packages/rialto/**` → all frontend, `services/*` → all API, `infrastructure/**` → all, else skip.
3. Parallel subagents: Pages → Lighthouse (perf+a11y), API → curl check.

**Curl pattern:**

```bash
AUDIT_CURL_OPTS=(-sf -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
[ -n "${AUDIT_TOKEN:-}" ] && AUDIT_CURL_OPTS+=(-H "X-Audit-Token: $AUDIT_TOKEN")
HTTP_STATUS=$(curl -o /dev/null -w "%{http_code}" "${AUDIT_CURL_OPTS[@]}" "$URL")
[ "$HTTP_STATUS" = "403" ] && echo "ACCESS-RESTRICTED: $URL"
```

4. Detect regressions (>0.05 drop vs lastScore), create issues (labels: `ci-fix`+`audit`), update inventory.

## Mode 2: Sweep (weekly zone rotation)

| Zone               | Surfaces | Auth  |
| ------------------ | -------- | ----- |
| `marketing`        | 1        | none  |
| `hospitality`      | 11       | auth0 |
| `rialto`           | 7        | none  |
| `gen`              | 1        | auth0 |
| `api:users`        | 1        | none  |
| `api:reservations` | 1        | none  |
| `api:agent`        | 1        | none  |

1. Load inventory, find stalest via `findStalestZone()`.
2. For each surface: `git log --since='$LAST_CHECKED' --name-only -- $SOURCE_FILES | head -1` → skip if empty, include if non-empty or never checked.
3. Parallel (5-wave max): availability (curl), Lighthouse, mobile (375x812), console errors, network (flag 4xx/5xx/>3s), dead links.
4. Create issues <0.9 or console errors. >50% blocked → one `[Audit] Infrastructure: Site unreachable` + stop.

## Mode 3: Scout (monthly)

1. Analyze `checkHistory`: degrading 3+, below-threshold.
2. `pnpm outdated | head -30`
3. `grep -r "TODO\|FIXME" apps/ services/ packages/ --include="*.ts" --include="*.tsx" -l | head -20`
4. `ls -lh apps/*/dist/assets/*.js`
5. `gh issue list --state closed --limit 20 --json title,labels,closedAt`
6. Max 3 issues: `feature` or `meta-improvement` with evidence.

## Issue Creation

**Dedup:** `gh issue list --label audit --state open --search "<phrase>" --json number,title` → skip if exists.

**Title:** `[Audit] <Category>: <Finding>`

**Labels:** `audit`+`ready`+category:

- `performance` — perf, slow, bundles
- `accessibility` — labels, contrast, nav
- `seo` — meta, scores
- `ux` — links, visuals, responsive

Regressions: +`ci-fix`.

**Body:**

```markdown
## Finding

[Description]

## Evidence

[Score/error/trend]

## Location

[Surface/URL/component]

## Fix

[Suggestion or "Investigate"]

---

_Audit ({{mode}}) YYYY-MM-DD_
```

## Auth (Hospitality + Gen)

Auth0 surfaces via E2E fixture:

```typescript
import { test, expect } from "./fixtures.js";
test("loads", async ({ authPage }) => {
  await authPage.goto("/reservations");
  await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
});
```

## Access Restrictions

403 from Cloudflare Bot Management:

1. Log `ACCESS-RESTRICTED: <url>`
2. Mark `restricted` in inventory
3. Skip Lighthouse/Playwright
4. Continue
5. > 50% blocked → one infrastructure issue + stop

**Enable (one-time):**

1. Cloudflare Security → WAF → Custom Rules
2. `X-Audit-Token == <secret>` → Skip Bot Fight
3. `wrangler secret put AUDIT_TOKEN`
4. Export `AUDIT_TOKEN=<secret>`

## Lighthouse

Check availability:

```bash
if command -v google-chrome &>/dev/null || command -v chromium &>/dev/null || command -v chromium-browser &>/dev/null; then
  LIGHTHOUSE_AVAILABLE=1
fi
```

Run only if available. Missing → null, note report, no issues.

## Config

Base: `https://mattbutlerengineering.com`
Threshold: 0.9 all categories

```bash
npx @lhci/cli collect --url="<url>" --settings.preset=desktop --numberOfRuns=1
npx @lhci/cli assert --assertions.categories:performance="error,minScore,0.9" --assertions.categories:accessibility="error,minScore,0.9" --assertions.categories:best-practices="error,minScore,0.9" --assertions.categories:seo="error,minScore,0.9"
```

## Rules

- Read-only
- Max 5 issues/run
- Dedup first
- Full down (5xx) → one issue + stop
- 403 ≠ down
- Regressions → `ci-fix`
