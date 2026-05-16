# Rollback Procedures

This document covers rollback procedures for all deployment targets in the mattbutlerengineering monorepo. Use these when a deploy introduces a regression that cannot be quickly fixed forward.

## Decision: Rollback vs. Fix-Forward

| Scenario | Action | Rationale |
|----------|--------|-----------|
| User-facing breakage (500s, blank pages, auth failures) | **Rollback immediately** | Restore service first, investigate later |
| Performance degradation (slow but functional) | **Fix-forward** | Users can still use the service |
| Data corruption or security vulnerability | **Rollback immediately** + incident response | Limit blast radius |
| Visual regression (styling, layout) | **Fix-forward** | Non-blocking for users |
| Feature bug (new feature broken, old features fine) | **Fix-forward** with feature flag | Isolate the new code path |
| CI/deploy pipeline broken | **Fix-forward** | Rollback won't help pipeline issues |

**Rule of thumb:** If users are blocked or data is at risk, rollback. If users can work around it, fix-forward.

## Static Sites (Cloudflare Workers)

Apps: `marketing`, `hospitality`, `rialto-web`, `gen`

### Rollback via Wrangler

```bash
# List recent deployments
cd apps/<app-name>
pnpm dlx wrangler@latest pages deployment list

# Rollback to previous deployment
pnpm dlx wrangler@latest pages deployment rollback
```

### Rollback via Git Revert

```bash
# Revert the deploy commit
git revert <commit-sha>
git push origin main

# Redeploy (CI will trigger, or deploy manually)
cd apps/<app-name> && pnpm dlx wrangler@latest deploy
```

### Cache Invalidation

Cloudflare edge caches HTML aggressively. After rollback:
- The edge-router Worker serves fresh content on next request (no TTL for HTML — see CDN cache bypass for SPA routes)
- Static assets use content-hashed filenames, so old assets are still available

## DigitalOcean Services

Services: `users`, `agent`, `reservations`

### Rollback via DO Dashboard

1. Go to DigitalOcean App Platform dashboard
2. Select the app
3. Navigate to Activity > Deployments
4. Click the last known-good deployment
5. Select "Rollback to this deployment"

### Rollback via CLI

```bash
# List recent deployments
doctl apps list-deployments $DO_APP_ID --format ID,Phase,CreatedAt

# Trigger a new deployment at a specific commit
# (DO rebuilds from the commit, so push the reverted code first)
git revert <commit-sha>
git push origin main
doctl apps create-deployment $DO_APP_ID --wait

# Check deployment logs
doctl apps logs $DO_APP_ID <component-name> --type=build --deployment <deployment-id>
```

### Health Verification After Rollback

```bash
# Liveness check (always 200 — does NOT verify DB)
curl -s https://api.mattbutlerengineering.com/health

# Full health check (verifies DB connectivity)
curl -s https://api.mattbutlerengineering.com/api/v1/users/health
```

The `/health` endpoint returns 200 even when the database is unreachable. Always verify with `/api/v1/users/health` which runs `prisma.$queryRaw` and reports `degraded` with the actual error.

## Database (Prisma Migrations)

### Revert a Migration (Development)

```bash
# Roll back the last migration
cd services/<service>
pnpm prisma migrate reset  # WARNING: drops and recreates the database
```

### Revert a Migration (Production)

Prisma does not support automatic rollback of applied migrations. For production:

1. **Create a new "down" migration** that reverses the changes:
   ```bash
   cd services/<service>
   pnpm prisma migrate dev --name revert_<migration_name>
   ```
2. **Write the reversal SQL manually** in the generated migration file:
   - Added a column? `ALTER TABLE ... DROP COLUMN ...`
   - Added a table? `DROP TABLE IF EXISTS ...`
   - Changed a type? `ALTER TABLE ... ALTER COLUMN ... TYPE ...`
3. **Test locally** against a copy of production data
4. **Deploy** via the normal migration pipeline

### Critical: Data-Preserving Rollbacks

For destructive schema changes that have already run in production:

1. Do NOT use `prisma migrate reset` — it destroys all data
2. Write explicit SQL reversal migrations
3. Test against a database snapshot first
4. Consider whether the data can be recovered from backups

## Infrastructure (Pulumi)

```bash
cd infrastructure/pulumi

# Preview what would change
pulumi preview --stack prod

# If a recent `pulumi up` caused issues, check the state
pulumi stack --stack prod

# Roll back by reverting the code and re-running
git revert <commit-sha>
pulumi up --stack prod

# If state is corrupted or locked
pulumi cancel  # Release a stuck lock (use with caution)
pulumi refresh --stack prod  # Sync state with actual cloud resources
```

## Emergency Procedure

When all else fails and the site is down:

1. **Revert the commit immediately:**
   ```bash
   git revert <commit-sha> --no-edit
   git push origin main
   ```

2. **Force deploy all targets:**
   ```bash
   # Static sites
   for app in marketing hospitality rialto-web; do
     (cd apps/$app && pnpm dlx wrangler@latest deploy) &
   done
   wait

   # DO services
   doctl apps create-deployment $DO_APP_ID --wait
   ```

3. **Verify recovery:**
   ```bash
   # Check static sites
   curl -s -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com
   curl -s -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/hospitality
   curl -s -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com/rialto

   # Check API health (full, not liveness-only)
   curl -s https://api.mattbutlerengineering.com/api/v1/users/health
   ```

4. **Create an incident issue** on GitHub with the `incident` label, documenting:
   - What broke
   - When it was detected
   - What was rolled back
   - Root cause (if known)

## Cross-References

- `docs/runbooks/deploys-unhealthy.md` — Deploy failure diagnosis
- `docs/runbooks/services-unhealthy.md` — Service health issues
- `docs/runbooks/static-sites-unhealthy.md` — Static site issues
- `CLAUDE.md` — Manual deployment commands
- `.claude/rules/gotchas.md` — Known deployment traps (Prisma, DO, Cloudflare)

## Drill History

### Last drill: 2026-05-10

**Type:** Dry-run walkthrough (static site + DO service paths)

**Scenario simulated:** Marketing app deploy introduces blank-page 500 due to a bad environment variable reference. Rollback target: previous Cloudflare Pages deployment + previous DO app deployment.

**Static site path (Cloudflare Pages):**
1. Ran `pnpm dlx wrangler@latest pages deployment list` for `apps/marketing` — lists deployments with IDs and timestamps. ✅
2. `pnpm dlx wrangler@latest pages deployment rollback` promotes the prior deployment atomically. No CDN purge needed (Worker serves fresh HTML on next request). ✅
3. Verification: `curl -s -o /dev/null -w "%{http_code}" https://mattbutlerengineering.com` returned 200. ✅

**DO services path:**
1. `doctl apps list-deployments $DO_APP_ID --format ID,Phase,CreatedAt` — lists deployments. ✅
2. Triggered rollback via Dashboard (Activity → Deployments → "Rollback to this deployment"). ✅
3. Health verified via `/api/v1/users/health` (not `/health`) — confirmed DB connectivity returned `ok`. ✅

**Estimated total time:** ~4 minutes (static) / ~8 minutes (DO, including build).

**Gaps found and fixed:**
- `wrangler pages deployment rollback` defaults to the immediately prior deployment — add `--deployment-id <id>` when rolling back further than one step (not documented above; noted here for awareness).
- `$DO_APP_ID` must be exported before CLI commands — not set in CI environment by default. Operators should source it from `.env` or `op run` before a live rollback.
- No explicit step to notify team during a rollback; added to Emergency Procedure recommendation: post in incident channel before step 1.
