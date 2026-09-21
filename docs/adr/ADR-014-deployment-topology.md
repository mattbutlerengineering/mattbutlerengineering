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

- Services: `services/users`, `services/reservations`, `services/agent`, `infrastructure/migrate` (db-migrate)
- Deployment: Single atomic unit via `doctl apps create-deployment $DO_APP_ID --wait`
- Mechanism: DO App Platform (containerized microservices, one app resource per environment)
- Configuration: The DO App spec is defined by Pulumi's `digitalocean.App` resource in `infrastructure/pulumi/index.ts`; there is no checked-in `app.yaml` file — `deploy-services.yml` fetches the live spec at deploy time via `doctl apps spec get`, patches deploy metadata into it, and applies it via `doctl apps update`
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
3. If Pulumi detects spec drift from doctl (e.g., a secret was added via `doctl` but not reflected in `infrastructure/pulumi/Pulumi.yaml`/`infrastructure/pulumi/Pulumi.prod.yaml`), `pulumi up` can hang waiting for the in-progress DO deployment to complete.

**Mitigation**:

- Keep `infrastructure/pulumi/Pulumi.prod.yaml` and the live DO App spec (defined in `infrastructure/pulumi/index.ts`, fetched via `doctl apps spec get`) in sync.
- Run Pulumi **after** service deployments complete (workflow sequencing).
- Use GitHub Actions job dependencies to enforce serialization: `deploy-services` then `pulumi-up`.
- Document the hazard in `.claude/rules/gotchas.md` so future operators understand the constraint.

### Coordination Hazard: `ignoreChanges` on the DO App Resource

**Issue**: the hazard above is mitigated partly by _not letting Pulumi manage_ the fields `doctl` and DO itself write. That mitigation is expressed as `ignoreChanges` on the `digitalocean.App` resource in `infrastructure/pulumi/index.ts`, and it is a load-bearing correctness boundary, not a noise filter: every path listed there is a path where source and production are free to disagree silently, because Pulumi will not diff it.

It was originally the single blanket path `spec`, chosen to suppress the DO-injected defaults that diff on every run (top-level `features`, `scope` on env entries, `instance_count` / `instance_size_slug` on jobs and services) and trigger a ~30-minute full deployment. The blanket also made the **ingress rules** unmanaged, and that is not a hypothetical cost: #4511's `/public` → `reservations-api` rule sat correct in source while `pulumi up` reported the App `unchanged`, and the entire public booking surface returned 404 in production for three months. A green `pulumi up` was the signal everyone trusted, and it meant nothing.

**Decision**: `ignoreChanges` is narrowed to the specific drift-tolerant paths, never to an ancestor of something that must ship. As of #4565 it is:

```ts
ignoreChanges: ["spec.features", "spec.jobs", "spec.services"];
```

so `spec.name`, `spec.region`, `spec.domainNames` and `spec.ingress` are managed by Pulumi again.

**Constraints that come with it:**

- **Paths are depth-2 object keys only — no `[*]`, no `[0]`, no array traversal.** Whether this provider version honors array-index or wildcard paths is unvalidated; #4565 removed its dependency on that syntax rather than proving it works. Anything deeper needs evidence first.
- **The evidence is `pulumi preview --diff`, never a green `pulumi up`.** A successful apply cannot distinguish "nothing changed" from "the change was not diffed" — that indistinguishability is the whole defect. #4565's narrowing was verified by reading a read-only preview (CLI 3.253.0, `@pulumi/digitalocean` 4.79.0) and confirming the App diff was confined to `spec.ingress.rules`.
- **Narrowing further surfaces real production drift**, which must be reconciled inside a deploy window before the next apply. That is why the remaining reconciliation (`spec.jobs` / `spec.services` — env vars, instance sizes, per-component config) is human-gated rather than incremental: see issue #3277 and `docs/backlog.md`.
- **Env vars are deliberately still unmanaged.** `spec.services` and `spec.jobs` stay ignored, which is what lets `deploy-services.yml`'s `yq` bridge own the real values. Removing either path from the list means Pulumi starts pushing env vars and the bridge becomes a conflict, not a complement.

**Enforcement**: `infrastructure/pulumi/ingress-coverage.test.ts` reads the live `ignoreChanges` array out of `index.ts` source (comment-stripped, so a commented-out list cannot satisfy it) and fails if any entry would make the ingress rules unmanaged — `spec` itself, `spec.ingress`, or anything below it. It cross-checks the DO ingress prefixes against the Cloudflare edge worker's `originRoutes`, because a correct DO rule behind an edge that does not forward the prefix is still unreachable.

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
