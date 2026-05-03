# Observability/Monitoring Provider Evaluation — February 2026

## Current State

| Dimension                      | Value                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| **Error tracking**             | None — errors only visible in container stdout logs                                     |
| **APM / performance**          | None — no latency, throughput, or error rate monitoring                                 |
| **Log aggregation**            | None — Fastify pino logger writes to stdout only; logs lost on container restart        |
| **Distributed tracing**        | None — no request correlation across services                                           |
| **Uptime monitoring**          | DigitalOcean health checks only (internal, 10s interval) — no external synthetic checks |
| **Alerting**                   | None — no alerts for errors, latency spikes, or downtime                                |
| **Session replay**             | None — no frontend user session recording                                               |
| **Frontend monitoring**        | None — no React Error Boundaries, no Web Vitals tracking                                |
| **Backend framework**          | Fastify (pino logger, `LOG_LEVEL` env var)                                              |
| **Frontend framework**         | React 19 + Vite (3 apps: web, dashboard, rialto-web)                                    |
| **Database**                   | PostgreSQL (Neon) via Prisma ORM                                                        |
| **Infrastructure**             | DigitalOcean App Platform; Pulumi IaC; Cloudflare DNS                                   |
| **Monthly observability cost** | $0                                                                                      |

### Architecture

```
┌──────────────┐                                        ┌──────────────────┐
│  React SPA   │  No error boundaries                   │  Auth0           │
│  (dashboard) │  No Web Vitals                         │  (OIDC provider) │
│  (web)       │  No session replay                     └──────────────────┘
└──────┬───────┘                                              │
       │ HTTP requests                                        │ JWKS
       ▼                                                      ▼
┌──────────────┐  pino → stdout only                    ┌──────────────────┐
│  Fastify API │  No error tracking                     │  Neon PostgreSQL │
│  (users)     │  No APM / tracing                      │  (database)      │
│  (reserv.)   │  No log aggregation                    └──────────────────┘
└──────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  DigitalOcean App Platform       │
│  Health check: GET /health (10s) │  ← Only monitoring that exists
│  No external uptime checks       │
└──────────────────────────────────┘
```

### Pain Points & Motivations

- **Errors are user-reported** — No automated detection; users discover bugs before developers
- **Logs vanish on restart** — Container stdout logs are ephemeral; no persistent aggregation
- **No performance baseline** — Cannot measure p50/p95/p99 latency, throughput, or error rates
- **No frontend visibility** — Cannot correlate user actions with API errors; no Web Vitals data
- **Blind to downtime** — DigitalOcean's internal health check restarts containers but sends no alerts
- **Architecture docs already planned for Sentry** — `docs/one-man-dev-team/architecture.md` recommends Sentry as primary tool; `docs/NEXT_STEPS.md` lists "Error tracking (Sentry)" as optional enhancement

---

## Evaluation Criteria

| Criterion                               | Why It Matters                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| **Error tracking (frontend + backend)** | Highest priority gap — discover bugs before users report them                |
| **APM / performance monitoring**        | Latency, throughput, error rates — establish baseline and detect regressions |
| **Log aggregation**                     | Persist logs beyond container lifetime; search and correlate                 |
| **Distributed tracing**                 | Follow requests across services (users → reservations → database)            |
| **Uptime monitoring**                   | External synthetic checks — is the site reachable from the internet?         |
| **Alerting**                            | Email, Slack, webhook — get notified when things break                       |
| **Session replay**                      | Watch user sessions to reproduce frontend bugs                               |
| **Free tier generosity**                | Solo developer budget — $0/mo is ideal                                       |
| **Pricing at growth milestones**        | Cost predictability as traffic increases                                     |
| **Fastify integration**                 | Native plugin or OpenTelemetry-based instrumentation                         |
| **React/Vite integration**              | SDK, source maps, Error Boundary support                                     |
| **OpenTelemetry support**               | Vendor-neutral instrumentation reduces lock-in                               |
| **Setup complexity**                    | Time to first value — hours, not days                                        |
| **Self-hosted option**                  | Escape hatch for cost control at scale                                       |
| **Vendor lock-in risk**                 | Proprietary agents vs standard OpenTelemetry                                 |

---

## Provider Classification

| Category                        | Providers                         | Characteristics                                                          |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| **Full-Stack Observability**    | Datadog, New Relic, Grafana Cloud | APM + logs + traces + metrics + alerting in one platform                 |
| **Error-First**                 | Sentry                            | Error tracking as primary focus; performance and replay as complementary |
| **Logs-First**                  | Axiom, BetterStack                | Log ingestion as entry point; traces and metrics added later             |
| **All-in-One Product Platform** | PostHog                           | Analytics + session replay + feature flags + error tracking              |
| **Frontend-First**              | LogRocket                         | Session replay with error tracking; frontend-only                        |
| **Open-Source / Self-Hosted**   | SigNoz, Grafana Cloud             | Full stack, self-hostable, OpenTelemetry-native                          |
| **Uptime-Only**                 | UptimeRobot, BetterStack Uptime   | External synthetic checks; "is it up?" monitoring                        |

---

## Provider Profiles

### 1. Sentry

Error-first observability platform. Best-in-class developer experience for error tracking with stack traces, breadcrumbs, and release health. SDK v8+ rebuilt on OpenTelemetry. Already planned in project architecture docs.

| Criterion                  | Details                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Free tier**              | 5K errors, 10K performance units (spans), 50 session replays, 1 cron monitor, 1 uptime monitor, 5 GB logs, 1 GB attachments/mo; 1 user |
| **Team plan**              | $29/mo (50K errors, 5M spans, unlimited users)                                                                                         |
| **Business plan**          | $89/mo (100K errors, 5M spans, advanced features)                                                                                      |
| **Error tracking**         | Best-in-class: stack traces, breadcrumbs, release tracking, issue grouping, assignment                                                 |
| **APM**                    | Transaction tracing, p50/p95/p99 latency, throughput, Web Vitals                                                                       |
| **Session replay**         | DOM recording linked to errors; network requests, console logs                                                                         |
| **Log aggregation**        | Sentry Logs (GA 2025) — structured log ingestion and search                                                                            |
| **Distributed tracing**    | Full trace waterfall; built on OpenTelemetry                                                                                           |
| **Cron monitoring**        | Monitor scheduled jobs; alert on missed or failed runs                                                                                 |
| **Uptime monitoring**      | Basic HTTP checks (1 free, more on paid)                                                                                               |
| **Fastify integration**    | Native `fastifyIntegration` in `@sentry/node` via `@opentelemetry/instrumentation-fastify`                                             |
| **React/Vite integration** | `@sentry/react` with Error Boundary auto-wrapping; `@sentry/vite-plugin` for source maps                                               |
| **OpenTelemetry**          | SDK v8+ built on OTel; OTLP ingest endpoint for traces and logs                                                                        |
| **Alerting**               | Email, Slack (with resolve/assign actions), PagerDuty, Discord, Teams, webhooks                                                        |
| **Self-hosted**            | Yes — `getsentry/self-hosted` Docker Compose; 4 CPU / 16 GB RAM minimum                                                                |

**Key strength:** Purpose-built for the highest-priority gap (error tracking). Native Fastify + React + Vite integration. Session replay linked to errors eliminates the biggest debugging time sink for a solo developer.

**Key risk:** Free tier is limited (5K errors, 1 user). Log aggregation is newer — not as mature as dedicated log platforms.

---

### 2. New Relic

Full-stack observability platform with the most generous free tier in the market: 100 GB/mo data ingest and 1 full platform user with access to all features, perpetually.

| Criterion                | Details                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free tier**            | 100 GB/mo data ingest, 1 full platform user (all features), unlimited basic users; no credit card                                                             |
| **Standard**             | $99/user/mo for full users (up to 5), $49/user/mo core users, $0.30/GB beyond 100 GB                                                                          |
| **Pro**                  | ~$349/user/mo (annual), custom data pricing                                                                                                                   |
| **Features**             | APM, infrastructure monitoring, logs, distributed tracing, error tracking, browser monitoring, synthetic monitoring, mobile monitoring, serverless monitoring |
| **Fastify integration**  | Node.js agent supports Fastify v3+ (GA); agent v13.0.0+                                                                                                       |
| **React integration**    | `@newrelic/browser-agent`; manual Error Boundary integration via `noticeError()`                                                                              |
| **OpenTelemetry**        | Native OTLP ingest (GA for traces, early access for metrics/logs); endpoint `otlp.nr-data.net:4317`; NRDOT collector                                          |
| **Alerting**             | NRQL-based alert conditions; email, Slack, PagerDuty (two-way sync), ServiceNow, webhooks                                                                     |
| **Log aggregation**      | Full log management with querying, dashboards, alerting                                                                                                       |
| **Distributed tracing**  | Full distributed tracing with service maps                                                                                                                    |
| **Synthetic monitoring** | Scripted browser checks and API tests                                                                                                                         |
| **Self-hosted**          | Not available — SaaS only                                                                                                                                     |

**Key strength:** 100 GB/mo free is extraordinary — more than enough for a small project. Full platform access on free tier (no feature gating). Synthetic monitoring included.

**Key risk:** React/Vite integration is less polished than Sentry (no Vite source map plugin, manual Error Boundary). Error tracking DX inferior to Sentry. Complexity: the platform has 30+ products — overwhelming for a solo developer.

---

### 3. Datadog

Enterprise-grade full-stack observability. Most comprehensive feature set but pricing is per-host + per-product, making it expensive and unpredictable for small projects.

| Criterion                     | Details                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Free tier**                 | 5 hosts, 1-day metric retention, core infrastructure monitoring only                                    |
| **Infrastructure Pro**        | $15/host/mo (annual); 15-month retention; 750+ integrations                                             |
| **Infrastructure Enterprise** | $23/host/mo (annual); ML alerts, live processes                                                         |
| **APM**                       | $31/host/mo (traces, error tracking, code hotspots)                                                     |
| **Log Management**            | $0.10/GB ingest + $1.70/million indexed events (15-day retention)                                       |
| **RUM**                       | $1.50/1K sessions (session replay, error tracking, performance)                                         |
| **Database Monitoring**       | $70/host/mo (PostgreSQL query analysis)                                                                 |
| **Synthetic Monitoring**      | $5/1K API tests, $12/1K browser tests                                                                   |
| **Fastify integration**       | `dd-trace` Node.js library; Fastify auto-instrumentation                                                |
| **React integration**         | RUM SDK; full-featured browser error tracking and performance                                           |
| **OpenTelemetry**             | Accepts OTel data but prefers proprietary `dd-trace` agent; OTel metrics billed as custom metrics ($$$) |
| **Alerting**                  | Monitors, composite alerts, anomaly detection (Watchdog AI); email, Slack, PagerDuty, webhook           |
| **Self-hosted**               | Not available — SaaS only                                                                               |

**Pricing estimate for this project (1 host):** Infrastructure Pro ($15) + APM ($31) + Log Management (~$10 for 100 GB) + RUM ($1.50 for 1K sessions) = **~$58/mo minimum**. Grows rapidly with usage.

**Key strength:** Most comprehensive feature set. Watchdog AI anomaly detection. 750+ integrations. Best-in-class dashboards and visualization.

**Key risk:** Multi-dimensional pricing is notoriously unpredictable. Bills can spike dramatically with traffic. Per-host pricing penalizes containerized architectures. Proprietary agent creates high vendor lock-in. OpenTelemetry metrics treated as expensive custom metrics.

---

### 4. Grafana Cloud

Open-source observability ecosystem (Grafana + Loki + Tempo + Mimir) offered as a managed cloud service. OpenTelemetry-native. Zero vendor lock-in — the entire stack is open-source and can be self-hosted.

| Criterion               | Details                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Free tier**           | 10K metrics series, 50 GB logs, 50 GB traces, 50 GB profiles; 3 users; 14-day retention                              |
| **Pro**                 | $29/mo base; 15K metrics ($8/1K additional), 100 GB logs ($0.50/GB additional), 100 GB traces ($0.50/GB additional)  |
| **Advanced**            | $299/mo; SSO, RBAC, audit logs, 5 users, expanded quotas                                                             |
| **Stack components**    | Grafana (dashboards), Loki (logs), Tempo (traces), Mimir (metrics), Alertmanager, k6 (load testing), Faro (frontend) |
| **Fastify integration** | OpenTelemetry SDK → Grafana Cloud OTLP endpoint; Grafana Alloy collector                                             |
| **React integration**   | Grafana Faro Web SDK for frontend observability and Web Vitals                                                       |
| **OpenTelemetry**       | Fully OTel-native; OTLP endpoint for all signals (traces, metrics, logs)                                             |
| **Alerting**            | Grafana Alerting (unified); email, Slack, PagerDuty, webhook, OpsGenie                                               |
| **Dashboards**          | Best-in-class: Grafana is the industry standard for observability dashboards                                         |
| **Self-hosted**         | Fully open-source stack (Grafana + Loki + Tempo + Mimir); Docker or Kubernetes                                       |
| **Vendor lock-in**      | Lowest of any provider — same stack runs identically self-hosted                                                     |

**Key strength:** Zero vendor lock-in. The entire stack is open-source. If Grafana Cloud pricing becomes untenable, self-host the same tools with zero migration. Free tier (50 GB logs + 50 GB traces) is generous. Industry-standard dashboards.

**Key risk:** Setup complexity — multiple components to understand (Loki, Tempo, Mimir). Error tracking is not a first-class feature (no equivalent to Sentry's issue grouping/assignment). Frontend SDK (Faro) is less mature than Sentry's React integration. Steeper learning curve than purpose-built tools.

---

### 5. Axiom

Modern log analytics platform with the most generous free ingest tier in the market (500 GB/mo). Full observability platform supporting logs, traces, and metrics. Deep Vercel integration.

| Criterion               | Details                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| **Free tier**           | 500 GB/mo data ingest, 25 GB storage, 30-day retention, 500 monitors, up to 1,000 users |
| **Axiom Cloud**         | $25/mo base (1 TB ingest, 100 GB storage included)                                      |
| **Enterprise**          | Custom pricing with BYOB (Bring Your Own Bucket)                                        |
| **Features**            | Logs, traces, metrics; APL query language (Kusto-inspired); dashboards; alerting        |
| **Fastify integration** | `@axiomhq/pino` — native Pino transport (Fastify's built-in logger)                     |
| **React integration**   | `@axiomhq/react` — `useLogger` hook + `<WebVitals />` component                         |
| **OpenTelemetry**       | Native OTLP endpoints for all three signals (traces, logs, metrics)                     |
| **Alerting**            | Email, Slack, PagerDuty, Opsgenie, Discord, Teams, webhook; 500 monitors on free        |
| **Self-hosted**         | Enterprise BYOB only — not generally available                                          |

**Key strength:** 500 GB/mo free ingest is extraordinary. Seamless Fastify integration via Pino transport. React SDK with Web Vitals component. 30-day retention on free tier.

**Key risk:** No error tracking (not Sentry-like issue grouping/assignment). No session replay. APL query language has a learning curve. Not a replacement for error-first tools — best as a log aggregation complement.

---

### 6. BetterStack

Combined uptime monitoring + incident management + log management platform. Formerly Better Uptime + Logtail. Unique value: on-call scheduling with phone/SMS alerts in one product.

| Criterion               | Details                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Free tier**           | 10 uptime monitors (3-min interval), 1 status page, 3 GB logs (3-day retention), Slack + email alerts            |
| **Responder license**   | $29/mo per person (includes unlimited phone call, SMS, push, Slack alerts)                                       |
| **Log ingestion**       | $0.30/GB; 30-day retention included                                                                              |
| **Features**            | Uptime monitoring, incident management, on-call scheduling, log management, traces (OTel), metrics, status pages |
| **Fastify integration** | `@logtail/pino` — Pino transport for log shipping                                                                |
| **React integration**   | `@logtail/browser` for browser logging; Next.js Web Vitals component                                             |
| **OpenTelemetry**       | Native OTLP endpoints for logs, traces, metrics; eBPF collector for auto-instrumentation                         |
| **Alerting**            | Phone calls, SMS, push, email, Slack, Teams, webhooks; on-call rotation and escalation                           |
| **Status pages**        | Public/private, custom domain, free on all plans                                                                 |
| **Self-hosted**         | Not available — SaaS only                                                                                        |

**Key strength:** Only provider combining uptime monitoring + incident management + on-call + observability in one platform. Phone/SMS alerts included. Beautiful status pages for free.

**Key risk:** Modest free log tier (3 GB, 3-day retention). No error tracking (issue grouping). No session replay. Primarily an ops tool — less developer-focused than Sentry or PostHog.

---

### 7. PostHog

All-in-one product platform: analytics, session replay, feature flags, A/B testing, error tracking, surveys, data warehouse. Error tracking reached GA in April 2025.

| Criterion               | Details                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Free tier**           | 1M analytics events, 5K session replays, 1M feature flag requests, 100K error tracking exceptions, 1.5K survey responses/mo |
| **Paid pricing**        | Usage-based: $0.00005/event (analytics), $0.005/recording (replay), $0.00037/exception (errors)                             |
| **Error tracking**      | GA since April 2025; stack traces, source maps, issue triage, linked to session replays                                     |
| **Session replay**      | DOM recording, console logs, network requests; web + mobile                                                                 |
| **Feature flags**       | Boolean and multivariate, local evaluation, percentage rollouts                                                             |
| **Fastify integration** | `posthog-node` SDK; framework-agnostic; `capture()` + `captureException()`                                                  |
| **React integration**   | `@posthog/react` with `<PostHogProvider>`; autocapture enabled by default                                                   |
| **OpenTelemetry**       | Not OTel-native — uses proprietary event-based data model                                                                   |
| **Alerting**            | Email, Slack, webhook; error alerts on issue create/reopen                                                                  |
| **Self-hosted**         | Docker Compose ("Hobby") — MIT licensed; 4 vCPU, 16 GB RAM minimum                                                          |

**Key strength:** Replaces multiple SaaS tools (Mixpanel + Hotjar + LaunchDarkly + basic Sentry). Error tracking natively linked to session replays and feature flags. Generous free tiers per product.

**Key risk:** Error tracking is ~10 months old as GA — lacks Sentry's depth (no distributed tracing, no release health, fewer SDKs). Not OpenTelemetry-native. Jack-of-all-trades risk: each feature is less deep than the best-of-breed alternative. Self-hosted requires significant resources (16 GB RAM).

---

### 8. LogRocket

Frontend-first session replay with error tracking and product analytics. Mentioned in project planning docs as optional session replay tool.

| Criterion               | Details                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Free tier**           | 1,000 sessions/mo, 1-month retention, 3 team members                                            |
| **Team**                | From $69/mo (10K–50K sessions)                                                                  |
| **Professional**        | From $295/mo (10K–1M sessions)                                                                  |
| **Features**            | Session replay, error tracking, performance monitoring, product analytics, heatmaps, Galileo AI |
| **Fastify integration** | **None** — frontend-only tool; no backend SDK                                                   |
| **React integration**   | `logrocket` SDK; records DOM, network requests, console logs, JS exceptions                     |
| **OpenTelemetry**       | Not supported — proprietary recording agent                                                     |
| **Alerting**            | Slack, PagerDuty, email, webhook; AI-powered issue severity analysis                            |
| **Privacy**             | PII masking, SOC2 Type II, GDPR/CCPA compliant; client-side sanitization                        |
| **Script weight**       | 8 KB initial (compressed); async loading; self-limiting resource usage                          |
| **Self-hosted**         | Enterprise tier only                                                                            |

**Key strength:** Best-in-class session replay. Watching the exact user session when an error occurred is invaluable for reproducing bugs. Galileo AI auto-detects rage clicks, dead clicks, and struggle signals.

**Key risk:** **Frontend-only** — cannot track Fastify backend errors. Not a Sentry replacement; complements it. Session-based pricing gets expensive at scale ($69/mo for 10K sessions). No OpenTelemetry support. No backend observability.

---

### 9. SigNoz

Open-source Datadog alternative. OpenTelemetry-native, built on ClickHouse. Y Combinator W21. Provides APM, distributed tracing, logs, metrics, dashboards, and alerting.

| Criterion               | Details                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud Teams**         | $49/mo minimum (includes $49 in usage credits ≈ 163 GB); $0.30/GB logs/traces, $0.10/million metric samples                                        |
| **Cloud Enterprise**    | Custom pricing; SSO, SAML, VPC peering, BYOC                                                                                                       |
| **Self-hosted**         | Free (AGPL v3); Docker Compose or Kubernetes; 4 CPU, 8–16 GB RAM                                                                                   |
| **Features**            | APM (p99, error rates, Apdex), distributed tracing (flamegraphs), log management, metrics, dashboards, alerting, error monitoring, ingestion guard |
| **Fastify integration** | Standard OTel SDK: `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` (includes Fastify, HTTP, Prisma)                        |
| **React integration**   | Standard OTel Web SDK: `@opentelemetry/sdk-trace-web` + fetch instrumentation + Web Vitals                                                         |
| **OpenTelemetry**       | 100% OTel-native — all ingestion via OTLP; no proprietary agents                                                                                   |
| **Alerting**            | Threshold-based on any signal; Slack, PagerDuty, email, webhook, Teams, Opsgenie                                                                   |
| **ClickHouse backend**  | Columnar OLAP database; up to 1000x faster than row-based for analytical queries                                                                   |
| **Self-hosted**         | Docker Compose (small) or Helm chart (production Kubernetes)                                                                                       |
| **GitHub**              | 25K+ stars; CNCF ecosystem                                                                                                                         |

**Key strength:** Zero vendor lock-in — standard OTel instrumentation works with any backend. Full-stack observability at a fraction of Datadog's cost. Self-hosted option eliminates per-GB costs entirely. Covers ~70% of what most teams use in Datadog.

**Key risk:** Cloud minimum is $49/mo (vs $0 for Sentry/New Relic free tiers). No AI anomaly detection. No synthetic monitoring. No session replay. Fewer integrations than Datadog (750+). Self-hosted requires managing ClickHouse (significant ops overhead for solo developer).

---

### 10. UptimeRobot

Dedicated uptime monitoring service. 50 free monitors. Established in 2010 with 2M+ users. Simple, focused, reliable.

| Criterion         | Details                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| **Free tier**     | 50 monitors, 5-minute intervals, 1 status page, email + integrations                                   |
| **Pro Solo**      | $7/mo (10 monitors, 60-second intervals)                                                               |
| **Pro Team**      | $15/mo (50 monitors, 60-second intervals, multiple members)                                            |
| **Pro Business**  | $29/mo (100 monitors, 60-second intervals)                                                             |
| **Monitor types** | HTTP/HTTPS, keyword, ping, port, heartbeat/cron, SSL expiry, domain expiry                             |
| **Alerting**      | Email, SMS (Pro), voice call (Pro), Slack, Teams, Telegram, Discord, PagerDuty, webhook — 16+ channels |
| **Status pages**  | Public branded pages; custom domain (Pro); incident announcements                                      |
| **REST API**      | Full API v3 for programmatic management; 10 req/min (free) to 5K req/min (Pro)                         |
| **Self-hosted**   | Not available — SaaS only                                                                              |

**Important:** As of 2025, the free plan is restricted to personal, non-commercial use. Businesses must use a paid tier.

**Key strength:** 50 free monitors is very generous. Simple setup (add URL, configure alerts, done). Heartbeat monitoring for cron jobs. Status pages build user trust.

**Key risk:** Free tier restricted to personal use (2025 change). No APM, no logs, no tracing — uptime-only. No synthetic multi-step transactions. Limited to "is it up?" checks.

---

## Comparison Table

### Pricing

| Provider          | Free Tier                     | Cost at Hobby Scale                     | Cost at Growth (~500 GB/mo) |
| ----------------- | ----------------------------- | --------------------------------------- | --------------------------- |
| **Sentry**        | 5K errors, 50 replays, 1 user | $0 (free)                               | $29/mo (Team)               |
| **New Relic**     | 100 GB/mo, 1 full user        | $0 (free)                               | $0 (within 100 GB)          |
| **Datadog**       | 5 hosts, 1-day retention      | ~$58/mo (1 host, Pro + APM)             | ~$150+/mo                   |
| **Grafana Cloud** | 50 GB logs + 50 GB traces     | $0 (free)                               | $29/mo (Pro)                |
| **Axiom**         | 500 GB/mo ingest              | $0 (free)                               | $0 (within 500 GB)          |
| **BetterStack**   | 3 GB logs, 10 monitors        | $29/mo (1 responder)                    | ~$150/mo (500 GB logs)      |
| **PostHog**       | 100K exceptions, 5K replays   | $0 (free)                               | Usage-based (~$50/mo)       |
| **LogRocket**     | 1K sessions/mo                | $0 (free)                               | $69/mo (Team 10K)           |
| **SigNoz**        | N/A (cloud starts at $49/mo)  | $49/mo (Cloud) or ~$48/mo (self-hosted) | ~$150/mo (Cloud)            |
| **UptimeRobot**   | 50 monitors (personal use)    | $0 (free) or $7/mo (Pro)                | $7/mo (Pro Solo)            |

### Feature Matrix

| Provider          | Error Tracking | APM/Traces     | Logs         | Uptime       | Replay  | Alerting            | OTel        | Self-Hosted   |
| ----------------- | -------------- | -------------- | ------------ | ------------ | ------- | ------------------- | ----------- | ------------- |
| **Sentry**        | ✅ Best        | ✅ Good        | ✅ New       | ⚠️ Basic     | ✅ Good | ✅ Full             | ✅ Built-on | ✅ Official   |
| **New Relic**     | ✅ Good        | ✅ Full        | ✅ Full      | ✅ Synthetic | ❌ None | ✅ Full             | ✅ OTLP     | ❌ No         |
| **Datadog**       | ✅ Good        | ✅ Best        | ✅ Full      | ✅ Synthetic | ✅ RUM  | ✅ Best             | ⚠️ Partial  | ❌ No         |
| **Grafana Cloud** | ⚠️ Basic       | ✅ Full        | ✅ Full      | ❌ None      | ❌ None | ✅ Full             | ✅ Native   | ✅ Fully OSS  |
| **Axiom**         | ❌ None        | ⚠️ Traces only | ✅ Best free | ❌ None      | ❌ None | ✅ Good             | ✅ Native   | ❌ No         |
| **BetterStack**   | ❌ None        | ⚠️ OTel traces | ✅ Good      | ✅ Core      | ❌ None | ✅ Best (phone/SMS) | ✅ Native   | ❌ No         |
| **PostHog**       | ✅ New (GA)    | ❌ None        | ❌ None      | ❌ None      | ✅ Full | ⚠️ Basic            | ❌ No       | ✅ Docker     |
| **LogRocket**     | ⚠️ Frontend    | ❌ None        | ❌ None      | ❌ None      | ✅ Best | ⚠️ Basic            | ❌ No       | ⚠️ Enterprise |
| **SigNoz**        | ✅ Good        | ✅ Full        | ✅ Full      | ❌ None      | ❌ None | ✅ Good             | ✅ Native   | ✅ Official   |
| **UptimeRobot**   | ❌ None        | ❌ None        | ❌ None      | ✅ Core      | ❌ None | ✅ Good             | ❌ N/A      | ❌ No         |

### Fastify + React Integration

| Provider          | Fastify Support                          | React/Vite Support                        | Integration Quality               |
| ----------------- | ---------------------------------------- | ----------------------------------------- | --------------------------------- |
| **Sentry**        | Native `fastifyIntegration` (OTel-based) | `@sentry/react` + `@sentry/vite-plugin`   | Best — first-party for both       |
| **New Relic**     | Node.js agent (Fastify v3+ GA)           | `@newrelic/browser-agent` (manual)        | Good backend, manual frontend     |
| **Datadog**       | `dd-trace` (proprietary agent)           | RUM SDK (full-featured)                   | Good — but proprietary            |
| **Grafana Cloud** | OTel SDK (standard)                      | Faro Web SDK                              | Good — but Faro is newer          |
| **Axiom**         | `@axiomhq/pino` (Pino transport)         | `@axiomhq/react` (hooks + WebVitals)      | Excellent for Pino-based logging  |
| **BetterStack**   | `@logtail/pino` (Pino transport)         | `@logtail/browser`                        | Good — Pino integration seamless  |
| **PostHog**       | `posthog-node` (generic SDK)             | `@posthog/react` (Provider + autocapture) | Good — no Fastify-specific plugin |
| **LogRocket**     | **None** — frontend only                 | `logrocket` (vanilla JS SDK)              | Frontend only — no backend        |
| **SigNoz**        | OTel SDK (standard, includes Fastify)    | OTel Web SDK (standard)                   | Good — fully standard OTel        |
| **UptimeRobot**   | N/A (external checks)                    | N/A                                       | N/A                               |

---

## Eliminated Providers

### Shutdown

| Provider         | Elimination Reason                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Highlight.io** | **Acquired by LaunchDarkly (April 23, 2025). Service shuts down February 28, 2026** — 2 days from this evaluation. Customers must migrate to LaunchDarkly Observability SDK. No longer a viable standalone option. |

### Excessive Cost for Solo Developer

| Provider      | Elimination Reason                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Datadog**   | Multi-dimensional per-host + per-product pricing starts at ~$58/mo for 1 host (Infrastructure Pro + APM). Bills spike unpredictably with traffic. OTel metrics billed as expensive custom metrics. Enterprise-grade tool with enterprise-grade pricing — overkill for a solo developer. |
| **LogRocket** | Frontend-only — cannot track Fastify backend errors. Would require a second tool (Sentry) for backend. Session-based pricing ($69/mo for 10K sessions). Best as a complement to Sentry, not a primary tool. Recommended only when specific UX debugging needs arise.                    |

### Eliminated on Fit

| Provider              | Elimination Reason                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Elastic/ELK Stack** | Massive operational overhead for self-hosted deployment. Resource-hungry (JVM-based, similar to Keycloak). Enterprise pricing for managed Elastic Cloud. Disproportionate complexity for a solo developer's observability needs. |
| **FullStory**         | Enterprise session replay pricing. No free tier. No error tracking for backend. Pure frontend analytics tool — significant overlap with LogRocket at higher cost.                                                                |
| **Pingdom**           | SolarWinds product. Enterprise pricing ($10+/mo for 10 uptime checks). UptimeRobot offers 50 free monitors — no reason to pay for fewer.                                                                                         |

---

## Recommended Shortlist

### #1 Sentry — Primary Error Tracking (Recommended)

Sentry is the right first tool because error tracking is the highest-priority gap:

1. **Best-in-class error tracking DX** — Stack traces, breadcrumbs, issue grouping, assignment, release health
2. **Native Fastify integration** — `@sentry/node` with `fastifyIntegration` is first-party, OTel-based
3. **Native React + Vite integration** — `@sentry/react` with Error Boundary auto-wrapping; `@sentry/vite-plugin` for source maps
4. **Session replay linked to errors** — Watch the exact user session when a frontend error occurred
5. **Already planned** — `docs/one-man-dev-team/architecture.md` and `docs/NEXT_STEPS.md` both recommend Sentry
6. **OpenTelemetry-based** — SDK v8+ built on OTel; low vendor lock-in
7. **Self-hosted escape hatch** — `getsentry/self-hosted` eliminates per-event costs at scale
8. **Free tier covers early stage** — 5K errors + 50 replays + 10K spans is sufficient for a low-traffic app

**Implementation:** Add `@sentry/node` to Fastify services, `@sentry/react` + `@sentry/vite-plugin` to React apps. One DSN per project. ~2 hours to first value.

### #2 New Relic — Best Full-Stack Free Tier

If broader observability is needed beyond error tracking:

1. **100 GB/mo free** — Most generous free tier of any full-stack platform
2. **All features on free tier** — APM, logs, traces, synthetic monitoring, browser monitoring — no feature gating
3. **Fastify support** — Node.js agent supports Fastify v3+ (GA)
4. **NRQL** — Powerful query language for custom dashboards and alerts
5. **Synthetic monitoring** — Free scripted browser checks and API tests (Sentry doesn't offer this)

**Trade-offs:** React/Vite integration is manual (no Vite source map plugin). Error tracking DX inferior to Sentry (no session replay linking). Platform complexity — 30+ products to navigate.

**When to consider:** When you need infrastructure monitoring, centralized logs, or synthetic monitoring — areas where Sentry has limited or no coverage.

### #3 Grafana Cloud — Open-Source, Vendor-Neutral, Future-Proof

For maximum vendor independence:

1. **Zero vendor lock-in** — Entire stack is open-source (Grafana + Loki + Tempo + Mimir)
2. **Self-hosted identical to cloud** — If pricing becomes untenable, run the same stack yourself with zero migration
3. **Industry-standard dashboards** — Grafana is the gold standard for observability visualization
4. **OpenTelemetry-native** — All instrumentation is standard OTel
5. **Free tier is generous** — 50 GB logs + 50 GB traces covers most small projects

**Trade-offs:** No error tracking (issue grouping/assignment). Frontend SDK (Faro) is less mature. Setup is more complex (multiple components). Steeper learning curve.

**When to consider:** When you want a unified dashboard for all signals (metrics, logs, traces) with complete vendor independence. Pairs well with Sentry for error tracking.

---

## Self-Hosted vs Managed Analysis

| Factor                      | Self-Hosted (SigNoz/Grafana)                           | Managed SaaS (Sentry/New Relic/Grafana Cloud)                     |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| **Monthly cost**            | ~$48–96/mo (DigitalOcean Droplet)                      | $0–49/mo (free tiers)                                             |
| **Cost at scale (1 TB/mo)** | ~$96/mo flat                                           | $150–300/mo (usage-based)                                         |
| **Time cost**               | 2–8 hrs/mo (updates, monitoring, storage management)   | ~0 hrs/mo                                                         |
| **Setup complexity**        | 2–4 hours initial; ongoing maintenance                 | Minutes (add SDK, configure DSN)                                  |
| **Data ownership**          | Full — data stays in your infrastructure               | Vendor-hosted; subject to retention policies                      |
| **Feature completeness**    | Full (SigNoz); requires multiple tools (Grafana stack) | Full (managed service handles everything)                         |
| **Scaling**                 | Manual (resize Droplet, add storage)                   | Automatic (vendor-managed)                                        |
| **Recovery time**           | Hours (manual, restore from backup)                    | Minutes (vendor auto-recovery)                                    |
| **Vendor lock-in**          | None (OTel-native)                                     | Low (Sentry/Grafana are OTel-based); Medium (Datadog proprietary) |

**Verdict:** Managed SaaS is the correct choice at current scale. The free tiers of Sentry + New Relic + UptimeRobot provide comprehensive observability at $0/mo. Self-hosting makes sense only when managed costs exceed ~$100/mo consistently.

---

## OpenTelemetry vs Proprietary Agents

| Aspect                     | OpenTelemetry (OTel)                                    | Proprietary Agent                                           |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| **Providers using OTel**   | Sentry (v8+), Grafana Cloud, SigNoz, Axiom, BetterStack | Datadog (`dd-trace`), New Relic (agent), LogRocket, PostHog |
| **Vendor lock-in**         | Low — change exporter endpoint to switch backends       | High — rewrite instrumentation to switch                    |
| **Instrumentation effort** | One-time setup; works with any OTel-compatible backend  | Per-vendor SDK; must rewrite for each vendor                |
| **Fastify support**        | `@opentelemetry/instrumentation-fastify` — standard     | Varies by vendor                                            |
| **Data format**            | OTLP (standard protocol)                                | Proprietary formats                                         |
| **Community**              | CNCF project; massive ecosystem; vendor-neutral         | Vendor-specific; limited to that ecosystem                  |
| **Recommendation**         | Prefer OTel-based tools for long-term flexibility       | Accept if the DX advantage is significant (e.g., Sentry)    |

**Strategy:** Sentry is the recommended primary tool despite using OTel under the hood (best of both worlds — great DX built on open standards). For log aggregation and tracing backends, prefer OTel-native tools (Grafana Cloud, Axiom, SigNoz) to maintain flexibility.

---

## Decision Matrix

| Scenario                                  | Recommended Path                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Starting from zero (current state)        | **Sentry free tier** — highest-priority gap (error tracking) at $0/mo                            |
| Need log aggregation                      | **Axiom free tier** (500 GB/mo) or **Grafana Cloud free tier** (50 GB)                           |
| Need uptime monitoring                    | **UptimeRobot free tier** (50 monitors) or **BetterStack free tier** (10 monitors + status page) |
| Need full-stack APM + logs + traces       | **New Relic free tier** (100 GB/mo, all features)                                                |
| Need session replay for UX debugging      | **Sentry replay** (50 free/mo) or **PostHog** (5K free/mo) or **LogRocket** (1K free/mo)         |
| Need feature flags + analytics + replay   | **PostHog** (replaces multiple tools)                                                            |
| Sentry free tier exhausted                | **Sentry Team** at $29/mo — or add **New Relic** for broader coverage at $0                      |
| Budget for observability reaches $50+/mo  | **SigNoz Cloud** ($49/mo) for unified APM + logs + traces                                        |
| Budget for observability reaches $100+/mo | Evaluate **self-hosted SigNoz** or **Grafana stack** on DigitalOcean                             |
| Enterprise requirements (SOC2, SSO, SAML) | **Datadog** or **Grafana Cloud Advanced** ($299/mo)                                              |
| Maximum vendor independence               | **Grafana Cloud** (or self-hosted Grafana + Loki + Tempo + Mimir)                                |
| Need phone/SMS alerting + on-call         | **BetterStack** ($29/mo per responder)                                                           |
| Want single tool for everything           | **PostHog** (analytics + replay + flags + errors) — but weaker on backend observability          |

---

## Re-Evaluation Triggers

Watch for these events that should trigger a fresh evaluation:

1. **Sentry free tier limits become restrictive** — Evaluate Team plan ($29/mo) vs adding New Relic free tier for broader coverage
2. **Second service goes to production** (reservations) — Distributed tracing becomes important; evaluate SigNoz or Grafana Cloud for cross-service visibility
3. **User complaints about performance** — Add New Relic synthetic monitoring (free) for proactive performance testing
4. **Need session replay beyond 50/mo** — Evaluate PostHog (5K free) vs Sentry Team (unlimited) vs LogRocket (1K free)
5. **Monthly observability spend exceeds $100** — Evaluate self-hosted SigNoz or Grafana stack on DigitalOcean
6. **PostHog error tracking matures significantly** — Re-evaluate as a single-tool replacement for Sentry + analytics
7. **SigNoz introduces a free cloud tier** — Currently $49/mo minimum; a free tier would make it immediately compelling
8. **UptimeRobot free tier further restricted** — Evaluate BetterStack (10 free monitors + status page) or Checkly as alternatives

---

## Sources

### Sentry

- [Sentry Pricing](https://sentry.io/pricing/)
- [Sentry Fastify Integration](https://docs.sentry.io/platforms/javascript/guides/fastify/)
- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Vite Plugin](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/)
- [Sentry OpenTelemetry](https://docs.sentry.io/platforms/javascript/tracing/instrumentation/opentelemetry/)
- [Sentry Self-Hosted](https://develop.sentry.dev/self-hosted/)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)

### New Relic

- [New Relic Pricing](https://newrelic.com/pricing)
- [New Relic Node.js Agent — Fastify](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/getting-started/compatibility-requirements-nodejs-agent/)
- [New Relic Browser Agent](https://docs.newrelic.com/docs/browser/browser-monitoring/getting-started/introduction-browser-monitoring/)
- [New Relic OpenTelemetry](https://docs.newrelic.com/docs/opentelemetry/get-started/opentelemetry-set-up-your-app/)
- [New Relic NRDOT (OTel Collector Distribution)](https://docs.newrelic.com/docs/opentelemetry/nrdot/)

### Datadog

- [Datadog Pricing](https://www.datadoghq.com/pricing/)
- [Datadog Pricing Gotchas — Better Stack](https://betterstack.com/community/comparisons/datadog-pricing-gotchas/)
- [Datadog Pricing Breakdown — Last9](https://last9.io/blog/datadog-pricing-all-your-questions-answered/)
- [What Companies Actually Pay for Datadog — OneUptime](https://oneuptime.com/blog/post/2026-02-09-we-calculated-what-companies-actually-pay-for-datadog/view)

### Grafana Cloud

- [Grafana Cloud Pricing](https://grafana.com/pricing/)
- [Grafana Cloud Features](https://grafana.com/products/cloud/features/)
- [Grafana Faro Web SDK](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/)
- [Grafana Loki (Logs)](https://grafana.com/oss/loki/)
- [Grafana Tempo (Traces)](https://grafana.com/oss/tempo/)
- [Grafana Mimir (Metrics)](https://grafana.com/oss/mimir/)

### Axiom

- [Axiom Pricing](https://axiom.co/pricing)
- [Axiom Pino Transport](https://axiom.co/docs/guides/pino)
- [Axiom React SDK](https://axiom.co/docs/send-data/react)
- [Axiom OpenTelemetry Node.js](https://axiom.co/docs/guides/opentelemetry-nodejs)
- [Axiom Limits Reference](https://axiom.co/docs/reference/limits)

### BetterStack

- [BetterStack Pricing](https://betterstack.com/pricing)
- [BetterStack Pino Transport](https://betterstack.com/docs/logs/javascript/pino/)
- [BetterStack OpenTelemetry](https://betterstack.com/docs/logs/open-telemetry/)
- [BetterStack Uptime Monitoring](https://betterstack.com/uptime)
- [BetterStack Incident Management](https://betterstack.com/incident-management)

### PostHog

- [PostHog Pricing](https://posthog.com/pricing)
- [PostHog Error Tracking](https://posthog.com/docs/error-tracking)
- [PostHog Node.js SDK](https://posthog.com/docs/libraries/node)
- [PostHog React SDK](https://posthog.com/docs/libraries/react)
- [PostHog Self-Hosting](https://posthog.com/docs/self-host)
- [PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry)

### LogRocket

- [LogRocket Pricing](https://logrocket.com/pricing)
- [LogRocket Session Replay](https://docs.logrocket.com/docs/session-replay)
- [LogRocket Privacy & GDPR](https://docs.logrocket.com/docs/gdpr)
- [LogRocket Backend Error Reproduction](https://docs.logrocket.com/docs/backend-logging-and-error-reporting)
- [Sentry vs LogRocket — TrackJS](https://trackjs.com/compare/logrocket-vs-sentry/)

### SigNoz

- [SigNoz Pricing](https://signoz.io/pricing/)
- [SigNoz Cloud Teams $49/mo Announcement](https://signoz.io/blog/cloud-teams-plan-now-at-49usd/)
- [SigNoz Node.js OTel Instrumentation](https://signoz.io/docs/instrumentation/javascript/opentelemetry-nodejs/)
- [SigNoz React OTel Instrumentation](https://signoz.io/docs/instrumentation/opentelemetry-reactjs/)
- [SigNoz Docker Installation](https://signoz.io/docs/install/docker/)
- [SigNoz vs Datadog](https://signoz.io/product-comparison/signoz-vs-datadog/)
- [SigNoz GitHub](https://github.com/SigNoz/signoz)

### UptimeRobot

- [UptimeRobot Pricing](https://uptimerobot.com/pricing/)
- [UptimeRobot Features](https://uptimerobot.com/)
- [UptimeRobot REST API v3](https://uptimerobot.com/api/v3/)
- [UptimeRobot Heartbeat/Cron Monitoring](https://uptimerobot.com/cron-job-monitoring/)

### Highlight.io (Eliminated)

- [Highlight.io — Joining LaunchDarkly](https://www.highlight.io/blog/joining-launchdarkly)
- [LaunchDarkly Acquires Highlight — GlobeNewsWire](https://www.globenewswire.com/news-release/2025/04/23/3066295/0/en/LaunchDarkly-Acquires-Highlight-to-Advance-the-Future-of-Guarded-Software-Releases.html)
- [Highlight.io Migration Guide](https://nodejs.highlight.io/blog/launchdarkly-migration)

### Comparisons

- [Datadog Pricing Explained — SigNoz](https://signoz.io/blog/datadog-pricing/)
- [Open Source Datadog Alternatives — SigNoz](https://signoz.io/comparisons/open-source-datadog-alternatives/)
- [Observability Tools Pricing — Uptrace](https://uptrace.dev/comparisons/observability-tools-pricing)
