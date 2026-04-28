# ROLLBACK.md — apps/hospitality/

Rollback procedures for the Hospitality app.

## When to Roll Back

- **DO NOT** roll back for: Minor UI glitches, missing features, style inconsistencies
- **DO** roll back for: Data corruption, auth failures, broken reservations, Sentry error spike >5%

## Rollback Procedure

### Method 1: Wrangler CLI

```bash
# List recent deployments
pnpm dlx wrangler@latest deployments list --name mattbutlerengineering-hospitality

# Roll back to specific deployment
pnpm dlx wrangler@latest deployments rollback --name mattbutlerengineering-hospitality <deployment-id>
```

### Method 2: Cloudflare Dashboard

1. Log in to Cloudflare Dashboard
2. Navigate to **Workers & Pages** → `mattbutlerengineering-hospitality`
3. Click **Deployments** tab
4. Find last known good deployment
5. Click **Rollback to this deployment**

## Post-Rollback Checklist

1. **Verify health**: `curl https://mattbutlerengineering.com/hospitality/api/health`
2. **Check Sentry**: Error rates should drop within 5 minutes
3. **Smoke test**: Navigate to `/hospitality/`, verify dashboard loads
4. **File post-mortem**: Create issue with label `post-mortem`, include:
   - What went wrong
   - Why rollback was chosen
   - What will prevent recurrence
   - Link to Sentry issues / CI logs
5. **Update deploy log**: Comment on the original PR with "Rolled back due to <reason>"

## Canary Rollback

```bash
# If canary is the problem, promote stable instead
pnpm dlx wrangler@latest deployments rollback \
  --name mattbutlerengineering-hospitality-canary <stable-deployment-id>
```

## Emergency Contacts

- **On-call**: `@mattbutlerengineering` GitHub team
- **Escalation**: Team lead (30min response SLA)
