# RUNBOOK.md — services/reservations

Operational runbook for the reservations service (Fastify + Prisma, port 3004). Deployed on DigitalOcean App Platform.

## Deploy

```bash
# Deploy via DO CLI
doctl apps create-deployment $DO_APP_ID --wait

# Get build logs
doctl apps logs $DO_APP_ID reservations-api --type=build --deployment <deployment-id>

# Component name: reservations-service
# DO App ID: check services/reservations/CLAUDE.md or DO dashboard
```

## Migrate (Prisma)

```bash
# Run migrations against production
pnpm --dir services/reservations db:migrate:deploy

# Gotcha: Prisma 7+ with globally-installed CLI
# NODE_PATH issue — use pnpm dlx prisma instead of global
pnpm --dir services/reservations dlx prisma migrate deploy

# Check migration status
pnpm --dir services/reservations db:migrate:status

# Schema-drift detection
npx prisma validate
```

## Health Checks

| Endpoint | Type | Behavior |
|-----------|------|-------------|
| `/health` | Liveness | Always returns `{"status": "ok"}` — no DB touch |
| `/api/v1/reservations/health` | Readiness | Runs `prisma.$queryRaw` — returns `degraded` with actual DB error |

```bash
# Check health
curl https://api.mattbutlerengineering.com/api/v1/reservations/health
```

## SSE Consumer Recovery

When consumers (hospitality SPA, etc.) miss events:

```bash
# Check active SSE connections
curl -s http://localhost:3004/api/v1/events/stream?venueId=<id> -H "Authorization: Bearer $TOKEN" &

# Verify Last-Event-ID header for resumption
# Clients should track last received event ID and send it on reconnect
```

**Backfill procedure:**
```bash
# Query missed reservations since last known event
node -e "
const { prisma } = require('./dist/services/database.js');
prisma.reservation.findMany({
  where: { updatedAt: { gte: new Date('<last-event-time>') } },
  orderBy: { updatedAt: 'asc' }
}).then(console.log);
"
```

## Reservation State Corruption Recovery

When state machine is in invalid terminal state:

```bash
# Read-only inspection first — never blind UPDATE
node -e "
const { prisma } = require('./dist/services/database.js');
prisma.reservation.findMany({
  where: { status: { in: ['PENDING', 'CONFIRMED'] } },
  orderBy: { updatedAt: 'desc' },
  take: 50
}).then(console.log);
"

# Repair query pattern (example: stuck PENDING > 2 hours)
node -e "
const { prisma } = require('./dist/services/database.js');
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
prisma.reservation.updateMany({
  where: {
    status: 'PENDING',
    createdAt: { lt: twoHoursAgo }
  },
  data: { status: 'CANCELLED' }
}).then(console.log);
"
```

## Table-Status Divergence

When DB state and broadcast state disagree:

```bash
# Source-of-truth: DB state
node -e "
const { prisma } = require('./dist/services/database.js');
prisma.table.findMany({
  where: { venueId: '<venue-id>' },
  select: { id: true, status: true, updatedAt: true }
}).then(console.log);
"

# Force broadcast to all subscribers
# Restart service to reset SSE broadcaster state
doctl apps create-deployment $DO_APP_ID --wait
```

## Rollback

```bash
# List recent deployments
doctl apps list-deployments $DO_APP_ID

# Redeploy previous version
doctl apps create-deployment $DO_APP_ID --deployment-id <previous-deployment-id>

# Post-rollback checklist:
# 1. Verify health endpoints return ok
# 2. Check SSE events are flowing
# 3. Verify reservation state transitions work
# 4. Check Sentry for error spikes
# 5. Replay any missed events if needed
```

## Auth0 Configuration

Auth0 tenant: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
API Identifier: `https://api.mattbutlerengineering.com`
