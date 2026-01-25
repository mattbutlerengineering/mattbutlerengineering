# Next Steps

**Last updated:** 2026-01-24

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
- [x] .github/workflows/ci.yml
- [x] Local development verified working
- [x] Domain purchased (mattbutlerengineering.com via Cloudflare)
- [x] infrastructure/pulumi (TypeScript IaC with Pulumi)
- [x] services/users/Dockerfile (production Docker build)
- [x] .dockerignore (excludes dev files from builds)
- [x] Auth0 authentication (local dev working)

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

## Remaining Tasks

### 1. Auth0 Setup
- [x] Create Auth0 tenant (dev-ytbgmz5ls3wh4xdx.us.auth0.com)
- [x] Create Application (mattbutlerengineering-app, SPA type)
- [x] Configure callback URLs (http://localhost:3002/dashboard/callback)
- [x] Create API (https://api.mattbutlerengineering.com)
- [x] Authorize app to access API
- [x] Configure `.env` files with credentials
- [x] JWT validation working on /users/me endpoint

**For production, add these callback URLs in Auth0:**
- `https://mattbutlerengineering.com/callback`
- `https://mattbutlerengineering.com/dashboard/callback`

### 2. Domain Setup (Cloudflare)
- [x] Purchase/transfer domain on Cloudflare
- [x] Enable SSL/TLS (automatic with Cloudflare)
- [ ] Configure DNS records (managed by Pulumi - deploy to create)

### 3. Hosting Setup (DigitalOcean + Pulumi)
**Chosen:** DigitalOcean App Platform with TypeScript IaC (Pulumi)

**What's ready:**
- [x] Pulumi project (`infrastructure/pulumi/`)
- [x] DigitalOcean App Platform spec (web, dashboard, users-api)
- [x] Managed PostgreSQL 16 database config
- [x] Cloudflare DNS records (root + www)
- [x] Users service Dockerfile

**What gets deployed:**
| Resource | Description |
|----------|-------------|
| PostgreSQL | Managed DB (1 vCPU, 1GB, NYC1) |
| users-api | Fastify service via Docker |
| web | Static landing page |
| dashboard | Static dashboard app |
| DNS | CNAME records via Cloudflare |

**To deploy:**
```bash
cd infrastructure/pulumi
pnpm install
pulumi login --local
pulumi stack init prod
pulumi config set digitalocean:token YOUR_TOKEN --secret
pulumi config set cloudflare:apiToken YOUR_TOKEN --secret
pnpm up
```

**Remaining steps:**
- [ ] Create DigitalOcean account → get API token
- [ ] Get Cloudflare API token (API Tokens → Create Token → Edit zone DNS)
- [ ] Connect GitHub repo to DigitalOcean (happens on first deploy)
- [ ] Run `pulumi up` to deploy
- [ ] Verify deployment at https://mattbutlerengineering.com

### 4. CI/CD Enhancements
- [ ] Add Docker build step to CI (currently commented out)
- [ ] Set up GitHub Container Registry or other registry
- [ ] Add deployment workflow for staging/production
- [ ] Add Dependabot for dependency updates

### 5. Testing
- [ ] Add Vitest to packages
- [ ] Write tests for users service
- [ ] Write tests for auth utilities
- [ ] Add test coverage reporting to CI

### 6. Optional Enhancements
- [ ] apps/docs - documentation site (Astro or Docusaurus)
- [ ] Email service integration (Resend or SendGrid)
- [ ] Error tracking (Sentry)
- [ ] Analytics (Plausible)
- [ ] Database backups (cron + pg_dump)

---

## File Locations

| What | Where |
|------|-------|
| Platform design doc | `docs/plans/2026-01-22-platform-design.md` |
| Docker configs (local) | `infrastructure/docker-compose*.yml` |
| Pulumi IaC | `infrastructure/pulumi/` |
| Users Dockerfile | `services/users/Dockerfile` |
| Environment example | `infrastructure/.env.example` |
| CI workflow | `.github/workflows/ci.yml` |
| Users service env | `services/users/.env.example` |

---

## Quick Reference

```bash
# Full typecheck
pnpm typecheck

# Full lint
pnpm lint

# Stop dev servers
lsof -ti:3000,3001 | xargs kill

# View Prisma Studio (database GUI)
cd services/users && pnpm db:studio
```
