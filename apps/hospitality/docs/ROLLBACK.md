# Hospitality App — Rollback Procedures

> When and how to roll back the hospitality app.

## When to Roll Back

Roll back immediately if:

1. **Critical error rate spikes** — >10% of requests returning 5xx
2. **Users cannot authenticate** — Auth flow completely broken
3. **Data corruption** — Reservations not saving/loading correctly
4. **Complete downtime** — App returns 5xx for all requests

Do NOT roll back for:
- UI glitches
- Non-critical errors
- Performance degradation (investigate first)

## Rollback via Wrangler

### Find Last Good Deploy

```bash
wrangler deployments list --name mattbutlerengineering-hospitality
```

Note the SHA of the last known good deploy.

### Deploy Previous SHA

```bash
cd apps/hospitality
pnpm dlx wrangler deploy --legacy-cli-duration-isolation -- conserves --env <PREVIOUS_SHA>
```

Or use the deployment ID:

```bash
wrangler rollback mattbutlerengineering-hospitality --version <VERSION_ID>
```

## Rollback via Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers → mattbutlerengineering-hospitality
2. Click "Settings" → "Deployments"
3. Find the previous working deployment
4. Click "Rollback"

## Post-Rollback

1. **File a post-mortem issue** — Use the incident template
2. **Update the deploy log** — Document what failed
3. **Notify on-call** — Post in #incidents channel

## Cross-Reference

- [RUNBOOK.md](./RUNBOOK.md)
- [docs/IMPROVEMENT-BACKLOG.md](./IMPROVEMENT-BACKLOG.md)