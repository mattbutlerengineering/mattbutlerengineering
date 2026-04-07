# Runbook: Static Sites Unhealthy

## Quick Diagnosis

```bash
# Check each static site
curl -sf -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/
curl -sf -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/hospitality
curl -sf -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/rialto
curl -sf -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/gen
```

## Common Causes

### 1. Cloudflare Worker deployment failed
- Check [CF dashboard](https://dash.cloudflare.com/) for Worker status
- Each site is a separate Worker bound via Service Binding in the edge router
- Failed `wrangler deploy` leaves the previous version running

### 2. Edge router misconfiguration
- The edge router (`infrastructure/worker/edge-router.js`) routes by path prefix
- Check recent changes to the router for routing bugs
- Test routing: `curl -v https://mattbutlerengineering.com/hospitality`

### 3. Build output missing
- Static sites are SPAs — if `dist/` is empty, the Worker serves nothing
- Check CI build step: `gh run list --workflow deploy-static.yml --limit 5`
- Verify build locally: `pnpm --filter @mbe/marketing build`

### 4. DNS/CDN issue
- Static sites bypass CDN (Service Bindings) — CDN cache is not the issue
- Check if `mattbutlerengineering.com` resolves: `dig mattbutlerengineering.com AAAA`

## Recovery Steps

1. **If all sites down**: Edge router Worker is likely the issue — check CF dashboard
2. **If one site down**: That site's Worker failed to deploy — check deploy logs
3. **Rollback**: Deploy previous version via `wrangler rollback` or retrigger last successful deploy
