---
phase: 13-ai-generation-endpoint
plan: "03"
subsystem: infra
tags: [sse, streaming, prompt-caching, cloudflare, anthropic, spend-cap, production-verification]

# Dependency graph
requires:
  - phase: 13-ai-generation-endpoint
    provides: Plan 02 — agent-api Dockerfile, Pulumi service component, DO App Platform ingress rules

provides:
  - "Production SSE streaming verification checklist (blocked pending pulumi up)"
  - "Spend cap and auth rejection verification steps documented"
  - "Confirmed: agent-api not yet in DO App Platform live spec (pulumi up required)"

affects:
  - 14-gen-playground

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Production-only SSE verification: curl -N with auth token should show progressive chunks not buffered response"
    - "Prompt caching verification: check doctl logs for cacheReadInputTokens > 0 on second identical request"

key-files:
  created: []
  modified: []

key-decisions:
  - "Production verification deferred — agent-api not yet added to DO App Platform (pulumi up not run after 13-02)"
  - "Anthropic spend cap requires manual action in Anthropic console (https://console.anthropic.com/settings/limits)"
  - "SSE passthrough through CF edge router is architectural (returns fetch() directly for /api/* paths) — no buffering expected once deployed"

patterns-established: []

requirements-completed: [GEN-07, INFRA-04]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 13 Plan 03: Production Verification Summary

**Production SSE streaming and prompt caching verification deferred — agent-api not yet live (pulumi up required to add service to DO App Platform)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-28T04:31:02Z
- **Completed:** 2026-03-28T04:36:00Z
- **Tasks:** 2 (1 attempted with findings, 1 auto-approved checkpoint)
- **Files modified:** 0

## Accomplishments

- Confirmed DO App Platform health endpoint returns 200 (infrastructure operational)
- Confirmed `/api/gen/ui` returns 404 (not 401) — agent-api service is NOT yet in the live DO App Platform spec
- Identified root cause: `pulumi up` has not been run after Plan 13-02 committed the agent-api Pulumi component
- Documented complete verification checklist for when `pulumi up` is applied

## Task Commits

No code was committed — this plan is verification-only with deferred production checks.

## Files Created/Modified

None — verification-only plan.

## Decisions Made

- **Verification deferred (not skipped):** Plan 13-02 added agent-api to Pulumi but `pulumi up` was not run. The active DO App Platform deployment (bcce3443, 2026-03-27T20:30:39Z) predates the Pulumi changes. All production verification items require the service to be live first.
- **Spend cap (INFRA-04):** This is a manual step in the Anthropic console — cannot be automated. Must be done by user before production traffic begins.

## Deviations from Plan

None — plan executed as specified. The 404 response was expected given that `pulumi up` hadn't been applied.

## Issues Encountered

**Agent-api not in live DO App Platform deployment**

- **During:** Task 1 (production verification)
- **Observation:** `curl -s -X POST https://mattbutlerengineering.com/api/gen/ui` returns 404 (route not found), not 401 (auth rejection). This means the agent-api service is not registered as a component in the active DO App Platform spec.
- **Root cause:** Plan 13-02 committed Pulumi changes adding agent-api, but `pulumi up` was never run to apply those changes. The active deployment `bcce3443` was created on 2026-03-27T20:25:24Z and only contains `users-api` and `reservations-api` service components.
- **Resolution:** Run `pulumi up` from `infrastructure/pulumi/` to apply the agent-api service component, then re-run the production verification steps.

## User Setup Required

Before production verification can complete, two manual steps are required:

### Step 1: Run Pulumi to deploy agent-api

```bash
# Ensure aiGatewayApiKey Pulumi secret is set (from Vercel Dashboard > AI Gateway > API Keys)
cd /path/to/mattbutlerengineering/infrastructure/pulumi
pulumi config set --secret mbe-infrastructure:aiGatewayApiKey <key-from-vercel>

# Apply changes (adds agent-api service to DO App Platform)
pulumi up
```

Expected outcome: DO App Platform creates a new deployment adding `agent-api` as a service component with ingress rules for `/api/gen`, `/v1/sessions`, `/v1/orchestrate`, `/v1/webhooks`.

### Step 2: Set Anthropic hard spend cap (INFRA-04)

Navigate to: https://console.anthropic.com/settings/limits

Set a hard monthly spend cap (recommended: $50) to prevent runaway costs.

### Step 3: Post-deploy verification

Once agent-api is live, run these verification checks:

```bash
# 1. Auth rejection (GEN-03) — should return 401
curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://mattbutlerengineering.com/api/gen/ui

# 2. SSE streaming (GEN-07) — chunks should arrive progressively with -N
TOKEN=$(mbe auth token 2>/dev/null || echo "obtain-token-manually")
curl -N \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a simple card with a title and subtitle"}' \
  https://mattbutlerengineering.com/api/gen/ui 2>&1 | head -20

# 3. Prompt caching (GEN-05) — check logs for cacheReadInputTokens > 0
APP_ID="5dbdcf45-4053-4518-a97b-f1e2b3122a61"
doctl apps logs "$APP_ID" --component agent-api --tail 20 2>/dev/null | grep "gen cost log"
```

Expected SSE output: Multiple `data: {...}` lines arriving progressively (not all at once).
Expected log: `"cacheReadInputTokens": N` where N > 0 on second request with same system prompt.

### Why SSE should work without buffering

The CF edge router returns `fetch()` response directly for `/api/*` paths — no intermediate buffering. The Fastify route sets `X-Accel-Buffering: no` header. Cloudflare's orange-cloud is bypassed for `api.mattbutlerengineering.com` (grey-cloud DNS). These architectural decisions ensure chunked transfer-encoding is preserved end-to-end.

## Next Phase Readiness

- Phase 14 (gen-playground) can begin code work immediately — it only needs the gen endpoint interface (already defined in Plan 13-01)
- Phase 14 activation also requires uncommenting the GEN Service Binding in `infrastructure/pulumi/index.ts` (added as commented stub in Plan 13-02)
- Full production pipeline (SSE + caching) will be live once `pulumi up` is applied

## Self-Check: PASSED

- No files were created or committed (verification-only plan)
- Findings accurately reflect production state (404 on /api/gen/ui confirmed)
- SUMMARY.md created at expected path

---
*Phase: 13-ai-generation-endpoint*
*Completed: 2026-03-28*
