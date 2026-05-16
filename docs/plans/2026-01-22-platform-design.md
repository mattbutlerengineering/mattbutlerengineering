# mattbutlerengineering Platform Design

**Date:** 2026-01-22
**Status:** Implementation Complete

---

## Overview

A monorepo platform for hosting multiple full-stack applications under a single domain (`mattbutlerengineering.com`). Features shared authentication, component libraries, and infrastructure with support for multiple environments.

---

## Tech Stack

| Layer         | Technology                              |
| ------------- | --------------------------------------- |
| Monorepo      | Turborepo + pnpm                        |
| Frontend      | React + shadcn/ui + Tailwind CSS        |
| Backend       | Fastify (default, flexible per service) |
| Database      | PostgreSQL + Prisma                     |
| Auth          | Auth0 (OIDC, portable to Keycloak)      |
| API Spec      | OpenAPI/Swagger                         |
| Testing       | Vitest                                  |
| CLI           | Commander.js                            |
| Reverse Proxy | Traefik                                 |
| Containers    | Docker + Docker Compose                 |
| CI/CD         | GitHub Actions                          |
| Domain/CDN    | Cloudflare                              |
| Hosting       | TBD (Docker-first design)               |

---

## Repository Structure

```
mattbutlerengineering/
├── apps/
│   ├── web/                    # Marketing/landing site
│   ├── dashboard/              # Authenticated app
│   └── docs/                   # Documentation site
├── services/
│   ├── users/                  # User service (Fastify)
│   └── [future-services]/      # Additional microservices
├── packages/
│   ├── ui/                     # Shared React components (shadcn/ui)
│   ├── shared-layout/          # Navigation, header, footer
│   ├── api-client/             # Generated from OpenAPI specs
│   ├── auth/                   # Auth utilities (OIDC, middleware)
│   ├── config/                 # Shared TS, ESLint, Prettier configs
│   └── types/                  # Shared TypeScript types
├── tools/
│   └── cli/                    # Commander.js CLI tool
├── infrastructure/
│   ├── docker/                 # Dockerfiles per service
│   ├── docker-compose.yml      # Base compose
│   ├── docker-compose.dev.yml  # Dev overrides
│   ├── docker-compose.prod.yml # Prod overrides
│   └── traefik/                # Traefik configuration
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions
```

---

## URL & Routing Strategy

### Environments (Subdomains)

- `dev.mattbutlerengineering.com` → Development
- `staging.mattbutlerengineering.com` → Staging
- `mattbutlerengineering.com` → Production

### Applications (Paths)

- `/` → Landing/marketing site (apps/marketing)
- `/hospitality` → Hospitality app (apps/hospitality)
- `/docs` → Documentation (apps/docs)

### APIs (Versioned Paths)

- `/api/v1/users` → Users service
- `/api/v1/[service]` → Future services

### Routing Flow

```
*.mattbutlerengineering.com
        │
        ▼
    Traefik (reverse proxy)
        │
        ├── /api/v1/*  → Backend services (by path prefix)
        └── /*         → Frontend apps (by path prefix)
```

---

## Authentication Architecture

### Flow

```
                    ┌─────────────┐
                    │   Auth0     │
                    │  (OIDC IDP) │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │  Frontend │    │  Backend  │    │    CLI    │
    │   Apps    │    │  Services │    │   Tool    │
    └───────────┘    └───────────┘    └───────────┘
```

### Implementation

- **Frontend:** `react-oidc-context` for OIDC client
- **Backend:** JWT validation middleware (shared in `packages/auth`)
- **CLI:** Device authorization flow with local token storage

### Design Principles

- Use standard OIDC libraries (not Auth0-specific SDKs)
- Store auth config in environment variables
- Enables migration to Keycloak if needed

### Future Options

- MFA (TOTP, push notifications)
- Passkeys/biometrics
- All configurable in Auth0 dashboard

---

## API Design

### Service Structure

```
services/users/
├── src/
│   ├── index.ts           # Fastify app setup
│   ├── routes/
│   │   ├── users.ts       # Route handlers
│   │   └── health.ts      # Health check endpoint
│   ├── schemas/           # Zod/JSON schemas
│   └── services/          # Business logic
├── openapi.yaml           # OpenAPI spec (source of truth)
├── Dockerfile
└── package.json
```

### OpenAPI Workflow

1. Define API in `openapi.yaml` (design-first)
2. Generate TypeScript types from spec
3. Fastify validates requests against schema
4. Generate API client for frontend/CLI
5. Swagger UI served at `/api/v1/[service]/docs`

### Versioning

- URL path versioning: `/api/v1/*`
- Major version in path, minor/patch changes backwards compatible

---

## Development Experience

### Local Development Options

**Single app development (fastest):**

```bash
cd apps/hospitality
pnpm dev              # Vite dev server with hot reload
```

**With database dependency:**

```bash
docker compose up postgres -d    # Start just postgres
cd services/users
pnpm dev                         # Run service natively
```

**Full stack:**

```bash
pnpm dev              # Turborepo runs all apps/services
# OR
docker compose up     # Everything in containers
```

### API Proxying

- Vite proxy in dev: `/api/*` → `http://localhost:3000`
- Production: Same-origin via Traefik
- Code uses relative URLs (`/api/v1/users`)

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
on: [push, pull_request]

jobs:
  lint-and-test:
    steps:
      - Checkout, setup pnpm + Node
      - pnpm install
      - pnpm lint
      - pnpm typecheck
      - pnpm test
      # Turborepo caches results

  build:
    needs: lint-and-test
    steps:
      - Build all apps/services
      - pnpm test
      # Turborepo caches results

  build:
    needs: lint-and-test
    steps:
      - Build all apps/services
      - Build Docker images
      - Push to GitHub Container Registry

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    # Deploy to staging.mattbutlerengineering.com

  deploy-prod:
    needs: build
    if: github.ref == 'refs/heads/main'
    # Deploy to mattbutlerengineering.com
```

### Deployment Method

- SSH to server + `docker compose pull && docker compose up -d`
- Images tagged with commit SHA + `latest`
- Rollback: pin to previous image tag

### Secrets Management

- CI secrets: GitHub Secrets
- Runtime secrets: Server `.env` files (gitignored)
- `.env.example` committed with placeholder values

---

## Design System

### Foundation

- **Base:** shadcn/ui (Radix primitives + Tailwind)
- **Tokens:** CSS custom properties for theming

### Theming

```css
:root {
  --color-primary: ...;
  --color-background: ...;
}
[data-theme="dark"] {
  --color-primary: ...;
  --color-background: ...;
}
```

### Accessibility

- Radix primitives handle keyboard navigation, focus management, ARIA
- Color contrast compliance (WCAG AA minimum)
- Screen reader support built-in

---

## Included from Day One

| Item                | Implementation                                       |
| ------------------- | ---------------------------------------------------- |
| Database backups    | Cron job with pg_dump                                |
| Dependency updates  | Dependabot enabled                                   |
| Health checks       | `/health` endpoint on each service                   |
| WAF/DDoS protection | Cloudflare free tier                                 |
| Accessibility       | Radix primitives + semantic HTML                     |
| Linting/Formatting  | ESLint + Prettier (shared config in packages/config) |

---

## Future Considerations

### Operations (add when needed)

- **Monitoring:** Grafana + Prometheus
- **Logging:** Loki or Papertrail
- **Error tracking:** Sentry
- **Alerting:** Discord webhooks or PagerDuty

### Features (add when needed)

- **Email:** Resend or SendGrid
- **Analytics:** Plausible (privacy-friendly)
- **Payments:** Stripe
- **File storage:** Cloudflare R2 or S3
- **Search:** Meilisearch
- **Caching:** Redis

### Scaling (add when needed)

- **Container orchestration:** Docker Swarm or Kubernetes
- **Message queue:** RabbitMQ or Redis pub/sub
- **Load balancing:** Multiple servers behind Traefik

### Compliance (add when needed)

- **i18n:** Multiple language support
- **GDPR:** Data export/deletion
- **Legal:** Privacy policy, terms of service

---

## Implementation Phases

### Phase 1: Foundation

- [x] Initialize monorepo with Turborepo + pnpm
- [x] Set up shared configs (TypeScript, ESLint, Prettier)
- [x] Create packages/ui with shadcn/ui components
- [x] Create packages/auth with OIDC utilities
- [x] Set up Docker Compose for local development
- [x] Create packages/types for shared TypeScript types

### Phase 2: First App + Service

- [x] Create apps/marketing (landing page)
- [x] Create services/users with Fastify
- [x] Set up PostgreSQL + Prisma
- [ ] Configure Auth0 tenant
- [ ] Implement authentication flow

### Phase 3: Infrastructure

- [x] Configure Traefik routing
- [x] Set up GitHub Actions CI/CD
- [ ] Configure Cloudflare domain + DNS
- [ ] Deploy to staging environment

### Phase 4: Expand

- [x] Create apps/hospitality
- [x] Create packages/shared-layout
- [x] Create tools/cli
- [x] Create packages/api-client

---

## Verification

After implementation, verify:

1. **Local dev works:**
   - `pnpm dev` starts all apps with hot reload
   - Apps accessible at localhost with correct routing

2. **Auth works:**
   - Login flow redirects to Auth0
   - JWT validation in backend services
   - Protected routes require authentication

3. **CI/CD works:**
   - Push triggers lint/test/build
   - Merge to main deploys to production

4. **Routing works:**
   - Subdomains route to correct environments
   - Path-based routing to apps and services

---

## Notes

- Hosting provider decision deferred until ready to deploy
- Auth0 MFA/biometrics configurable later via dashboard
