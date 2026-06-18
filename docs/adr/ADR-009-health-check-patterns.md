---
id: ADR-009
title: Health Check Patterns
status: active
date: 2026-04-06
---

# ADR-009: Health Check Patterns

## Context

Services need health endpoints for three distinct consumers: the hosting platform (DigitalOcean App Platform container probes), external monitoring and post-deploy verification, and operators investigating incidents. A single flat endpoint cannot serve all three without leaking infrastructure details to unauthenticated callers.

## Decision

We use a **two-tier health check architecture**: per-service simple checks and a system-wide aggregation endpoint at the edge.

### Tier 1: Per-Service Health (`/health`)

Every Fastify service exposes identical health routes:

| Path                       | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `/health`                  | Internal probe (DO App Platform container health)         |
| `/api/v1/<service>/health` | Public path through DO ingress (post-deploy verification) |

Both return the same `HealthResponse`:

```json
{
  "status": "ok | degraded | error",
  "version": "1.0.0",
  "apiVersion": "v1",
  "timestamp": "...",
  "checks": {
    "database": { "status": "ok", "latency": 5 },
    "slow_queries": { "status": "ok", "message": "0 slow queries in last 5min" },
    "auth0": { "status": "ok", "latency": 42 }
  }
}
```

**Key behaviors:**

- **Slow query tracking**: A rolling window counts queries exceeding a threshold. The `slow_queries` check reports count and worst-case latency over the last 5 minutes.
- **Latency anomaly detection**: Database ping latency is compared against a rolling average. Spikes trigger `"status": "error"` with diagnostic context.
- **Tri-state status**: `ok` (all checks pass), `degraded` (non-critical check failing), `error` (critical failure -- returns HTTP 503).

### Tier 2: System Aggregation (`/health/system`)

The Cloudflare edge router exposes `/health/system`, which fans out to all subsystems in parallel:

1. **Services** -- HTTP fetch to each service's `/health` endpoint (5s timeout).
2. **Static sites** -- HEAD request via Service Bindings (in-process, no network hop).
3. **CI and deploys** -- Read from Cloudflare KV (written by GitHub Actions post-run).

**Access control:** Unauthenticated requests receive only `{ status, timestamp }`. Detailed subsystem data (service names, latencies, commit SHAs) requires a `Bearer` token matching the `HEALTH_TOKEN` secret. If `HEALTH_TOKEN` is not configured, all requests get the coarse response (safe by default).

**Status computation policy:**

- Any service unhealthy -> system `unhealthy`.
- 2+ static sites down -> system `unhealthy`.
- Single static site, CI, or one deploy pipeline failing -> system `degraded`.
- All passing -> system `healthy`.

## Consequences

**Benefits:**

- Platform health probes hit a lightweight path (`/health`) that avoids external dependencies when possible.
- The aggregation endpoint gives operators a single URL for full-stack status during incidents.
- Token-gated detail prevents leaking infrastructure topology to unauthenticated callers.
- Parallel fan-out keeps aggregation latency bounded by the slowest subsystem (capped at 5s).

**Trade-offs:**

- Two health routes per service (`/health` and `/api/v1/<service>/health`) add minor route registration overhead.
- KV-based CI/deploy status can become stale if GitHub Actions fails to write; the system handles this by reporting `"stale"` status rather than false-healthy.

## Alternatives Considered

### Single `/health` endpoint with query params for detail level

Rejected because the platform probe and the aggregation endpoint have fundamentally different concerns (container liveness vs. full-stack status). Mixing them increases the blast radius of bugs.

### Third-party status page service (e.g., Betteruptime, Statuspage)

Rejected as the primary mechanism because it adds an external dependency for operational data. The `/health/system` endpoint can feed a status page if needed, keeping the source of truth internal.

### Pull-based monitoring only (external pinger, no aggregation)

Rejected because it cannot provide a single-request full-stack view during incidents and requires configuring each subsystem individually in the monitoring tool.
