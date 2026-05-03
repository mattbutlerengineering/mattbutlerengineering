# Database Provider Evaluation — February 2026

## Current State

| Dimension              | Value                                          |
| ---------------------- | ---------------------------------------------- |
| **Database**           | Neon (PostgreSQL Serverless, free tier)        |
| **ORM**                | Prisma 6.0                                     |
| **Backend**            | Fastify                                        |
| **Frontend**           | React                                          |
| **Auth**               | Auth0                                          |
| **Hosting**            | DigitalOcean App Platform                      |
| **IaC**                | Pulumi (TypeScript)                            |
| **Monthly infra cost** | ~$5                                            |
| **Services**           | 2 (users, reservations)                        |
| **Tables**             | 7                                              |
| **Local dev DB**       | Docker PostgreSQL 16-alpine                    |
| **CI DB**              | GitHub Actions PostgreSQL 15 service container |

### Pain Points & Motivations

- Free tier limits may become a constraint as the project grows
- No auto-generated REST/GraphQL API — all CRUD routes are hand-written in Fastify
- No OpenAPI spec generation from the database schema
- Cost planning for 1 GB / 10 GB / 100 GB data tiers is unclear
- Openness to replacing the full stack if a better fit exists

---

## Evaluation Criteria

| Criterion                                          | Why It Matters                           |
| -------------------------------------------------- | ---------------------------------------- |
| **Free/paid tier pricing** (1 GB / 10 GB / 100 GB) | Budget planning as data grows            |
| **Auto-generated APIs** (REST/GraphQL)             | Eliminate hand-written CRUD routes       |
| **OpenAPI spec / schema-first workflow**           | Type-safe clients, Swagger docs          |
| **Branching / preview environments**               | PR-based isolated databases              |
| **Connection model** (serverless-friendly)         | Scale-to-zero, no idle cost              |
| **Auth integration**                               | Could consolidate or replace Auth0       |
| **Realtime capabilities**                          | Future features (live updates, presence) |
| **Edge / global distribution**                     | Low-latency reads worldwide              |
| **Migration friction** from current stack          | Effort and risk to switch                |
| **ORM / client library**                           | Prisma compatibility, DX                 |
| **Ecosystem maturity**                             | Community size, docs, battle-testing     |

---

## Provider Profiles

### 1. Neon (Current Provider)

Serverless PostgreSQL with separated compute and storage. Acquired by Databricks in May 2025 for ~$1B; now operating under Databricks' Lakebase umbrella with continued independent operation.

| Criterion              | Details                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| **Free tier**          | 100 CU-hours/month, 0.5 GB storage, 10 branches, 5-min scale-to-zero   |
| **Paid (1 GB)**        | ~$5–10/mo (Launch plan: $0.106/CU-hour, $0.35/GB-month)                |
| **Paid (10 GB)**       | ~$8–15/mo                                                              |
| **Paid (100 GB)**      | ~$35–50/mo                                                             |
| **Auto API**           | None — pure database layer                                             |
| **OpenAPI**            | None native                                                            |
| **Branching**          | Instant copy-on-write; 10 branches (Launch) / 25 (Scale)               |
| **Connection**         | Built-in PgBouncer; up to 10,000 concurrent pooled connections         |
| **Auth**               | None — BYO                                                             |
| **Realtime**           | None                                                                   |
| **Edge**               | Single-region per project                                              |
| **Migration friction** | None (already in use)                                                  |
| **ORM**                | Any PostgreSQL-compatible; `@prisma/adapter-neon` officially supported |
| **Maturity**           | High — large community, strong docs, open source                       |

**Key risk:** Databricks is enterprise-focused. Long-term trajectory for small developer plans is uncertain, though pricing improvements post-acquisition are positive.

---

### 2. Supabase

Full Backend-as-a-Service built on standard PostgreSQL. Bundles PostgREST (auto-REST API), GoTrue (auth), Realtime (subscriptions), Storage, and Edge Functions. Positioned as the open-source Firebase alternative.

| Criterion              | Details                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Free tier**          | 500 MB storage, 1 GB file storage, 50,000 MAUs, unlimited API requests; 2 projects max; pauses after 1 week inactivity |
| **Paid (1 GB)**        | $25/mo (Pro baseline; excess storage at $0.125/GB)                                                                     |
| **Paid (10 GB)**       | ~$27/mo                                                                                                                |
| **Paid (100 GB)**      | ~$36/mo                                                                                                                |
| **Auto API**           | PostgREST generates full REST API from schema — zero code, instant updates                                             |
| **OpenAPI**            | Auto-generated OpenAPI 3.0 spec at `/rest/v1/`; `supabase gen types typescript` for TS types                           |
| **Branching**          | Git-integrated; isolated instance per PR; slower than Neon's CoW (uses pg_dump/restore)                                |
| **Connection**         | PgBouncer + Supavisor; Dedicated Pooler on Pro+                                                                        |
| **Auth**               | Built-in GoTrue: JWT, social logins, magic links, MFA, 50k MAU free; Row-Level Security integration                    |
| **Realtime**           | Built-in: Postgres changes, presence, broadcast                                                                        |
| **Edge**               | Single-region DB; Edge Functions run globally                                                                          |
| **Migration friction** | Low–Medium: standard PostgreSQL; Prisma continues to work; can incrementally adopt PostgREST                           |
| **ORM**                | Prisma, Drizzle, or `@supabase/supabase-js` (wraps PostgREST + Auth + Storage + Realtime)                              |
| **Maturity**           | Very high — largest community, extensive docs, thousands of production apps, open source                               |

**Key risk:** $25/mo Pro floor is a jump from $5/mo. Free tier pauses projects after inactivity. Branching is slower than Neon's CoW.

---

### 3. Xata

Serverless data platform for PostgreSQL combining relational database, full-text search (Elasticsearch-backed), and analytics.

| Criterion              | Details                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **Free tier**          | 15 GB storage (generous), shared compute                                                |
| **Paid (1 GB)**        | ~$5–18/mo depending on instance size                                                    |
| **Paid (10 GB)**       | ~$20/mo (compute + storage)                                                             |
| **Paid (100 GB)**      | Scales linearly with dedicated cluster                                                  |
| **Auto API**           | HTTP API + auto-generated TypeScript SDK from schema                                    |
| **OpenAPI**            | Schema-driven; TypeScript types via CLI; less standard than PostgREST                   |
| **Branching**          | First-class Git-like CoW branching with instant creation                                |
| **Connection**         | HTTP API abstracts connections; standard PostgreSQL also available                      |
| **Auth**               | None — BYO                                                                              |
| **Realtime**           | Limited change subscriptions                                                            |
| **Edge**               | US (us-east-1) and EU (eu-central-1) regions                                            |
| **Migration friction** | Medium: Prisma works via PostgreSQL connection; Xata-specific SDK requires code changes |
| **ORM**                | Xata TypeScript SDK + standard PostgreSQL drivers; Prisma/Drizzle compatible            |
| **Maturity**           | Medium — smaller community, good docs, some features still maturing                     |

**Key risk:** Smaller company and ecosystem. Dedicated cluster costs less predictable. Search integration compelling only if you need search.

**Verdict:** Not shortlisted. Generous free tier and strong branching, but smaller ecosystem and less standard API generation than Supabase. Worth monitoring as the platform matures.

---

### 4. CockroachDB (Serverless/Basic)

Distributed SQL database with PostgreSQL wire compatibility. Designed for global distribution, automatic sharding, and 99.99% uptime SLA.

| Criterion              | Details                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| **Free tier**          | $15/month in resource consumption free (50M Request Units + 10 GiB storage) |
| **Paid (1 GB)**        | Near-free (within $15 credit)                                               |
| **Paid (10 GB)**       | ~$5–10/mo depending on query volume                                         |
| **Paid (100 GB)**      | Variable by query load; storage is cheap                                    |
| **Auto API**           | None — pure database                                                        |
| **OpenAPI**            | None                                                                        |
| **Branching**          | No database branching; online schema changes supported                      |
| **Connection**         | PostgreSQL wire protocol; built-in connection pooling                       |
| **Auth**               | None — BYO                                                                  |
| **Realtime**           | None                                                                        |
| **Edge**               | Multi-region (core strength) — but only on Dedicated tier (expensive)       |
| **Migration friction** | Medium: Prisma CockroachDB adapter exists; subtle SQL dialect differences   |
| **ORM**                | Prisma (CockroachDB adapter), Drizzle, TypeORM, standard pg driver          |
| **Maturity**           | High — enterprise-grade, good docs                                          |

**Key risk:** Not true PostgreSQL — compatible dialect with extension and behavior differences. Multi-region (the main value prop) is expensive. Distributed capabilities are overkill for 2 services and 7 tables.

---

### 5. Turso

Edge database built on libSQL (a fork of SQLite). Distributed reads via global replication. Designed for per-tenant and edge function workloads.

| Criterion              | Details                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| **Free tier**          | 500M rows read/month, 10M rows written/month, 5 GB storage                 |
| **Paid (1 GB)**        | Free tier or $4.99/mo (Developer plan)                                     |
| **Paid (10 GB)**       | ~$10–20/mo                                                                 |
| **Paid (100 GB)**      | Requires storage expansion                                                 |
| **Auto API**           | None                                                                       |
| **OpenAPI**            | None                                                                       |
| **Branching**          | Not traditional — create many databases cheaply instead                    |
| **Connection**         | Edge-native; embedded replicas; HTTP-based client                          |
| **Auth**               | None — BYO                                                                 |
| **Realtime**           | None                                                                       |
| **Edge**               | Core value prop — automatic replication to US, EU, Asia-Pacific via Fly.io |
| **Migration friction** | **Very high** — SQLite, not PostgreSQL; schema and queries may not port    |
| **ORM**                | Prisma (libSQL adapter), Drizzle, `@libsql/client`                         |
| **Maturity**           | Medium — growing rapidly, strong edge community                            |

**Key risk:** SQLite is fundamentally a different engine. PostgreSQL-specific features (data types, extensions, advanced queries) may not work. Not recommended for this use case.

---

### 6. PlanetScale

Originally MySQL-based serverless database with git-like branching. Removed free Hobby plan in March 2024 and pivoted to enterprise horizontal scaling.

| Criterion           | Details                                                     |
| ------------------- | ----------------------------------------------------------- |
| **Free tier**       | **None** (removed 2024)                                     |
| **Database engine** | MySQL only                                                  |
| **Status**          | Enterprise pivot; no longer targeting individual developers |

**Verdict:** Eliminated. MySQL-only + no free tier + enterprise pivot.

---

### 7. Fly.io Managed Postgres

Traditional managed PostgreSQL running on Fly.io's VM infrastructure. Not serverless — you provision and pay for VMs.

| Criterion              | Details                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| **Free tier**          | None for Managed Postgres                                                   |
| **Paid (1 GB)**        | $38+/mo (Basic: Shared-2x CPU, 1 GB RAM)                                    |
| **Paid (10 GB)**       | ~$41/mo ($38 base + $2.80 storage)                                          |
| **Paid (100 GB)**      | ~$66/mo ($38 base + $28 storage)                                            |
| **Auto API**           | None                                                                        |
| **OpenAPI**            | None                                                                        |
| **Branching**          | None — traditional provisioning                                             |
| **Connection**         | Standard PostgreSQL; PgBouncer requires separate setup                      |
| **Auth**               | None                                                                        |
| **Realtime**           | None                                                                        |
| **Edge**               | Fly.io infra is multi-region but Managed Postgres itself is not distributed |
| **Migration friction** | Low (standard pg_dump/restore); but $38/mo floor is 7x current cost         |
| **ORM**                | Any PostgreSQL-compatible                                                   |
| **Maturity**           | Medium                                                                      |

**Verdict:** Strong if consolidating hosting on Fly.io, but the $38/mo floor doesn't fit the "free tier to reasonable paid tier" requirement.

---

### 8. Convex

Reactive backend platform with its own document database, TypeScript-native functions, and real-time synchronization. Open-sourced in February 2025.

| Criterion              | Details                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Free tier**          | 1M monthly function calls; includes realtime, storage, scheduled functions           |
| **Paid (1 GB)**        | $25+/mo (Professional, usage-based)                                                  |
| **Paid (10 GB)**       | $25+/mo (usage-based; storage scales with plan)                                      |
| **Auto API**           | TypeScript function signatures generated from schema (not REST/GraphQL)              |
| **OpenAPI**            | No — proprietary TypeScript schema                                                   |
| **Branching**          | No — environment-based separation                                                    |
| **Connection**         | N/A — Convex handles all connection management internally                            |
| **Auth**               | Built-in with Auth0, Clerk, and others                                               |
| **Realtime**           | Excellent — native reactive model; arguably the best realtime of any provider listed |
| **Edge**               | Functions run globally; database queries from single region                          |
| **Migration friction** | **Very high** — proprietary document DB; requires full application rewrite           |
| **Maturity**           | Medium                                                                               |

**Verdict:** Compelling for greenfield projects. Not a practical migration path without significant rewrite.

---

### 9. Firebase / Firestore

Google's NoSQL BaaS. Firestore is a document database. Firebase Data Connect (launched 2024/2025) adds a PostgreSQL-backed SQL option.

| Criterion              | Details                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| **Free tier**          | 1 GB Firestore storage, 50,000 reads/day, 20,000 writes/day                |
| **Paid (1 GB)**        | Pay-as-you-go (Blaze plan); no hard spending cap — cost spikes can occur   |
| **Paid (10 GB)**       | Pay-as-you-go; scales with reads/writes/storage                            |
| **Auto API**           | Data Connect generates client SDKs from GraphQL schema; Firestore has SDKs |
| **OpenAPI**            | Data Connect uses GraphQL SDL                                              |
| **Branching**          | No database branching                                                      |
| **Connection**         | SDKs abstract connections; serverless-friendly                             |
| **Auth**               | Firebase Auth is best-in-class for Firestore integration                   |
| **Realtime**           | Core feature of Firestore                                                  |
| **Edge**               | Globally distributed                                                       |
| **Migration friction** | **Very high** — NoSQL requires denormalization; Data Connect is immature   |
| **Maturity**           | High (Firestore); Low (Data Connect)                                       |

**Verdict:** NoSQL is wrong for a relational schema. Data Connect is too immature. Cost unpredictability is a real concern.

---

### 10. AWS Aurora Serverless v2

AWS's managed PostgreSQL with serverless auto-scaling. Full AWS ecosystem integration.

| Criterion              | Details                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| **Free tier**          | None (12-month RDS free tier doesn't apply to Aurora)                       |
| **Paid (1 GB)**        | ~$65/mo minimum (0.5 ACU floor at $0.12/ACU-hour + storage)                 |
| **Paid (10 GB)**       | ~$66/mo                                                                     |
| **Paid (100 GB)**      | ~$75/mo                                                                     |
| **Auto API**           | None (RDS Data API exists but is not schema-generated)                      |
| **OpenAPI**            | None                                                                        |
| **Branching**          | No; AWS Blue/Green deployments for schema changes                           |
| **Connection**         | RDS Proxy (separate service, additional cost)                               |
| **Auth**               | AWS IAM-based                                                               |
| **Realtime**           | None                                                                        |
| **Edge**               | Multi-region (27+ regions) but not a distributed database                   |
| **Migration friction** | Low (standard pg_dump/restore); but 13x cost increase with no DX advantages |
| **Maturity**           | Very high — enterprise-grade                                                |

**Verdict:** For production workloads deep in AWS that need enterprise SLAs. Not justified here — 13x more expensive with no compensating features.

---

### 11. Hasura

GraphQL engine that connects to existing PostgreSQL and generates a real-time GraphQL API automatically. Not a database — sits in front of one.

| Criterion                       | Details                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| **Free tier**                   | Limited: small data passthrough quota, 60 req/min                                            |
| **Paid**                        | $1.50/hour per project (~$108/mo) + $0.13/GB passthrough + database costs                    |
| **Total stack (Hasura + Neon)** | ~$113/mo minimum                                                                             |
| **Auto API**                    | Instant GraphQL from schema: full CRUD, relationships, filtering, subscriptions, permissions |
| **OpenAPI**                     | GraphQL SDL; Hasura Remote Joins for REST integration                                        |
| **Branching**                   | Depends on underlying database                                                               |
| **Auth**                        | JWT-based with Auth0 native support                                                          |
| **Realtime**                    | GraphQL subscriptions and event triggers                                                     |
| **Migration friction**          | Low (additive) — keep Neon + Prisma, add Hasura on top                                       |
| **Maturity**                    | High — Hasura v3 (DDN) released 2024–2025                                                    |

**Verdict:** Compelling if GraphQL is strategic and budget allows ~$113/mo total (Hasura alone ~$108/mo + database costs). Not justified for a $5/mo project.

---

### 12. Drizzle ORM

TypeScript ORM — not a database provider. Evaluated as a potential Prisma replacement.

| Criterion             | Drizzle                                | Prisma 6/7                                   |
| --------------------- | -------------------------------------- | -------------------------------------------- |
| **Bundle size**       | ~7.4 KB                                | Larger (improved in Prisma 7)                |
| **Query API**         | SQL-like; flexible for complex queries | Fluent API; gentler learning curve           |
| **Schema**            | Code-first TypeScript                  | `.prisma` schema file                        |
| **Edge runtime**      | Strong support                         | Improved in Prisma 7                         |
| **Cold starts**       | Minimal                                | Eliminated in Prisma 7 (Rust engine removed) |
| **Migration tooling** | Functional                             | More polished (`prisma migrate`)             |
| **IDE DX**            | Good                                   | Stronger auto-completion and type checking   |
| **Visual tools**      | None                                   | Prisma Studio                                |

**Migration effort:** Rewrite schema in TypeScript, regenerate migrations, update all query code. For 7 tables and 2 services — a weekend project but not trivial.

See [ORM Analysis](#orm-analysis-prisma-vs-drizzle) for the full recommendation.

---

### 13. Prisma Postgres

Prisma's own serverless database, launched in production February 2025. Built on unikernels running as microVMs on bare metal via Cloudflare's network.

| Criterion              | Details                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Free tier**          | 100k operations/month, 1 GiB storage, 10 databases                                     |
| **Paid**               | Pay-as-you-go per operation (exact per-op pricing not widely published)                |
| **Auto API**           | None — pure database accessed via Prisma ORM                                           |
| **OpenAPI**            | `schema.prisma` IS the schema; Prisma's type generation is immediate                   |
| **Branching**          | Available; integrates with Prisma toolchain                                            |
| **Connection**         | Zero cold starts; native connection pooling via unikernel model                        |
| **Auth**               | None — BYO                                                                             |
| **Realtime**           | Real-time events (change notifications via Prisma's event system)                      |
| **Edge**               | Global cache via Cloudflare's network                                                  |
| **Migration friction** | Near-zero — connection string change; `schema.prisma` workflow unchanged               |
| **ORM**                | Prisma ORM (locked in for full benefit; standard pg drivers work but lose integration) |
| **Maturity**           | Low — very new, less battle-tested, smaller community                                  |

**Key risk:** Vendor lock-in to Prisma. 100k ops/month free tier is low. Per-operation pricing is unpredictable at higher traffic.

---

## Comparison Table

| Provider        | Free Tier           | Paid (1 GB) | Paid (10 GB) | Auto API         | OpenAPI     | Branching          | Serverless Pool       | Auth             | Realtime      | Edge           | Migration Friction | Maturity   |
| --------------- | ------------------- | ----------- | ------------ | ---------------- | ----------- | ------------------ | --------------------- | ---------------- | ------------- | -------------- | ------------------ | ---------- |
| **Neon**        | 0.5 GB, 100 CU-hrs  | ~$5–10      | ~$8–15       | None             | None        | Instant CoW        | PgBouncer 10k         | No               | No            | No             | None               | High       |
| **Supabase**    | 500 MB, pauses      | $25         | ~$27         | REST (PostgREST) | OpenAPI 3.0 | Git-based (slower) | PgBouncer + Supavisor | GoTrue (50k MAU) | Yes           | Partial        | Low–Med            | Very High  |
| **Xata**        | 15 GB               | ~$5–18      | ~$20         | HTTP + TS SDK    | Partial     | Instant CoW        | HTTP abstracted       | No               | Limited       | 2 regions      | Medium             | Medium     |
| **CockroachDB** | $15 credit, 10 GB   | ~Free       | ~$5–10       | None             | None        | No                 | Built-in              | No               | No            | Dedicated only | Medium             | High       |
| **Turso**       | 5 GB, 500M reads    | $4.99       | $4.99        | None             | None        | Multi-DB model     | HTTP native           | No               | No            | Global edge    | Very High          | Medium     |
| **PlanetScale** | **None**            | N/A         | N/A          | None             | None        | Yes                | Built-in              | No               | No            | No             | N/A (MySQL)        | High       |
| **Fly.io PG**   | None                | $38+        | ~$41         | None             | None        | No                 | Manual                | No               | No            | No             | Low                | Medium     |
| **Convex**      | 1M fn calls         | $25+        | $25+         | TS functions     | Proprietary | Env-based          | N/A                   | Yes              | Excellent     | Partial        | Very High          | Medium     |
| **Firebase**    | 1 GB, 50k reads/day | Pay-as-go   | Pay-as-go    | SDK / GQL        | GQL SDL     | No                 | N/A                   | Excellent        | Yes           | Global         | Very High          | High / Low |
| **Aurora v2**   | None                | ~$65        | ~$66         | None             | None        | No                 | RDS Proxy ($)         | IAM              | No            | Multi-region   | Low                | Very High  |
| **Hasura**      | Very limited        | ~$113 total | ~$113+       | GraphQL          | GQL SDL     | Via DB             | Via DB                | JWT/Auth0        | Subscriptions | Multi-region   | Low (additive)     | High       |
| **Drizzle**     | N/A (ORM)           | N/A         | N/A          | N/A              | N/A         | N/A                | N/A                   | N/A              | N/A           | N/A            | Medium             | High       |
| **Prisma PG**   | 100k ops, 1 GB      | Per-op      | Per-op       | None             | Via Prisma  | Yes                | Zero cold start       | No               | Events        | CF cache       | Near-zero          | Low        |

---

## Eliminated Providers

Nine providers do not fit the current requirements:

| Provider                     | Primary Elimination Reason                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| **Xata**                     | Smaller ecosystem; less standard API generation than Supabase; worth monitoring             |
| **PlanetScale**              | MySQL-only; free tier removed in 2024; enterprise pivot                                     |
| **Turso**                    | SQLite, not PostgreSQL — fundamentally different engine with high migration risk            |
| **Fly.io Postgres**          | No free tier; $38/mo minimum (7x current cost); no value-add features                       |
| **Convex**                   | Proprietary document DB; requires full application rewrite                                  |
| **Firebase/Firestore**       | NoSQL wrong for relational schema; Data Connect too immature; unpredictable costs           |
| **AWS Aurora Serverless v2** | No free tier; ~$65/mo minimum (13x current cost); no DX advantages                          |
| **Hasura Cloud**             | $108+/mo total cost floor; enterprise-focused pricing                                       |
| **CockroachDB**              | Overkill for use case; not true PostgreSQL (dialect differences); multi-region is expensive |

---

## Recommended Shortlist

### #1 Supabase (Recommended)

Supabase addresses the most pain points simultaneously:

1. **Auto-generated REST API with OpenAPI 3.0** — PostgREST generates a complete API from the schema with zero code. `GET /rest/v1/reservations?user_id=eq.123` works immediately.
2. **TypeScript type generation** — `supabase gen types typescript --project-id <id>` generates a full typed schema.
3. **Branching for preview environments** — Git-integrated; isolated database per PR.
4. **Auth consolidation** — Built-in GoTrue could eliminate Auth0 dependency entirely.
5. **Prisma compatibility** — Standard PostgreSQL; existing schema, migrations, and queries work unchanged.
6. **All-in cost** — $25/mo Pro includes auth, realtime, storage, REST API, and Edge Functions.

**Trade-offs:** Free tier pauses after 1 week inactivity. Branching slower than Neon's CoW. PostgREST is REST-only (not GraphQL). RLS requires PostgreSQL policy knowledge.

**Migration path:** `pg_dump` from Neon → restore to Supabase → update `DATABASE_URL` → incrementally adopt PostgREST for CRUD routes. Estimated: 1–2 days for database, 1 week to adopt PostgREST patterns.

### #2 Neon (Stay + Optimize)

Staying deserves serious consideration:

1. **Zero migration cost** — already in use.
2. **Best branching** — copy-on-write is instantaneous and developer-ergonomic.
3. **Prisma integration** — `@prisma/adapter-neon` is first-class.
4. **Cost profile** — $5/mo current; new pricing ($0.35/GB storage, 100 CU-hours free) is competitive.
5. **Fill the API gap** — Add PostgREST as a sidecar service, or continue writing Fastify routes manually.

**When to choose Neon over Supabase:** If auto-generated APIs are "nice to have" rather than essential, and you heavily value instant branching and scale-to-zero economics.

### #3 Prisma Postgres (Experimental)

Worth deeper investigation due to minimal friction:

1. **Near-zero migration** — connection string change; `schema.prisma` workflow unchanged.
2. **Unikernel architecture** — true zero cold starts, native pooling, globally cached reads via Cloudflare.
3. **No arbitrary pause** — unlike Supabase's 1-week inactivity rule (though 100k ops/month is low).
4. **Real-time events** — database change events could replace polling.

**Caveats:** Very new (production since February 2025). Per-operation pricing is unpredictable. 100k ops/month exhausted quickly. No auto-generated API layer.

**Verdict:** Worth a 2-week trial. If per-operation pricing is acceptable, zero-friction migration and zero cold starts are genuinely valuable.

---

## ORM Analysis: Prisma vs Drizzle

With Prisma 7's pure TypeScript rewrite (Rust engine removed, late 2025), the main technical arguments for switching to Drizzle have weakened:

| Argument                   | Status in 2026                    |
| -------------------------- | --------------------------------- |
| Cold start overhead        | Gone in Prisma 7                  |
| Bundle size                | Significantly reduced in Prisma 7 |
| Edge runtime compatibility | Improved in Prisma 7              |
| SQL-like query flexibility | Still a Drizzle advantage         |
| Migration tooling          | Still a Prisma advantage          |

**Recommendation: Stay on Prisma 6/7.** The switching cost for 2 services and 7 tables is non-trivial, and the benefits are now marginal. If moving to Supabase, the `@supabase/supabase-js` client can handle simple CRUD operations (replacing Prisma for those routes), while Prisma continues for complex queries and migrations — a hybrid approach that works well.

---

## Decision Matrix

| Scenario                                | Recommended Path                                                 |
| --------------------------------------- | ---------------------------------------------------------------- |
| Minimize change, optimize current setup | Stay on Neon; upgrade to Prisma 7; add connection pooling config |
| Need auto-generated REST API most       | Migrate to Supabase ($25/mo); adopt PostgREST for CRUD routes    |
| Zero migration cost, try something new  | Evaluate Prisma Postgres (free trial, 2 weeks)                   |
| Need GraphQL API specifically           | Neon + Hasura Cloud (prepare for $108+/mo)                       |
| Need global edge reads                  | Turso (but requires full SQLite migration — high risk)           |
| Enterprise scale, deep AWS integration  | AWS Aurora Serverless v2 (not cost-justified yet)                |
| Full BaaS platform, willing to rewrite  | Convex or Firebase (high migration cost)                         |

---

## Sources

### Provider Pricing & Documentation

- [Neon Pricing](https://neon.com/pricing)
- [Neon Plans Documentation](https://neon.com/docs/introduction/plans)
- [Neon New Usage-Based Pricing](https://neon.com/blog/new-usage-based-pricing)
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Branching Documentation](https://supabase.com/docs/guides/deployment/branching)
- [Supabase Dedicated Poolers](https://supabase.com/blog/dedicated-poolers)
- [Xata Pricing](https://xata.io/pricing)
- [CockroachDB Pricing](https://www.cockroachlabs.com/pricing/)
- [CockroachDB Serverless Free Tier](https://www.cockroachlabs.com/blog/serverless-free/)
- [Turso Pricing](https://turso.tech/pricing)
- [Turso Developer Plan Announcement](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan)
- [Hasura Plans and Pricing](https://hasura.io/docs/2.0/hasura-cloud/plans/)
- [Fly.io Managed Postgres](https://fly.io/docs/mpg/)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Convex Pricing](https://www.convex.dev/pricing)
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase Data Connect Pricing](https://firebase.blog/posts/2025/04/dataconnect-pricing-postga)
- [Amazon Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [PlanetScale Scaler Plan Deprecation](https://planetscale.com/blog/deprecating-the-scaler-plan)

### Integration & Migration Guides

- [Connect from Prisma to Neon](https://neon.com/docs/guides/prisma)
- [Choosing your driver and connection type — Neon](https://neon.com/docs/connect/choose-connection)
- [Neon | Prisma Documentation](https://www.prisma.io/docs/orm/overview/databases/neon)
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling)
- [Connection pool | Prisma Documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Supabase Pricing Breakdown — uibakery](https://uibakery.io/blog/supabase-pricing)
- [Prisma Postgres Announcement](https://www.prisma.io/blog/prisma-postgres-the-future-of-serverless-databases)
- [Preview: @prisma/adapter-neon — GitHub Discussion](https://github.com/prisma/prisma/discussions/21346)

### Comparisons & Analysis

- [Neon vs Aurora Serverless Pricing — Vantage](https://www.vantage.sh/blog/neon-vs-aws-aurora-serverless-postgres-cost-scale-to-zero)
- [Neon vs Supabase — Bytebase](https://www.bytebase.com/blog/neon-vs-supabase/)
- [PostgreSQL Branching: Xata vs Neon vs Supabase](https://xata.io/blog/neon-vs-supabase-vs-xata-postgres-branching-part-2)
- [Drizzle vs Prisma 2026 — Bytebase](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Drizzle vs Prisma Deep Dive — makerkit](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [PostgREST for PostgreSQL — DreamFactory](https://blog.dreamfactory.com/postgrest-for-postgresql-pros-and-cons)
- [Supabase vs Hasura 2025 — Leanware](https://www.leanware.co/insights/supabase-vs-hasura-which-backend-as-a-service-to-choose-in-2025)
- [Neon Postgres 2025 Updates — DEV Community](https://dev.to/dataformathub/neon-postgres-deep-dive-why-the-2025-updates-change-serverless-sql-5o0)
- [Better Postgres with Prisma — DEV Community](https://dev.to/neon-postgres/better-postgres-with-prisma-experience-1ki4)

### News & Announcements

- [Databricks Acquires Neon — CNBC](https://www.cnbc.com/2025/05/14/databricks-is-buying-database-startup-neon-for-about-1-billion.html)
- [Databricks Lakebase GA — Databricks Blog](https://www.databricks.com/blog/databricks-lakebase-generally-available)
- [Neon Pricing Drop from Databricks — Vantage](https://www.vantage.sh/blog/neon-acquisition-new-pricing)
- [Convex Open Source — GitHub](https://github.com/get-convex/convex-backend)
- [Prisma Postgres Production Ready](https://x.com/prisma/status/1886435309795316037)
