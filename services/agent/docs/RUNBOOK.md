# RUNBOOK.md — services/agent

Operational runbook for the agent service (Fastify + Prisma, port 3003). Deployed on DigitalOcean App Platform. Highest blast-radius: executes code in worktrees, consumes API budget.

## Deploy

```bash
# Deploy via DO CLI
doctl apps create-deployment $DO_APP_ID --wait

# Get build logs
doctl apps logs $DO_APP_ID agent-api --type=build --deployment <deployment-id>

# Component name: agent-service
# DO App ID: check services/agent/CLAUDE.md or DO dashboard
```

## Health Checks

| Endpoint | Type | Behavior |
|-----------|------|-------------|
| `/health` | Liveness | Always returns `{"status": "ok"}` — no DB touch |
| `/api/v1/agent/health` | Readiness | Runs `prisma.$queryRaw` — returns `degraded` with actual DB error |

```bash
# Check health
curl https://api.mattbutlerengineering.com/api/v1/agent/health
```

## Runaway Agent Kill-Switch

When a session is burning budget without progress:

```bash
# Identify runaway sessions
curl -s http://localhost:3003/v1/sessions?status=RUNNING | jq '.data[] | select(.totalCostUsd > 0.50)'

# Terminate session
curl -s -X DELETE http://localhost:3003/v1/sessions/<sessionId>

# Clean up worktree
git worktree remove /tmp/agent-worktrees/<sessionId>/ --force
rm -rf /tmp/agent-worktrees/<sessionId>/
```

**Detection signals:**
- Session `totalCostUsd` > 80% of `maxBudgetUsd` with no PR created
- Session `totalTurns` > 80% of `maxTurns` with no progress
- Session running > 30 minutes with `status: RUNNING`

## Disk-Space Recovery

When worktrees pile up (failed cleanup):

```bash
# Check disk usage
du -sh /tmp/agent-worktrees/

# List stale worktrees (older than 24h)
find /tmp/agent-worktrees/ -type d -mtime +1 -exec ls -ld {} \;

# Reclamation script
for dir in /tmp/agent-worktrees/*/; do
  sessionId=$(basename "$dir")
  status=$(curl -s http://localhost:3003/v1/sessions/$sessionId | jq -r '.data.status // "NOT_FOUND"')
  if [ "$status" = "SUCCEEDED" ] || [ "$status" = "FAILED" ] || [ "$status" = "CANCELLED" ] || [ "$status" = "NOT_FOUND" ]; then
    echo "Cleaning $dir (status: $status)"
    git worktree remove "$dir" --force 2>/dev/null
    rm -rf "$dir"
  fi
done
```

## Langfuse Outage Fallback

When `LANGFUSE_PUBLIC_KEY` is unset or Langfuse is down:

```bash
# Check Langfuse connectivity
curl -s https://cloud.langfuse.ai/api/public/health

# Behavior: MUST be no-op, not blocking
# Agent sessions should continue without tracing when Langfuse is unavailable
# Verify in services/agent: check that tracing initialization is wrapped in try/catch
```

**Critical:** Langfuse outage must NEVER block agent execution. Tracing is optional.

## Budget Cap Exhaustion

When the org hits its monthly Anthropic budget:

```bash
# Check current spend
curl -s https://api.anthropic.com/v1/organization/billing/usage \
  -H "x-api-key: $ANTHROPIC_API_KEY" | jq .

# Alert path: Sentry alert on 402 Payment Required responses
# Override procedure: add funds via Anthropic console, restart service
```

**Behavior on budget exhaustion:**
- Session receives 402 Payment Required
- Session status set to `FAILED`
- Worktree cleaned up
- Error message: "Budget exceeded for organization"

## Session Corruption Recovery

When DB session row is out of sync with worktree state:

```bash
# Read-only inspection first
node -e "
const { prisma } = require('./dist/services/database.js');
prisma.agentSession.findMany({
  where: { status: 'RUNNING' },
  orderBy: { updatedAt: 'desc' },
  take: 20
}).then(console.log);
"

# Source-of-truth: DB session row
# If worktree exists but session is TERMINAL → clean up worktree
# If session is RUNNING but worktree missing → mark session as FAILED

# Repair query (example: orphaned RUNNING sessions > 2h)
node -e "
const { prisma } = require('./dist/services/database.js');
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
prisma.agentSession.updateMany({
  where: {
    status: 'RUNNING',
    updatedAt: { lt: twoHoursAgo }
  },
  data: { status: 'FAILED', errorMessage: 'Timeout: session orphaned' }
}).then(console.log);
"
```

## Model Rate-Limit Response

When Anthropic API rate-limits:

```bash
# Behavior: exponential backoff with escalation
# 1. Wait and retry (1s, 2s, 4s, 8s... max 60s)
# 2. If still rate-limited, escalate model tier DOWN (Opus → Sonnet → Haiku)
# 3. If all tiers rate-limited, mark session FAILED
```

**Fallback strategy:**
- Opus rate-limited → retry with Sonnet
- Sonnet rate-limited → retry with Haiku
- Haiku rate-limited → FAILED (no cheaper tier available)

## Rollback

```bash
# List recent deployments
doctl apps list-deployments $DO_APP_ID

# Redeploy previous version
doctl apps create-deployment $DO_APP_ID --deployment-id <previous-deployment-id>

# In-flight session handling:
# - Running sessions continue in their worktrees
# - New sessions use new deployment
# - Consider draining: stop new sessions, let running ones finish

# Post-rollback checklist:
# 1. Verify health endpoints return ok
# 2. Check Sentry for error spikes
# 3. Verify agent sessions can still be created
# 4. Check Langfuse tracing is working (if configured)
# 5. Verify budget cap is still enforced
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `LANGFUSE_PUBLIC_KEY` | No | Langfuse tracing (optional) |
| `DO_APP_ID` | Yes (deploy) | DigitalOcean App ID |
| `MAX_CONCURRENT_SESSIONS` | No | Max parallel sessions (default: 5) |

## Auth0 Configuration

Auth0 tenant: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
API Identifier: `https://api.mattbutlerengineering.com`
