# Deploy Fixes Context

## Infrastructure Stack

- **Static sites**: Cloudflare Workers (wrangler)
- **API services**: DigitalOcean App Platform
- **Database**: PostgreSQL (Prisma)
- **IaC**: Pulumi (TypeScript)

## Common Fixes

### Cloudflare Workers (apps/*)

```bash
# Deploy
cd apps/my-app && wrangler deploy

# Test locally
wrangler dev
```

Check `apps/*/wrangler.toml` for config.

### DigitalOcean App Platform

```bash
# Deploy via doctl
doctl apps create-deployment ...
```

Managed by `infrastructure/pulumi/`. Check `infrastructure/CLAUDE.md`.

### Prisma/DB Issues

```bash
# Push schema (dev)
pnpm db:push

# Create migration (prod)
pnpm db:migrate
```

See `.claude/skills/prisma-migrations/SKILL.md`.

### Common Errors

1. **"Service not found"**: Check `doctl apps list` for running services
2. **"Build failed"**: Check build logs in DO dashboard
3. **"Connection refused"**: Database not ready, check health
4. **"404 on assets"**: Run `pnpm build` before deploy

### Files to Check
- `infrastructure/` - Pulumi code
- `apps/*/wrangler.toml` - Worker config
- `services/*/Dockerfile` - DO service builds
- `CLAUDE.md` in each service/app

### Anti-patterns
- ❌ Don't hardcode credentials (use env vars)
- ❌ Don't skip health checks
- ❌ Don't deploy without testing locally first
