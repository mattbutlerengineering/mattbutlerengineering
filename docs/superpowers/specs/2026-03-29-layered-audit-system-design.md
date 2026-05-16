# Layered Audit System Design

**Date:** 2026-03-29
**Status:** Draft
**Goal:** Replace the fixed-route site audit with a change-driven, inventory-tracked, parallel audit system that catches regressions, ensures full coverage, and suggests improvements.

## Problem

The current `/site-audit` skill checks the same 3 routes (`/`, `/hospitality`, `/rialto`) every run. The site has 75+ frontend routes and 61 API endpoints. There is no tracking of what was checked, when, or what scores looked like. The same surfaces get re-audited while others are never checked.

## Solution: Three Audit Modes

### Smoke Mode (per-commit)

**Trigger:** Ship-loop after merge, CI, or manual `/site-audit smoke`
**Scope:** Only surfaces affected by changed files (via git diff + file-to-surface mapping)
**Checks:** Lighthouse (performance + accessibility), console errors, API health
**Speed:** ~30s for typical commits
**Issue creation:** Only for regressions (score dropped >0.05 or new errors)
**Parallelism:** One subagent per affected surface

### Sweep Mode (weekly rotation)

**Trigger:** Scheduled cron or manual `/site-audit sweep`
**Scope:** One zone per run, rotating through all zones by staleness
**Checks:** Full Lighthouse (all 4 categories), mobile responsive (375x812), console errors, network requests, dead links
**Speed:** ~5 min per zone
**Issue creation:** Anything below 0.9 Lighthouse threshold or any console errors
**Parallelism:** Up to 5 surfaces simultaneously
**Coverage guarantee:** All zones checked within 4 weeks

### Scout Mode (monthly)

**Trigger:** Scheduled cron or manual `/site-audit scout`
**Scope:** Entire project (codebase analysis, not live site checks)
**Analysis:**

- Lighthouse score trends from inventory history
- Recently closed issue patterns (recurring problem areas)
- Dependency freshness (`npm outdated`, security advisories)
- Codebase TODOs/FIXMEs
- Bundle size analysis
- Comparison with common best practices
  **Issue creation:** Max 3 `feature` or `meta-improvement` issues per run
  **Parallelism:** Not needed (single AI analysis pass)

## Data Model

### Audit Inventory (`.audit-state/inventory.json`)

```typescript
interface AuditInventory {
  surfaces: AuditSurface[];
  lastUpdated: string;
  version: number;
}

interface AuditSurface {
  id: string; // "hospitality:timeline", "api:reservations:list"
  zone: Zone;
  type: "page" | "api_endpoint";
  url: string; // full URL
  sourceFiles: string[]; // files that map to this surface
  auth: "none" | "auth0";
  lastChecked: string | null; // ISO timestamp
  lastScore: LighthouseScores | null;
  checkHistory: ScoreEntry[]; // last 10 scores for trend detection
  checkCount: number;
}

interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface ScoreEntry {
  timestamp: string;
  scores: LighthouseScores;
}

type Zone =
  | "marketing"
  | "hospitality"
  | "rialto"
  | "gen"
  | "api:users"
  | "api:reservations"
  | "api:agent";
```

### File-to-Surface Mapping

Derived from codebase conventions:

| File Pattern                      | Surface                                       |
| --------------------------------- | --------------------------------------------- |
| `apps/<app>/src/pages/<Page>.tsx` | `<app>:<kebab-page>` → `/<app>/<kebab-page>`  |
| `apps/<app>/src/components/**`    | All surfaces in that app's zone               |
| `apps/<app>/src/App.tsx`          | All surfaces in that app's zone               |
| `packages/rialto/src/**`          | All surfaces in all frontend zones            |
| `services/<svc>/src/routes/**`    | All API surfaces in that service's zone       |
| `services/<svc>/src/app.ts`       | All API surfaces in that service's zone       |
| `infrastructure/worker/**`        | All surfaces (edge router affects everything) |

When a file doesn't match any app/service pattern (e.g., root configs, CI files, docs), it is ignored for smoke mode targeting. Only files within `apps/`, `services/`, `packages/`, or `infrastructure/` trigger surface checks. This avoids noisy smoke runs for documentation or config changes.

### Inventory Auto-Generation

The inventory is rebuilt on each audit run by scanning:

1. **Frontend routes:** Parse React Router `path:` props from route config files
   - `apps/marketing/src/App.tsx`
   - `apps/hospitality/src/main.tsx`
   - `apps/rialto-web/src/routes.tsx`
   - `apps/gen/src/main.tsx`

2. **API endpoints:** Parse Fastify route registrations
   - `services/users/src/routes/*.ts`
   - `services/reservations/src/routes/*.ts`
   - `services/agent/src/routes/*.ts`

3. **Merge with existing inventory:** Preserve `lastChecked`, `lastScore`, and `checkHistory` for surfaces that still exist. Remove surfaces that no longer exist. Add new surfaces with null values.

## Parallel Execution

### Smoke Mode

```
git diff HEAD~1 → changed files
     ↓
map to affected surfaces (typically 1-5)
     ↓
dispatch N parallel subagents
     ├── agent 1: Lighthouse + console check on surface A
     ├── agent 2: API health check on surface B
     └── agent 3: Lighthouse + console check on surface C
     ↓
collect results → deduplicate → create issues for regressions
```

### Sweep Mode

```
read inventory → find stalest zone
     ↓
list all surfaces in zone (e.g., hospitality has 12)
     ↓
dispatch in waves of 5 parallel subagents
     ├── wave 1: surfaces 1-5
     └── wave 2: surfaces 6-12
     ↓
collect results → update inventory → create issues
```

Each subagent is a self-contained audit worker that:

1. Navigates to the URL (Playwright or curl for APIs)
2. Runs the configured checks
3. Returns structured results (scores, errors, screenshots)

## Ship-Loop Integration

Add Smoke mode to ship-loop Phase A between Dependabot check and issue gathering:

```markdown
### A2.5. Smoke Audit

After merging a PR, run smoke audit on affected surfaces:

1. Get changed files: `git diff HEAD~1 --name-only`
2. Map to surfaces via file-to-surface mapping
3. Run Lighthouse + console checks in parallel on affected surfaces
4. If regressions found, create `ci-fix` + `audit` issues
```

Sweep and Scout run independently on their own schedules, not as part of the ship-loop.

## Regression Detection

A regression is detected when:

- **Lighthouse score drops >0.05** from `lastScore` on any category
- **New console errors** appear that weren't in previous check
- **API health endpoint** returns non-`ok` status
- **HTTP status** changes from 200 to non-200

Regressions create issues with `ci-fix` + `audit` labels (high priority in ship-loop). Non-regression findings (below threshold but stable) create issues with `audit` + `ready` labels.

## Score Trending (Scout Mode)

The `checkHistory` array (last 10 entries) enables trend analysis:

- **Degrading:** Score declining over 3+ checks → create issue even if still above threshold
- **Improving:** Score rising → note in Scout report as positive signal
- **Stable low:** Score consistently below threshold → escalate priority

## Coverage Reporting

The inventory enables coverage queries:

- "X of Y surfaces checked in the last 30 days"
- "Zone Z has not been checked in N days"
- "These 5 surfaces have never been checked"

This feeds into the `/progress-tracker` skill for overall health metrics.

## New Files

| File                                                        | Action | Purpose                                                      |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `.audit-state/inventory.json`                               | CREATE | Surface inventory with scores and timestamps                 |
| `packages/agent-core/src/audit-inventory.ts`                | CREATE | Inventory builder, file-to-surface mapper, staleness queries |
| `packages/agent-core/src/__tests__/audit-inventory.test.ts` | CREATE | Tests for inventory logic                                    |
| `.claude/skills/site-audit/SKILL.md`                        | MODIFY | Add 3 modes, parallel dispatch, inventory integration        |

## Verification

After implementation:

```bash
# Unit tests
cd packages/agent-core && pnpm test

# Manual smoke test
/site-audit smoke    # should detect affected surfaces from recent commits

# Manual sweep test
/site-audit sweep    # should pick stalest zone and audit it

# Verify inventory was created
cat .audit-state/inventory.json | jq '.surfaces | length'
# Should show 75+ surfaces
```
