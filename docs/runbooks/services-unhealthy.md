# Runbook: API Services Unhealthy

## Quick Diagnosis

```bash
# Check each service health endpoint
curl -sf https://api.mattbutlerengineering.com/api/v1/users/health | jq .
curl -sf https://api.mattbutlerengineering.com/api/v1/reservations/health | jq .
curl -sf https://api.mattbutlerengineering.com/v1/sessions | jq .pagination
```

## Common Causes

### 1. DigitalOcean App Platform issue

- Check [DO dashboard](https://cloud.digitalocean.com/apps) for app status
- Look for failed deployments, OOM kills, or scaling issues
- Check app logs: `doctl apps logs <app-id> --type run`

### 2. Database connectivity

- Health endpoints include DB latency — if latency > 1000ms or status is "error", DB is the issue
- Check Prisma connection string in DO environment variables
- Verify Postgres is running and accepting connections

### 3. Auth0 outage

- Services depend on Auth0 for JWT verification
- Check [Auth0 status](https://status.auth0.com/)
- Non-health endpoints will return 401 if JWKS fetch fails

### 4. Recent deploy broke something

- Check recent deploys: `gh run list --workflow deploy-services.yml --limit 5`
- Rollback: trigger previous successful deploy or revert the merge commit

## Recovery Steps

1. **If all services down**: Check DO App Platform status and recent deploys
2. **If one service down**: Check that service's logs via DO dashboard
3. **If DB is slow**: Check connection pool utilization, consider restarting the service
4. **If intermittent**: May be a cold start issue — DO scales to zero on free tier
