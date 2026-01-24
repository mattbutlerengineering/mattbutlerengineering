# Next Steps

**Last updated:** 2026-01-23

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

### 1. Auth0 Setup (Required for auth to work)
- [ ] Create Auth0 tenant at https://auth0.com
- [ ] Create Application (Single Page Application type)
- [ ] Configure allowed callback URLs:
  - `http://localhost:3000/callback` (dev)
  - `http://localhost:3002/dashboard/callback` (dev dashboard)
  - `https://mattbutlerengineering.com/callback` (prod)
  - `https://mattbutlerengineering.com/dashboard/callback` (prod)
- [ ] Configure allowed logout URLs (same origins)
- [ ] Create API in Auth0 dashboard with identifier (audience)
- [ ] Copy credentials to `.env` files:
  ```
  AUTH_AUTHORITY=https://your-tenant.auth0.com
  AUTH_CLIENT_ID=your_client_id
  AUTH_AUDIENCE=https://api.mattbutlerengineering.com
  ```

### 2. Domain Setup (Cloudflare)
- [ ] Purchase/transfer domain on Cloudflare
- [ ] Configure DNS records (once hosting is set up)
- [ ] Enable SSL/TLS (automatic with Cloudflare)

### 3. Hosting Setup
Options to evaluate:
- **Railway** - easy Docker deploys, managed Postgres
- **Fly.io** - Docker-based, global edge
- **DigitalOcean App Platform** - simple, predictable pricing
- **Self-hosted VPS** - most control, use docker-compose.prod.yml

Tasks:
- [ ] Choose hosting provider
- [ ] Set up production database (managed Postgres recommended)
- [ ] Configure environment variables in hosting
- [ ] Deploy services
- [ ] Configure Cloudflare DNS to point to hosting

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
| Docker configs | `infrastructure/` |
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
