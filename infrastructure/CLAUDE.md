# Infrastructure

Pulumi (TypeScript) IaC + Cloudflare Worker edge router.

## Stack

- **Pulumi project**: `mbe-infrastructure`, stack: `prod`
- **State backend**: Cloudflare R2 bucket (`mattbutlerengineering-pulumi-state`)
- **Providers**: `@pulumi/cloudflare`, `@pulumi/digitalocean`, `@pulumi/auth0`

## Reference

DO App Platform component table, edge-router route map and Cloudflare DNS records: [docs/reference.md](./docs/reference.md). Runbooks: [docs/RUNBOOKS.md](./docs/RUNBOOKS.md).

## Resources Managed

### DigitalOcean App Platform (`index.ts`)

Single DO app (`mattbutlerengineering-api`) with 3 services + 3 per-service pre-deploy migration jobs. Component table (Dockerfile, port, ingress prefix): [docs/reference.md](./docs/reference.md#digitalocean-app-platform-components).

Each migration job uses the same parameterized Dockerfile with `SERVICE_NAME` env var selecting which service's Prisma migrations to run. Failure in one service's migrations does not block other services.

- **Ingress order matters**: More specific prefixes must come before catch-all `/api`
- `deployOnPush: false` — CI triggers deploys via `doctl`
- Health checks on `/health` for all services

### Cloudflare Edge Router (`worker/edge-router.js`)

Worker that routes all `mattbutlerengineering.com` traffic. Route map: [docs/reference.md](./docs/reference.md#edge-router-routes).

**Key pattern**: Service Bindings bypass CDN entirely — prevents stale HTML after deploys. The edge router strips path prefixes before forwarding (e.g., `/hospitality/foo` → `/foo` on the app Worker).

### Cloudflare DNS (`index.ts`)

`@` and `www` are proxied (the Worker handles them); `api` is NOT proxied (see Gotchas). Records: [docs/reference.md](./docs/reference.md#cloudflare-dns-records).

### Auth0 (`auth0.ts`)

Auth0 applications and API managed via `@pulumi/auth0` provider. Exports `auth0ApiIdentifier` and `auth0ClientId`.

### Gen App Worker (`index.ts`)

Pulumi-managed CF Worker for the `gen` app. Assets uploaded from `apps/gen/dist/` at `pulumi up` time — **requires `pnpm build --filter=@mbe/gen` before `pulumi up`**.

## Pulumi Config

```bash
pulumi config get mbe-infrastructure:domain              # mattbutlerengineering.com
pulumi config get mbe-infrastructure:cloudflareZoneId     # CF zone ID
pulumi config get mbe-infrastructure:cloudflareAccountId  # CF account ID
pulumi config get mbe-infrastructure:databaseUrl --secret # Postgres connection string
```

## Commands

```bash
cd infrastructure/pulumi
pulumi preview    # Show planned changes (safe, read-only)
pulumi up         # Apply changes (destructive — confirm before running)
pulumi refresh    # Sync state with actual cloud resources
pulumi stack output  # Show exported values
```

## Gotchas

- Pulumi state is in R2, not Pulumi Cloud — need `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` for R2 access
- The `api` DNS record is NOT proxied (Cloudflare proxy off) — DO needs to verify the domain and provision TLS
- Adding a new static site Worker requires: create the Worker + add a Service Binding to the edge router + add routing logic to `edge-router.js`
- Adding a new API service requires: add to `services` array in DO app spec + add ingress rule (order matters!)
- Each service has its own pre-deploy migration job (`db-migrate-<service>`) — add a new entry to `MIGRATED_SERVICES` in `index.ts` when adding a service with Prisma migrations
