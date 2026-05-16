---
name: deploy
description: Check deploy status, trigger deploys, and debug deploy failures for the mattbutlerengineering monorepo. Covers static sites (Cloudflare Workers), API services (DigitalOcean App Platform), and infrastructure (Pulumi).
user-invocable: true
---

# Deploy

Deployment orchestrator for the mattbutlerengineering monorepo. Three independent pipelines — all triggered by pushes to `main` with path filters.

## Architecture

```
Push to main
├── apps/* or packages/rialto|auth  → deploy-static.yml  → Cloudflare Workers Static Assets
├── services/* or packages/types|auth|agent-core → deploy-services.yml → DO App Platform (doctl)
└── infrastructure/* or apps/gen  → pulumi-up.yml → Pulumi (after static deploys succeed)
```

## Pipeline Details

### 1. Static Sites (`deploy-static.yml`)

**Trigger paths**: `apps/marketing/**`, `apps/hospitality/**`, `apps/rialto-web/**`, `packages/rialto/**`, `packages/rialto-catalog/**`, `packages/auth/**`

**Change detection**: Uses `dorny/paths-filter` — only deploys apps whose deps changed. `workflow_dispatch` deploys all three.

| App | Build | Deploy |
|-----|-------|--------|
| Marketing | `pnpm build --filter=@mbe/marketing` | `wrangler deploy --config apps/marketing/wrangler.toml` |
| Hospitality | `pnpm build --filter=@mbe/hospitality` (needs Auth0 env vars) | `wrangler deploy --config apps/hospitality/wrangler.toml` |
| Rialto Web | `pnpm build --filter=@mbe/rialto-web` | `wrangler deploy --config apps/rialto-web/wrangler.toml` |

**Secrets needed**: `MBE_CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTH0_HOSPITALITY_CLIENT_ID`

### 2. API Services (`deploy-services.yml`)

**Trigger paths**: `services/users/**`, `services/reservations/**`, `services/agent/**`, `packages/types/**`, `packages/auth/**`, `packages/agent-core/**`

**Mechanism**: Installs `doctl`, finds the `mattbutlerengineering-api` app by name, triggers `doctl apps create-deployment --wait`.

**Secrets needed**: `DIGITALOCEAN_TOKEN`

**Note**: This deploys ALL services together (single DO App Platform app). No per-service granularity.

### 3. Infrastructure (`pulumi-up.yml`)

**Trigger paths**: `infrastructure/pulumi/**`, `infrastructure/worker/**`, `apps/gen/**`, `packages/rialto/**`, `packages/rialto-catalog/**`, `packages/auth/**`

**Also triggers**: After `Deploy Static Sites` workflow completes (Service Bindings need targets to exist first).

**Mechanism**: `pulumi up` with stack `prod`, state stored in Cloudflare R2 (`mattbutlerengineering-pulumi-state` bucket).

**Secrets needed**: `PULUMI_CONFIG_PASSPHRASE`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_GEN_CLIENT_ID`

## Workflow

When the user says "deploy" or you need to check deploy status:

### 1. Check what changed

```bash
# What's different from the last deploy?
git log --oneline origin/main..HEAD --name-only
# Or check recent workflow runs:
gh run list --workflow=deploy-static.yml --limit=3
gh run list --workflow=deploy-services.yml --limit=3
gh run list --workflow=pulumi-up.yml --limit=3
```

### 2. Check status of recent deploys

```bash
# Detailed view of a specific run
gh run view <run-id>
gh run view <run-id> --log-failed   # Show only failed step logs
```

### 3. Trigger a manual deploy

```bash
# Deploy all static sites
gh workflow run deploy-static.yml

# Deploy services
gh workflow run deploy-services.yml

# Deploy infrastructure
gh workflow run pulumi-up.yml
```

### 4. Debug failures

Common issues:
- **Static deploy fails**: Usually a build error. Check `pnpm build --filter=@mbe/<app>` locally.
- **Service deploy fails**: Check `doctl apps list` to verify the app exists. Review DO dashboard logs.
- **Pulumi fails**: Run `pulumi preview` locally in `infrastructure/pulumi/` to see what changed.
- **Pulumi after static**: Pulumi runs after static deploys via `workflow_run`. If static fails, Pulumi skips (guarded by `conclusion == 'success'`).

## Gotchas

- Pushing changes to `packages/rialto/**` triggers BOTH static deploys AND Pulumi (shared dep)
- Pushing changes to `packages/auth/**` triggers BOTH static deploys AND service deploys
- Service deploys are all-or-nothing — can't deploy just users without reservations
- Edge router changes (`infrastructure/worker/edge-router.js`) only deploy via Pulumi, not static
