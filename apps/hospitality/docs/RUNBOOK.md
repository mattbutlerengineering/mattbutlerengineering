# RUNBOOK.md — apps/hospitality/

Operational runbook for the Hospitality app (React + Rialto). Deployed at `/hospitality/` via Cloudflare Worker `mattbutlerengineering-hospitality`.

## Deploy

```bash
# Production deploy
cd apps/hospitality && pnpm dlx wrangler@latest deploy

# Canary deploy
pnpm dlx wrangler@latest deploy --config apps/hospitality/wrangler.canary.toml

# Worker names:
# - Production: mattbutlerengineering-hospitality
# - Canary: mattbutlerengineering-hospitality-canary
```

## Health Checks

| Endpoint | Type | Behavior |
|-----------|------|-------------|
| `/health` | Liveness | Always returns `{"status": "ok"}` — no DB touch |
| `/hospitality/api/health` | Readiness | Checks upstream APIs, returns `degraded` on failure |

```bash
# Check health
curl https://mattbutlerengineering.com/hospitality/api/health
```

## Sentry Alert Response

| Severity | Response | Escalation |
|----------|----------|-------------|
| `error` | Investigate in Sentry, check recent deploys | On-call engineer |
| `fatal` | Page on-call immediately | Team lead within 15min |
| `warning` | Log for trend analysis | Next business day |

**Common patterns:**
- Auth failures: Check Auth0 tenant status
- SSE reconnects: Expected behavior, check frequency
- Konva canvas errors: Check browser compatibility

## On-Call Escalation

1. **Primary**: `@mattbutlerengineering` GitHub team
2. **Escalate to**: Team lead (response expectation: 30min)
3. **Communication**: Comment on Sentry issue, update incident channel

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_AUTH0_DOMAIN` | Yes | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Yes | Auth0 client ID |
| `VITE_API_URL` | Yes | API base URL |
| `SENTRY_DSN` | Yes (prod) | Sentry DSN for error tracking |
