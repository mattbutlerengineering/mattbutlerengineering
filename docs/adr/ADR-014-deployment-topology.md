---
id: ADR-014
title: Deployment Topology
status: active
date: 2026-06-30
---

# ADR-014: Deployment Topology

## Context

The platform spans multiple deployment targets: static frontend apps (marketing, hospitality, rialto-web, gen), Fastify API services (users-api, reservations-api, agent-api), and a database migration service. Each target has different deployment requirements and lifecycle expectations. A clear, unified deployment topology document is needed to record the settled architecture and prevent operational confusion when onboarding new services or troubleshooting deploy issues.

## Decision

### Three-Layer Deployment Model

The platform uses a **three-tier deployment strategy**:

**1. Static Frontend Apps → Cloudflare Workers**

- Apps: `apps/marketing`, `apps/hospitality`, `apps/rialto-web`, `apps/gen`
- Deployment: `cd apps/<app> && pnpm dlx wrangler@latest deploy`
- Mechanism: Cloudflare Workers Static Assets (Wrangler CLI)
- Routing: All traffic enters via the unified `edge-router` Worker (see ADR-011)
- Cache: HTML uses `Cache-Control: no-store`; assets use long-lived headers with content hashing

**2. API Services + Database Migration → DigitalOcean App Platform**

- Services: `services/users-api`, `services/reservations-api`, `services/agent-api`, `infrastructure/migrate` (db-migrate)
- Deployment: Single atomic unit via `doctl apps create-deployment $DO_APP_ID --wait`
- Mechanism: DO App Platform (containerized microservices, one app resource per environment)
- Configuration: `app.yaml` defines all services and their build/runtime config
- Database: Migrations run as a separate `db-migrate` service in the same App Platform app

**3. Infrastructure & Secrets → Pulumi**

- Definitions: Infrastructure-as-Code in `infrastructure/pulumi/` (TypeScript)
- Deployment: `cd infrastructure/pulumi && pulumi up --stack prod`
- Scope: DO App Platform spec, environment variables, secrets, DNS, CDN config
- Enforcement: Pulumi reads source-of-truth config and enforces desired state

### CI-Only Deployment Policy

All deployments go **through GitHub Actions CI pipelines**, never ad-hoc local commands:

- Static apps: `.github/workflows/deploy-static.yml` runs `wrangler deploy`
- API services: `.github/workflows/deploy-services.yml` runs `doctl apps create-deployment`
- Infrastructure: `.github/workflows/pulumi-up.yml` runs `pulumi up`

**Rationale**: Centralizing deploys through CI ensures:

- Audit trail (every deploy is a GH workflow run)
- Reproducibility (same CLI tools, secrets, environment on every run)
- Safety (CI enforces pre-deploy checks: lint, typecheck, tests, security scans)
- Traceability (deploy logs are archived; no lost local history)

Manual local deploys (documented in [CLAUDE.md](../../CLAUDE.md#manual-deployment)) exist only for troubleshooting and are explicitly discouraged as a primary path.

## Consequences

### Benefits

- **Clear separation of concerns**: Frontend, API, and infrastructure have distinct deployment mechanisms and lifecycles.
- **Parallelizable**: Static apps and API services can be deployed independently.
- **Consistent artifact versioning**: Each service/app is deployed from a clean CI environment, eliminating "works locally" divergences.
- **Unified secrets management**: All env vars and secrets are stored in GitHub Secrets, not scattered across local `.env` files or environment-specific vaults.

### Coordination Hazard: DO + Pulumi Dual-Deploy Race

**Issue**: Both `deploy-services.yml` (which calls `doctl apps create-deployment`) and `pulumi-up.yml` (which runs `pulumi up`) manage the same DO App Platform app resource. This creates a race condition:

1. A `doctl apps create-deployment` call triggers DO to deploy the app **and** generate a "spec updated" event.
2. The "spec updated" event spawns a paired DO deployment that **gets canceled** by the doctl response (both are the same deployment).
3. If Pulumi detects spec drift from doctl (e.g., a secret was added via `doctl` but not in `pulumi/stack.yaml`), `pulumi up` can hang waiting for the in-progress DO deployment to complete.

**Mitigation**:

- Keep `infrastructure/pulumi/stack.prod.yaml` and the app spec in `app.yaml` in sync.
- Run Pulumi **after** service deployments complete (workflow sequencing).
- Use GitHub Actions job dependencies to enforce serialization: `deploy-services` then `pulumi-up`.
- Document the hazard in `.claude/rules/gotchas.md` so future operators understand the constraint.

### Trade-Offs

- **Complexity**: Three deployment paths (wrangler, doctl, pulumi) require coordination.
- **Dependency chain**: If one step fails, subsequent steps may not run (CI pipeline flow control).
- **Long CI times**: Stacking all deploys in sequence can take 10-15 minutes per deploy cycle.

## Alternatives Considered

### Single Cloud Provider (e.g., AWS, GCP)

**Rejected because:**

- Cloudflare Workers are best-in-class for edge routing and cost-effective for static content globally.
- DO App Platform offers simpler containerization and lower operational overhead than AWS ECS/Fargate.
- Forcing all services onto one provider would eliminate the specialized strengths of each.

### Serverless/Distributed Deploy (Apps Deployed Independently)

**Rejected because:**

- Each service has different deployment timing needs (static sites are instant, API services require DB migration sequencing).
- A "all deploy in parallel" model would race against database migrations and cause corruption.
- Coordinating multiple independent CI jobs adds complexity without benefit; serialization is clearer.

### Manual Local Deploys (CLI Commands by Human Operators)

**Rejected as the primary path because:**

- No audit trail (commands run locally, CI logs don't capture them).
- Secrets sprawl (operators with local `.env` files introduce inconsistency and drift).
- Reproducibility breaks (CI environment ≠ local environment; "works locally" diverges from "works in prod").
- Only valid for emergency hotfixes, not as a standard workflow.

### Unified Deployment Orchestrator (Single Tool)

**Rejected because:**

- wrangler, doctl, and pulumi have fundamentally different API models (Workers ≠ containers ≠ infra-as-code).
- Creating an abstraction layer on top would add maintenance burden and hide provider-specific behaviors.
- Each tool's CLI is well-documented; orchestration logic is better in CI workflows (explicit, version-controlled, auditable).

## See Also

- **ADR-004**: Edge Routing — documents the Cloudflare Worker topology that serves all static apps.
- **ADR-011**: Edge Routing Architecture (detailed) — routing table, caching policy, security headers.
- **[CLAUDE.md → Manual Deployment](../../CLAUDE.md#manual-deployment)** — commands for ad-hoc troubleshooting (not primary workflow).
- **[.claude/rules/gotchas.md → DO + Pulumi dual-deploy race](../../.claude/rules/gotchas.md)** — detailed gotcha with resolution steps.
