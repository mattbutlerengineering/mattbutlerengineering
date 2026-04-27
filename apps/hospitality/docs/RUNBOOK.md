# Hospitality App — Runbook

> Operational procedures for the hospitality app. Assumes deploys via Cloudflare Workers.

## Worker Names

| Environment | Worker Name | Config |
|-------------|------------|--------|
| Production | `mattbutlerengineering-hospitality` | `wrangler.toml` |
| Canary | `mattbutlerengineering-hospitality-canary` | `wrangler.canary.toml` |

## Deploy

### Production

```bash
cd apps/hospitality
pnpm build
pnpm dlx wrangler deploy
```

Production worker: `mattbutlerengineering-hospitality`

### Canary

```bash
cd apps/hospitality
pnpm build
pnpm dlx wrangler deploy --config wrangler.canary.toml
```

Canary worker: `mattbutlerengineering-hospitality-canary`

## Health Checks

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/api/health/system` | Liveness + dependency check | `{"status":"healthy","deps":{"db":"ok","upstream":"ok"}}` |
| `/health` | Basic liveness only | `{"status":"ok"}` |

The `/api/health/system` endpoint checks database and upstream API connectivity. Returns `degraded` when dependencies are down.

## Sentry Alert Response

### Alert Routing

Hospitality app errors route to the `mattbutlerengineering-hospitality` Sentry project.

### Severity Tiers

| Tier | Trigger | Response Time |
|------|---------|---------------|
| P0 | `error` count > 0 in 5min | 15 min |
| P1 | `error` count > 10 in 1hr | 1 hour |

### Common Error Patterns

| Pattern | Likely Cause | Fix |
|---------|------------|-----|
| Auth failures | Expired token, Auth0 outage | Check Auth0 status |
| SSE reconnections | Network, upstream disconnect | Usually transient |
| Konva canvas errors | Invalid floor plan JSON | Validate floor plan data |

## On-Call

- **Team:** @mattbutlerengineering
- **Response time:** 15 min for P0, 1hr for P1
- **Escalation:** Open GitHub issue with `severity:p0` label

## Cross-Reference

- [ROLLBACK.md](./ROLLBACK.md)
- [`wrangler.toml`](./wrangler.toml)
- [`wrangler.canary.toml`](./wrangler.canary.toml)