# Next Steps

**Last updated:** 2026-01-25

## Current Status

### Completed
- [x] Monorepo setup (Turborepo + pnpm)
- [x] Shared configs (TypeScript, ESLint, Prettier)
- [x] packages/ui (Button, Card components)
- [x] packages/auth (OIDC React provider, Fastify JWT middleware)
- [x] packages/types (shared TypeScript types)
- [x] packages/shared-layout (Header, Footer, Sidebar, AppLayout)
- [x] packages/api-client (typed API client)
- [x] apps/web (landing page)
- [x] apps/dashboard (authenticated dashboard)
- [x] services/users (Fastify + Prisma, CRUD, health, OpenAPI)
- [x] tools/cli (Commander.js with auth commands)
- [x] infrastructure/docker-compose (dev, prod)
- [x] infrastructure/traefik config
- [x] Local development verified working
- [x] Domain purchased (mattbutlerengineering.com via Cloudflare)
- [x] infrastructure/pulumi (TypeScript IaC with Pulumi)
- [x] services/users/Dockerfile (production Docker build)
- [x] .dockerignore (excludes dev files from builds)
- [x] Auth0 authentication (local + production)
- [x] DigitalOcean App Platform deployment
- [x] Cloudflare DNS configured
- [x] Neon PostgreSQL database
- [x] CI/CD pipelines (lint, typecheck, build, test)
- [x] Pulumi preview on PRs
- [x] Pulumi deploy on merge to main
- [x] Architecture documentation

### Production URLs
| Service | URL |
|---------|-----|
| Website | https://mattbutlerengineering.com |
| Dashboard | https://mattbutlerengineering.com/dashboard |
| API | https://mattbutlerengineering.com/api |
| Health Check | https://mattbutlerengineering.com/api/health |
| API Docs | https://mattbutlerengineering.com/api/docs |

### Local Dev Commands
```bash
# Start PostgreSQL
cd infrastructure && docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres -d

# Push database schema
cd services/users && pnpm db:push

# Start services
pnpm --filter @mbe/web --filter @mbe/users-service dev

# URLs
# - Web: http://localhost:3000
# - Users API: http://localhost:3001
# - API Docs: http://localhost:3001/docs
```

---

## Infrastructure Overview

```
User → Cloudflare (DNS/CDN) → DigitalOcean App Platform
                                    ├── web (React static)
                                    ├── dashboard (React static)
                                    └── users-api (Fastify Docker) → Neon PostgreSQL

Auth0 handles OAuth 2.0 / OIDC authentication
```

See `docs/ARCHITECTURE.md` for detailed diagrams.

---

## Remaining Tasks

### 1. Testing
- [ ] Add Vitest to packages
- [ ] Write tests for users service
- [ ] Write tests for auth utilities
- [ ] Add test coverage reporting to CI
- [ ] Remove `continue-on-error: true` from test job

### 2. Feature Development
- [ ] User profile page in dashboard
- [ ] User settings/preferences
- [ ] Admin panel for user management

### 3. Optional Enhancements
- [ ] apps/docs - documentation site (Astro or Docusaurus)
- [ ] Email service integration (Resend or SendGrid)
- [ ] Error tracking (Sentry)
- [ ] Analytics (Plausible)
- [ ] Dependabot for dependency updates

---

## CI/CD Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| CI | Push/PR to main | Lint, typecheck, build, test |
| Pulumi Preview | PR touching `infrastructure/pulumi/**` | Preview infra changes, comment on PR |
| Pulumi Deploy | Push to main touching `infrastructure/pulumi/**` | Deploy infrastructure |

DigitalOcean App Platform auto-deploys on push to main (configured in DO).

---

## File Locations

| What | Where |
|------|-------|
| Architecture docs | `docs/ARCHITECTURE.md` |
| Platform design doc | `docs/plans/2026-01-22-platform-design.md` |
| Pulumi IaC | `infrastructure/pulumi/` |
| Users Dockerfile | `services/users/Dockerfile` |
| CI workflow | `.github/workflows/ci.yml` |
| Pulumi preview | `.github/workflows/pulumi-preview.yml` |
| Pulumi deploy | `.github/workflows/pulumi-up.yml` |

---

## Quick Reference

```bash
# Full typecheck
pnpm typecheck

# Full lint
pnpm lint

# Build all
pnpm build

# Run tests
pnpm test

# Stop dev servers
lsof -ti:3000,3001 | xargs kill

# View Prisma Studio (database GUI)
cd services/users && pnpm db:studio

# Pulumi commands (from infrastructure/pulumi/)
pulumi preview    # See what would change
pulumi up         # Deploy changes
pulumi stack output  # View outputs
```

---

## Secrets Management

**GitHub Actions Secrets** (configured):
- `DIGITALOCEAN_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `PULUMI_ACCESS_TOKEN`
- `PULUMI_CONFIG_PASSPHRASE`

**Pulumi Secrets** (in `Pulumi.prod.yaml`):
- `auth0:clientId`
- `auth0:clientSecret`
- `digitalocean:token`
- `cloudflare:apiToken`
- `mbe-infrastructure:databaseUrl`
