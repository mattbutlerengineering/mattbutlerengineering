# Infrastructure as Code (Pulumi)

TypeScript-based infrastructure using Pulumi with DigitalOcean and Cloudflare.

## Prerequisites

1. Install Pulumi CLI: https://www.pulumi.com/docs/install/
2. Create accounts and get API tokens:
   - **DigitalOcean**: https://cloud.digitalocean.com/account/api/tokens
   - **Cloudflare**: https://dash.cloudflare.com/profile/api-tokens
3. Connect your GitHub repo to DigitalOcean App Platform

## Setup

```bash
cd infrastructure/pulumi
pnpm install

# Login to Pulumi (use local backend or Pulumi Cloud)
pulumi login --local  # or just `pulumi login` for cloud

# Configure secrets
pulumi config set digitalocean:token YOUR_DO_TOKEN --secret
pulumi config set cloudflare:apiToken YOUR_CF_TOKEN --secret

# Select/create the production stack
pulumi stack select prod || pulumi stack init prod
```

## Deploy

```bash
# Preview changes
pnpm preview

# Deploy
pnpm up

# View outputs
pulumi stack output
```

## What Gets Created

| Resource | Description |
|----------|-------------|
| `DatabaseCluster` | Managed PostgreSQL 16 (1 vCPU, 1GB) |
| `DatabaseUser` | Application database user |
| `DatabaseDb` | Application database |
| `App` | DigitalOcean App Platform app |
| └─ `users-api` | Fastify API service |
| └─ `web` | Landing page static site |
| └─ `dashboard` | Dashboard static site |
| `DnsRecord` (root) | CNAME pointing to DO App |
| `DnsRecord` (www) | CNAME redirecting to apex |

## Configuration

Set in `Pulumi.prod.yaml`:

| Key | Description |
|-----|-------------|
| `domain` | Your domain name |
| `environment` | `production` or `staging` |
| `digitalocean:region` | DO region (default: `nyc1`) |

## Secrets

Set via CLI (stored encrypted):

```bash
pulumi config set digitalocean:token <token> --secret
pulumi config set cloudflare:apiToken <token> --secret
```

## Destroy

```bash
pulumi destroy
```
