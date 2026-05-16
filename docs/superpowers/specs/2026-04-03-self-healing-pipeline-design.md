# Self-Healing Pipeline: Unified Health Aggregator

**Date:** 2026-04-03
**Status:** Draft
**Phase:** 1 of N (Detect + Report — recovery actions come in future phases)

## Problem

The mattbutlerengineering pipeline has strong detection mechanisms (synthetic monitoring, site audits, CI monitor, progress tracker) but they're fragmented across GitHub Actions, Claude Code skills, and RemoteTriggers. No single endpoint shows overall system health. Failures slip through because no unified signal exists for skills and automation to query.

## Solution

Add a `/health/system` route to the existing Cloudflare edge router that aggregates health from all subsystems into a single JSON response. CI and deploy status are pushed into Cloudflare KV by GitHub Actions workflows.

## Architecture

```
GET https://mattbutlerengineering.com/health/system

┌──────────────────────────────────────────────────────┐
│  Edge Router (edge-router.js)                        │
│                                                      │
│  Parallel fetch (HTTP, 5s timeout each):             │
│  ├── api.mattbutlerengineering.com/health            │  ← Users API
│  ├── api.mattbutlerengineering.com/api/health        │  ← Reservations API
│  └── api.mattbutlerengineering.com/api/gen/health    │  ← Agent API
│                                                      │
│  Service Binding HEAD / (in-process, ~0ms):          │
│  ├── MARKETING                                       │
│  ├── HOSPITALITY                                     │
│  ├── RIALTO                                          │
│  └── GEN                                             │
│                                                      │
│  KV read (HEALTH_STATE namespace):                   │
│  ├── ci/latest                                       │
│  ├── deploy/static                                   │
│  ├── deploy/services                                 │
│  └── deploy/infrastructure                           │
└──────────────────────────────────────────────────────┘
```

### Why the Edge Router?

- Already has Service Bindings to all static site Workers (in-process, no network hop)
- Already knows the API origin (`env.API_ORIGIN`)
- Cloudflare's uptime > ours — avoids "who watches the watcher?" problem
- Zero new infrastructure — just a new route in an existing Worker

## Response Schema

```jsonc
{
  // Top-level roll-up
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2026-04-03T12:00:00.000Z",

  "subsystems": {
    // Backend API services (HTTP fetch to DO App Platform)
    "services": {
      "status": "healthy" | "degraded" | "unhealthy",
      "checks": {
        "users": {
          "status": "ok" | "error" | "timeout",
          "latency": 12,        // ms
          "version": "1.0.0",
          "checks": { ... }     // passthrough from service health endpoint
        },
        "reservations": { ... },
        "agent": { ... }
      }
    },

    // Frontend static sites (Service Binding HEAD /)
    "static_sites": {
      "status": "healthy" | "degraded" | "unhealthy",
      "checks": {
        "marketing":   { "status": "ok" | "error" | "timeout", "latency": 3 },
        "hospitality": { "status": "ok" | "error" | "timeout", "latency": 4 },
        "rialto":      { "status": "ok" | "error" | "timeout", "latency": 2 },
        "gen":         { "status": "ok" | "error" | "timeout", "latency": 3 }
      }
    },

    // CI status (from KV, written by ci.yml)
    "ci": {
      "status": "healthy" | "unhealthy" | "stale",
      "last_run": {
        "id": 12345,
        "conclusion": "success" | "failure" | "cancelled",
        "branch": "main",
        "updated_at": "2026-04-03T11:45:00.000Z"
      }
    },

    // Deploy pipeline status (from KV, written by deploy workflows)
    "deploys": {
      "status": "healthy" | "degraded" | "unhealthy",
      "pipelines": {
        "static": {
          "conclusion": "success" | "failure",
          "sha": "abc123",
          "updated_at": "2026-04-03T11:30:00.000Z"
        },
        "services": { ... },
        "infrastructure": { ... }
      }
    }
  }
}
```

### Status Roll-Up Logic

| Condition | Top-level Status |
|-----------|-----------------|
| All subsystems healthy | `healthy` |
| 1 static site or 1 deploy pipeline failing | `degraded` |
| CI failing (latest run on main) | `degraded` |
| Any service health endpoint (users, reservations, agent) returns error/timeout | `unhealthy` |
| 2+ static sites failing simultaneously | `unhealthy` |
| Any KV entry older than 1 hour | that subsystem `stale` (→ `degraded` for roll-up) |

**Staleness rule:** If a KV entry's `updated_at` is older than 1 hour, the subsystem status is `stale` (treated as `degraded` for roll-up). This catches cases where GitHub Actions stop running.

## KV Data Model

**Namespace:** `mattbutlerengineering-health-state`

| Key | Written By | Shape | TTL |
|-----|-----------|-------|-----|
| `ci/latest` | `ci.yml` (final job) | `{ id, conclusion, branch, sha, updated_at }` | None (overwritten each run) |
| `deploy/static` | `deploy-static.yml` (final step) | `{ conclusion, sha, apps_deployed, updated_at }` | None |
| `deploy/services` | `deploy-services.yml` (final step) | `{ conclusion, sha, updated_at }` | None |
| `deploy/infrastructure` | `pulumi-up.yml` (final step) | `{ conclusion, sha, updated_at }` | None |

KV writes use the Cloudflare REST API from GitHub Actions:
```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NS_ID}/values/${KEY}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"conclusion":"success","sha":"abc123","updated_at":"2026-04-03T12:00:00Z"}'
```

## Files Changed

### 1. `infrastructure/worker/edge-router.js`

Add `handleHealthSystem(env)` function and route intercept:

```javascript
// Before the /api/ routing block, add:
if (url.pathname === "/health/system") {
  return handleHealthSystem(env);
}
```

The `handleHealthSystem` function:
- Fans out all checks in parallel using `Promise.allSettled()`
- Each check has a 5-second `AbortSignal.timeout(5000)`
- Service health responses are parsed as JSON; static site checks only verify HTTP 2xx
- KV reads use `env.HEALTH_STATE.get(key, "json")`
- Computes roll-up status
- Returns JSON with `Cache-Control: no-store` (never cache health)

### 2. `infrastructure/pulumi/index.ts`

Add KV namespace resource and binding:

```typescript
const healthKv = new cloudflare.WorkersKvNamespace("mattbutlerengineering-health-state", {
  accountId: cloudflareAccountId,
  title: "mattbutlerengineering-health-state",
});
```

Add to edge-router bindings array:
```typescript
{ name: "HEALTH_STATE", namespaceId: healthKv.id, type: "kv_namespace" }
```

Export the namespace ID for GitHub Actions:
```typescript
export const healthKvNamespaceId = healthKv.id;
```

### 3. `infrastructure/worker/wrangler.toml`

Add KV binding for local dev:
```toml
[[kv_namespaces]]
binding = "HEALTH_STATE"
id = "<from-pulumi-stack-output>"  # Run: pulumi stack output healthKvNamespaceId
```

### 4. `.github/workflows/ci.yml`

Add a final job that runs `if: always()` after all other jobs:

```yaml
report-health:
  name: Report CI Health
  needs: [lint, typecheck, build, test, migrations]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - name: Write CI status to KV
      env:
        CF_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        CF_API_TOKEN: ${{ secrets.MBE_CLOUDFLARE_API_TOKEN }}
        KV_NS_ID: ${{ secrets.HEALTH_KV_NAMESPACE_ID }}  # From pulumi stack output
      run: |
        CONCLUSION="success"
        if [ "${{ contains(needs.*.result, 'failure') }}" = "true" ]; then
          CONCLUSION="failure"
        elif [ "${{ contains(needs.*.result, 'cancelled') }}" = "true" ]; then
          CONCLUSION="cancelled"
        fi
        curl -s -X PUT \
          "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NS_ID}/values/ci%2Flatest" \
          -H "Authorization: Bearer ${CF_API_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "{\"id\":${{ github.run_id }},\"conclusion\":\"${CONCLUSION}\",\"branch\":\"${{ github.ref_name }}\",\"sha\":\"${{ github.sha }}\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

### 5. `.github/workflows/deploy-static.yml`, `deploy-services.yml`, `pulumi-up.yml`

Same pattern — add a final step to write deploy status to KV. Runs `if: always()` so failures are reported too.

### 6. `packages/types/src/api.ts`

Add `SystemHealthResponse` and related types alongside existing `HealthResponse`:

```typescript
export type SystemStatus = "healthy" | "degraded" | "unhealthy";

export interface SystemHealthResponse {
  status: SystemStatus;
  timestamp: string;
  subsystems: {
    services: SubsystemHealth<ServiceCheck>;
    static_sites: SubsystemHealth<StaticSiteCheck>;
    ci: CiHealth;
    deploys: DeployHealth;
  };
}

export interface SubsystemHealth<T> {
  status: SystemStatus;
  checks: Record<string, T>;
}

export interface ServiceCheck {
  status: "ok" | "error" | "timeout";
  latency: number;
  version?: string;
  checks?: Record<string, HealthCheck>;
}

export interface StaticSiteCheck {
  status: "ok" | "error" | "timeout";
  latency: number;
}

export interface CiHealth {
  status: "healthy" | "unhealthy" | "stale";
  last_run: {
    id: number;
    conclusion: string;
    branch: string;
    sha: string;
    updated_at: string;
  } | null;
}

export interface DeployHealth {
  status: SystemStatus;
  pipelines: Record<string, {
    conclusion: string;
    sha: string;
    updated_at: string;
  } | null>;
}
```

## Cost

| Resource | Free Tier | Expected Usage | Cost |
|----------|-----------|----------------|------|
| KV namespace | 100k reads/day, 1k writes/day | ~300 reads/day, ~20 writes/day | $0 |
| Edge router CPU | Included in Workers plan | ~5ms CPU per /health/system call | $0 |
| Service Binding calls | Free (same-account) | 4 HEAD calls per health check | $0 |
| GH Actions minutes | +2s per workflow run | On existing runners | $0 |
| KV storage | 1 GB free | ~1 KB total | $0 |

## What This Enables (Future Phases)

This is Phase 1 (Detect + Report). With the unified signal in place, future phases can add:

1. **Phase 2: Alert** — Synthetic monitoring calls `/health/system` and creates GitHub issues when status goes `unhealthy`
2. **Phase 3: Auto-Rollback** — Ship-loop queries `/health/system` post-deploy; if `unhealthy`, triggers `wrangler rollback` or `git revert`
3. **Phase 4: Self-Tuning** — Progress tracker reads `/health/system` to adjust ship-loop cadence and circuit breaker thresholds

Each phase builds on the signal — the aggregator is the foundation.

## Testing

### Manual Verification
1. Deploy Pulumi changes (creates KV namespace + updates edge router bindings)
2. Deploy edge router (has new `/health/system` route)
3. `curl https://mattbutlerengineering.com/health/system | jq .`
4. Verify all services show `ok`, static sites show `ok`
5. CI/deploy status will show `null` until next CI run writes to KV
6. Trigger a CI run, then re-curl — CI status should appear

### Automated Tests
- Unit test `handleHealthSystem()` in isolation (mock env bindings + KV)
- Integration: synthetic monitoring workflow can optionally call `/health/system` as a sanity check

### Failure Scenarios to Verify
- Kill one service → status should go `unhealthy`, that service shows `error`
- Slow service (>5s) → shows `timeout`
- Empty KV (first deploy) → CI/deploy show `null`, treated as `stale`
- All healthy → `healthy` top-level status
