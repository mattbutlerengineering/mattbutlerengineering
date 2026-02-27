# Ideal Stack — February 2026

Default technology choices for new APIs, frontends, and infrastructure in the mattbutlerengineering monorepo. Individual projects can deviate — see [Deviation Policy](#deviation-policy).

## Philosophy

1. **Free tiers first.** Every tool starts at $0. Upgrade only when a specific trigger is hit.
2. **TypeScript everywhere.** One language across frontend, backend, IaC, and tooling.
3. **Boring where it counts.** Prefer battle-tested tools over novel ones; save innovation budget for the product.
4. **Migrate incrementally.** The current stack works. Adopt recommendations as natural opportunities arise (new service, rewrite, pain point).

## Stack at a Glance

| Layer | Tool | Free Tier | Upgrade Trigger | Eval |
|-------|------|-----------|-----------------|------|
| Language & Runtime | TypeScript + Node.js | $0 | — | — |
| Frontend (marketing) | Astro + React islands | $0 | — | [eval](evaluations/2026-02-26-frontend-meta-frameworks.md) |
| Frontend (apps) | React + Vite | $0 | — | [eval](evaluations/2026-02-26-frontend-meta-frameworks.md) |
| Backend API | Fastify | $0 | — | — |
| Database | Supabase (Postgres) | 500 MB, 50K MAU | >500 MB or need backups | [eval](evaluations/2026-02-26-database-providers.md) |
| ORM | Prisma | $0 | — | [eval](evaluations/2026-02-26-database-providers.md) |
| Authentication | Auth0 | 25K MAU | >25K MAU | [eval](evaluations/2026-02-26-auth-providers.md) |
| Hosting | Railway | $5 trial credit | Trial ends or multiple services | [eval](evaluations/2026-02-26-hosting-providers.md) |
| IaC | Pulumi (TypeScript) | 200 resources | >200 resources | [eval](evaluations/2026-02-26-iac-tooling.md) |
| CI/CD | GitHub Actions | 2,000 min/mo | >2,000 min/mo | [eval](evaluations/2026-02-26-ci-cd-providers.md) |
| Monorepo | pnpm + Turborepo + Changesets | $0 | — | [eval](evaluations/2026-02-26-monorepo-tooling.md) |
| Email | Resend | 3K emails/mo | >3K emails/mo | [eval](evaluations/2026-02-26-email-sms-providers.md) |
| Payments | Stripe | 2.9% + $0.30/txn | — | [eval](evaluations/2026-02-26-payment-processing.md) |
| Background Jobs | BullMQ + Upstash Redis | 10K req/day | >10K req/day | [eval](evaluations/2026-02-26-background-jobs.md) |
| Caching | Upstash Redis | 10K req/day (shared) | >10K req/day | [eval](evaluations/2026-02-26-caching.md) |
| Object Storage | Cloudflare R2 | 10 GB, $0 egress | >10 GB stored | [eval](evaluations/2026-02-26-object-storage.md) |
| Real-Time | SSE (native) | $0 | Need bidirectional → WebSocket | [eval](evaluations/2026-02-26-real-time.md) |
| Analytics & Flags | PostHog | 1M events/mo | >1M events/mo | [eval](evaluations/2026-02-26-analytics-feature-flags.md) |
| Observability | Sentry | 5K errors/mo | >5K errors/mo | [eval](evaluations/2026-02-26-observability-monitoring.md) |
| E2E Testing | Playwright | $0 (OSS) | — | [eval](evaluations/2026-02-26-e2e-testing.md) |
| Unit/Integration Testing | Vitest | $0 (OSS) | — | — |
| DNS & CDN | Cloudflare | Unlimited DNS, free CDN | — | — |

## Stack Layers

### Language & Runtime

**TypeScript + Node.js (LTS)**

Already in use across the entire monorepo. No evaluation needed — this is a foundational constraint, not a choice.

- Strict mode enabled, ES2022 target
- ES modules throughout (`"type": "module"`)
- Single language for frontend, backend, IaC, and tooling

### Frontend

**Astro** for the public marketing site; **React + Vite** for authenticated apps (dashboard, rialto-web).

- **Why Astro:** Zero JS by default, content collections for blog/docs, React islands for interactive sections. Perfect for SEO-critical pages.
- **Why React + Vite stays for apps:** SPAs are the right architecture for authenticated, interactive dashboards. No SSR complexity needed.
- **Free tier:** $0 — static builds, no runtime cost.
- **Upgrade trigger:** None expected.

→ [Full evaluation](evaluations/2026-02-26-frontend-meta-frameworks.md)

### Backend API

**Fastify**

Already in use for the users service. Fast, schema-first, great TypeScript support.

- JSON schema validation built in
- Auto-generated OpenAPI docs at `/docs`
- Plugin architecture for clean separation of concerns

### Database & ORM

**Supabase (managed Postgres) + Prisma**

- **Why Supabase:** Auto-generated REST API, built-in auth (unused but available), connection pooling via Supavisor, and a generous free tier.
- **Why Prisma stays:** Type-safe queries, declarative migrations, great DX. Already integrated.
- **Free tier:** 500 MB storage, 50K MAU, 2 projects.
- **Upgrade trigger:** >500 MB stored data or need for point-in-time recovery ($25/mo Pro plan).

→ [Full evaluation](evaluations/2026-02-26-database-providers.md)

### Authentication

**Auth0**

- **Why:** Already integrated via Pulumi IaC. 25K MAU free, 70+ social providers, full OIDC compliance, enterprise-grade security.
- **Free tier:** 25K MAU, unlimited social connections.
- **Upgrade trigger:** >25K MAU or need custom domains ($23/mo Essentials plan).

→ [Full evaluation](evaluations/2026-02-26-auth-providers.md)

### Hosting & Deployment

**Railway**

- **Why:** Pay-per-use pricing (scale to zero), monorepo detection, Dockerfile or Nixpacks builds, preview environments.
- **Free tier:** $5 trial credit, 512 MB RAM, 1 vCPU.
- **Upgrade trigger:** Trial credit exhausted or need for multiple persistent services (~$10–20/mo Pro plan).
- **Migration note:** Current stack uses DigitalOcean. Migrate when starting a new service or when cost optimization matters.

→ [Full evaluation](evaluations/2026-02-26-hosting-providers.md)

### Infrastructure as Code

**Pulumi (TypeScript)**

- **Why:** Already in use. Native TypeScript — no DSL to learn. Full programming language for loops, conditionals, abstractions.
- **Free tier:** 200 resources on Pulumi Cloud, Apache 2.0 engine.
- **Upgrade trigger:** >200 managed resources ($50/mo Team plan).

→ [Full evaluation](evaluations/2026-02-26-iac-tooling.md)

### CI/CD

**GitHub Actions**

- **Why:** Native GitHub integration, massive marketplace, matrix builds, OIDC for cloud auth. Enable Turborepo remote cache for 30–50% speedup.
- **Free tier:** 2,000 min/mo for private repos, unlimited for public.
- **Upgrade trigger:** >2,000 min/mo ($4/user/mo Team plan).

→ [Full evaluation](evaluations/2026-02-26-ci-cd-providers.md)

### Monorepo & Build

**pnpm + Turborepo + Changesets**

- **Why:** Already in use. pnpm for fast installs and strict dependency isolation. Turborepo for build orchestration and caching. Changesets for versioning shared packages.
- **Free tier:** $0 — all open source. Vercel Remote Cache is free.
- **Upgrade trigger:** None expected.
- **Quick wins:** Enable Turborepo Remote Cache (10 min setup, free, 30–50% CI speedup). Upgrade to Turborepo v2.8 for Boundaries.

→ [Full evaluation](evaluations/2026-02-26-monorepo-tooling.md)

### Email

**Resend**

- **Why:** React Email for templating (JSX), TypeScript SDK, simple API, great deliverability.
- **Free tier:** 3,000 emails/mo, 1 custom domain.
- **Upgrade trigger:** >3,000 emails/mo ($20/mo Pro plan).

→ [Full evaluation](evaluations/2026-02-26-email-sms-providers.md)

### Payments

**Stripe**

- **Why:** Industry standard. PaymentIntent API for deposits, Stripe Connect for marketplace flows, excellent docs and TypeScript SDK.
- **Free tier:** No monthly fee — 2.9% + $0.30 per transaction.
- **Upgrade trigger:** Volume discounts available at scale; negotiate at >$80K/mo processing.

→ [Full evaluation](evaluations/2026-02-26-payment-processing.md)

### Background Jobs & Caching

**BullMQ + Upstash Redis** (shared Redis instance)

- **Why BullMQ:** MIT-licensed, delayed/recurring jobs, priority queues, dashboard via Bull Board. Runs on the same Redis as caching.
- **Why Upstash Redis:** Serverless, per-request pricing, REST + native Redis protocol, BullMQ-compatible.
- **Free tier:** 10K commands/day, 256 MB storage.
- **Upgrade trigger:** >10K commands/day (pay-as-you-go: $0.2 per 100K commands).

→ [Background jobs evaluation](evaluations/2026-02-26-background-jobs.md) · [Caching evaluation](evaluations/2026-02-26-caching.md)

### Object Storage

**Cloudflare R2**

- **Why:** S3-compatible API, zero egress fees (this is the killer feature), Workers integration for image transforms.
- **Free tier:** 10 GB storage, 10M Class B reads/mo, 1M Class A writes/mo.
- **Upgrade trigger:** >10 GB stored ($0.015/GB/mo beyond free tier).

→ [Full evaluation](evaluations/2026-02-26-object-storage.md)

### Real-Time

**Server-Sent Events (SSE)**

- **Why:** Zero dependencies, native browser API, built into Fastify. Perfect for server→client push (notifications, live updates).
- **Free tier:** $0 — no external service needed.
- **Upgrade trigger:** Need bidirectional communication → add WebSocket (ws library, also $0).

→ [Full evaluation](evaluations/2026-02-26-real-time.md)

### Analytics & Feature Flags

**PostHog**

- **Why:** Single tool for product analytics, session replay, feature flags, and A/B testing. Self-hostable if needed. TypeScript SDK.
- **Free tier:** 1M events/mo, 5K session recordings, unlimited feature flags.
- **Upgrade trigger:** >1M events/mo (pay-as-you-go beyond free tier).

→ [Full evaluation](evaluations/2026-02-26-analytics-feature-flags.md)

### Observability

**Sentry**

- **Why:** Best-in-class error tracking with source maps, session replay, performance monitoring, and cron monitoring. First-party Fastify + React SDKs.
- **Free tier:** 5K errors/mo, 10K performance spans, 50 session replays.
- **Upgrade trigger:** >5K errors/mo ($29/mo Team plan).

→ [Full evaluation](evaluations/2026-02-26-observability-monitoring.md)

### Testing

**Vitest** for unit/integration tests; **Playwright** for E2E.

- **Why Vitest:** Already in use. Native ESM, fast watch mode, Vite-powered, compatible with Jest API.
- **Why Playwright:** Three browsers (Chromium, Firefox, WebKit), auto-waiting, codegen, trace viewer. Open source.
- **Free tier:** $0 — both are OSS.
- **Upgrade trigger:** None expected.

→ [E2E evaluation](evaluations/2026-02-26-e2e-testing.md)

### DNS & CDN

**Cloudflare**

No evaluation needed — Cloudflare is best-in-class at the free tier. Unlimited DNS queries, global CDN, DDoS protection, SSL.

## Cost Summary

| Stage | Monthly Cost | What Changes |
|-------|-------------|--------------|
| **Launch** | ~$0 | Everything on free tiers |
| **Growing** (hundreds of users) | ~$25–50 | Database Pro ($25), Railway Pro (~$10–20) |
| **Scaling** (thousands of users) | ~$100–200 | Add Sentry Team ($29), Resend Pro ($20), Upstash pay-as-you-go |

Stripe is excluded from the table — it's a percentage of revenue, not a fixed cost.

## Deviation Policy

This document describes **defaults**, not mandates. Deviate when:

1. **A specific project has different constraints.** A high-throughput event pipeline might need Kafka instead of BullMQ.
2. **You've evaluated the alternative.** Write a brief ADR or add to `docs/evaluations/` explaining the choice.
3. **The cost math changes.** If a free tier is removed or a better option emerges, update this document.

When deviating, document the reason in the project's README or a linked ADR.

## Evaluation Index

All evaluations are in [`docs/evaluations/`](evaluations/):

| # | Evaluation | File |
|---|-----------|------|
| 1 | Database providers | [2026-02-26-database-providers.md](evaluations/2026-02-26-database-providers.md) |
| 2 | Hosting/PaaS providers | [2026-02-26-hosting-providers.md](evaluations/2026-02-26-hosting-providers.md) |
| 3 | Auth providers | [2026-02-26-auth-providers.md](evaluations/2026-02-26-auth-providers.md) |
| 4 | Observability/monitoring | [2026-02-26-observability-monitoring.md](evaluations/2026-02-26-observability-monitoring.md) |
| 5 | CI/CD providers | [2026-02-26-ci-cd-providers.md](evaluations/2026-02-26-ci-cd-providers.md) |
| 6 | Frontend meta-frameworks | [2026-02-26-frontend-meta-frameworks.md](evaluations/2026-02-26-frontend-meta-frameworks.md) |
| 7 | IaC tooling | [2026-02-26-iac-tooling.md](evaluations/2026-02-26-iac-tooling.md) |
| 8 | Email/SMS providers | [2026-02-26-email-sms-providers.md](evaluations/2026-02-26-email-sms-providers.md) |
| 9 | Monorepo tooling | [2026-02-26-monorepo-tooling.md](evaluations/2026-02-26-monorepo-tooling.md) |
| 10 | Background jobs | [2026-02-26-background-jobs.md](evaluations/2026-02-26-background-jobs.md) |
| 11 | Payment processing | [2026-02-26-payment-processing.md](evaluations/2026-02-26-payment-processing.md) |
| 12 | Object storage | [2026-02-26-object-storage.md](evaluations/2026-02-26-object-storage.md) |
| 13 | Caching | [2026-02-26-caching.md](evaluations/2026-02-26-caching.md) |
| 14 | Real-time updates | [2026-02-26-real-time.md](evaluations/2026-02-26-real-time.md) |
| 15 | Analytics & feature flags | [2026-02-26-analytics-feature-flags.md](evaluations/2026-02-26-analytics-feature-flags.md) |
| 16 | E2E testing | [2026-02-26-e2e-testing.md](evaluations/2026-02-26-e2e-testing.md) |
