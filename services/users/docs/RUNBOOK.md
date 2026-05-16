# RUNBOOK.md — services/users

Operational runbook for the users service (Fastify + Prisma, port 3001). Deployed on DigitalOcean App Platform.

## Deploy

```bash
# Deploy via DO CLI
doctl apps create-deployment $DO_APP_ID --wait

# Get build logs
doctl apps logs $DO_APP_ID users-api --type=build --deployment <deployment-id>

# Component name: users-service
# DO App ID: check services/users/CLAUDE.md or DO dashboard
```

## Migrate (Prisma)

```bash
# Run migrations against production
pnpm --dir services/users db:migrate:deploy

# Gotcha: Prisma 7+ with globally-installed CLI
# NODE_PATH issue — use pnpm dlx prisma instead of global
pnpm --dir services/users dlx prisma migrate deploy

# Check migration status
pnpm --dir services/users db:migrate:status
```

## Health Checks

| Endpoint | Type | Behavior |
|-----------|------|-------------|
| `/health` | Liveness | Always returns `{"status": "ok"}` — no DB touch |
| `/api/v1/users/health` | Readiness | Runs `prisma.$queryRaw` — returns `degraded` with actual DB error |

```bash
# Check health
curl https://api.mattbutlerengineering.com/api/v1/users/health
# Expected: {"status": "ok", "checks": {"database": {"status": "ok"}}}
```

## Auth0 Outage Response

Auth0 tenant: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`

| Scenario | Detection | Mitigation |
|----------|-----------|------------|
| Auth0 down | JWT verification fails with `UNAUTHORIZED`, upstream timeout | Check Auth0 status page; fail closed (reject all requests) |
| Key rotation | Tokens valid in Auth0 but fail verification | Check JWKS cache; restart service to refresh keys |
| API identifier mismatch | All tokens rejected | Verify `AUTH_AUDIENCE` env var matches `https://api.mattbutlerengineering.com` |

**Never fail open** — expired or unverifiable tokens must be rejected.

## DB Connectivity Loss

| Symptom | Detection | Action |
|----------|-----------|--------|
| Postgres down | `/api/v1/users/health` returns `degraded` | Check DO database status; verify `DATABASE_URL` |
| Connection pool exhausted | Slow responses, timeouts | Check Prisma metrics; consider scaling connection limit |
| Query timeout | 500 errors on user endpoints | Check query performance; verify indexes |

**Fail closed** — return 503 if DB is unavailable (don't serve stale data).

## Rollback

```bash
# List recent deployments
doctl apps list-deployments $DO_APP_ID

# Redeploy previous version
doctl apps create-deployment $DO_APP_ID --deployment-id <previous-deployment-id>

# Post-rollback checklist:
# 1. Verify health endpoints return ok
# 2. Check error rates in Sentry
# 3. Verify Auth0 JWT verification works
# 4. Run `pnpm --dir services/users db:migrate:status` to confirm schema matches
```
