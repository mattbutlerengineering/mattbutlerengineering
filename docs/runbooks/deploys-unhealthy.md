# Runbook: Deploys Unhealthy

## Quick Diagnosis

```bash
# Check recent deploy workflows
gh run list --workflow deploy-services.yml --limit 5 --json conclusion,createdAt \
  -q '.[] | "\(.conclusion)\t\(.createdAt)"'
gh run list --workflow deploy-static.yml --limit 5 --json conclusion,createdAt \
  -q '.[] | "\(.conclusion)\t\(.createdAt)"'

# Check Pulumi deploy
gh run list --workflow pulumi-up.yml --limit 5 --json conclusion,createdAt \
  -q '.[] | "\(.conclusion)\t\(.createdAt)"'
```

## Common Causes

### 1. Deploy workflow failed
- Check workflow logs: `gh run view <RUN_ID> --log-failed`
- Common: missing secrets, Docker build failure, network timeout

### 2. Database migration failed
- Pre-deploy migration job runs before services start
- Check migration logs in DO dashboard
- Fix: `pnpm --filter @mbe/<service> db:migrate:deploy` locally to diagnose

### 3. Pulumi state conflict
- Multiple Pulumi runs can conflict on the state lock
- Check: `cd infrastructure/pulumi && pulumi stack`
- Fix: `pulumi cancel` to release a stuck lock (use with caution)

### 4. Cloudflare API error
- Static site deploys use `wrangler` which calls CF API
- Check CF API status and token expiration
- Verify `CLOUDFLARE_API_TOKEN` secret is valid

### 5. DigitalOcean API error
- Service deploys use `doctl` which calls DO API
- Check DO API status and token expiration
- Verify `DIGITALOCEAN_ACCESS_TOKEN` secret is valid

## Recovery Steps

1. **If migration failed**: Fix the migration, push to main, CI will redeploy
2. **If Docker build failed**: Check Dockerfile changes in the failing commit
3. **If secret expired**: Rotate the secret in GitHub Settings > Secrets
4. **Manual redeploy**: Trigger workflow manually via GitHub Actions UI
