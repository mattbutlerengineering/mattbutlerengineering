# Secret Rotation Schedule

> **WARNING:** This document catalogs secret *names*, purposes, and rotation procedures.
> It must NEVER contain actual secret values.

## Overview

All secrets are stored in **GitHub Actions Secrets** (`Settings > Secrets and variables > Actions`)
and referenced via `${{ secrets.NAME }}` in workflow files.

Production infrastructure secrets are injected by Pulumi at deploy time (see `infrastructure/pulumi/index.ts`).

## Rotation Schedule

| Secret | Purpose | Cadence | Next Rotation |
|--------|---------|---------|---------------|
| `DIGITALOCEAN_TOKEN` | DigitalOcean API (deploy-services, Pulumi) | Quarterly | — |
| `MBE_CLOUDFLARE_API_TOKEN` | Cloudflare API (Pages deploys, KV, DNS, Pulumi) | Quarterly | — |
| `DATABASE_URL` | PostgreSQL connection string (services) | Quarterly | — |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 / S3-compat access key (Pulumi state backend) | Quarterly | — |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 / S3-compat secret key (Pulumi state backend) | Quarterly | — |
| `PULUMI_ACCESS_TOKEN` | Pulumi Cloud API (if used; currently state is in R2) | Semi-annually | — |
| `PULUMI_CONFIG_PASSPHRASE` | Encrypts Pulumi stack config values | Semi-annually | — |
| `AUTH0_CLIENT_SECRET` | Auth0 Machine-to-Machine secret (Pulumi provider) | Semi-annually | — |
| `LANGFUSE_SECRET_KEY` | Langfuse observability API secret | Semi-annually | — |
| `GITLEAKS_LICENSE` | Gitleaks commercial license key (secret-scan workflow) | Semi-annually | — |
| `SENTRY_DSN` | Sentry ingest endpoint (public identifier) | No rotation needed | N/A |
| `GITHUB_TOKEN` | GitHub Actions built-in token | Auto-rotated by Actions | N/A |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier (not a secret per se) | No rotation needed | N/A |
| `HEALTH_KV_NAMESPACE_ID` | Cloudflare KV namespace ID for health checks | No rotation needed | N/A |
| `AUTH0_DOMAIN` | Auth0 tenant domain (e.g. `xxx.auth0.com`) | No rotation needed | N/A |
| `AUTH0_CLIENT_ID` | Auth0 application client ID (public) | No rotation needed | N/A |
| `AUTH0_GEN_CLIENT_ID` | Auth0 general SPA client ID (public) | No rotation needed | N/A |
| `AUTH0_HOSPITALITY_CLIENT_ID` | Auth0 hospitality app client ID (public) | No rotation needed | N/A |
| `TURBO_TOKEN` | Turborepo remote cache token | Semi-annually | — |
| `AGENT_API_URL` | Agent service API base URL (not a credential) | No rotation needed | N/A |

## Rotation Runbooks

### DIGITALOCEAN_TOKEN

**Cadence:** Quarterly

1. Log in to [DigitalOcean](https://cloud.digitalocean.com/) > API > Tokens.
2. Click **Generate New Token**. Name it `mbe-github-actions-YYYY-MM` with read+write scope.
3. Copy the token value.
4. In GitHub, go to **Settings > Secrets > Actions** and update `DIGITALOCEAN_TOKEN`.
5. **Verify:** Trigger the `deploy-services` workflow on a non-production branch and confirm it authenticates.
6. Delete the old token in DigitalOcean.

### MBE_CLOUDFLARE_API_TOKEN

**Cadence:** Quarterly

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) > My Profile > API Tokens.
2. Click **Create Token**. Use the same permissions as the existing token (Zone:DNS:Edit, Zone:Zone:Read, Account:Cloudflare Pages:Edit, Account:Workers KV Storage:Edit).
3. Copy the token value.
4. In GitHub, update `MBE_CLOUDFLARE_API_TOKEN`.
5. **Verify:** Trigger `deploy-static` on a test branch; confirm Pages deploy succeeds.
6. Revoke the old token in Cloudflare.

### DATABASE_URL

**Cadence:** Quarterly

1. Connect to DigitalOcean Managed Database console (or `psql`).
2. Create a new database user or reset the password for the existing user:
   ```sql
   ALTER USER mbe_app WITH PASSWORD 'new-secure-password';
   ```
3. Construct the new connection string: `postgresql://mbe_app:<password>@<host>:25060/mbe?sslmode=require`.
4. In GitHub, update `DATABASE_URL`.
5. Redeploy all services (`deploy-services` workflow) so they pick up the new URL.
6. **Verify:** Check service health endpoints return 200 and database queries succeed.

### R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY

**Cadence:** Quarterly

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) > R2 > Manage R2 API Tokens.
2. Create a new token with Object Read & Write on the Pulumi state bucket.
3. In GitHub, update both `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
4. **Verify:** Run `pulumi-up` workflow on a preview branch; confirm state reads/writes succeed.
5. Delete the old R2 API token in Cloudflare.

### PULUMI_CONFIG_PASSPHRASE

**Cadence:** Semi-annually

> Changing this passphrase re-encrypts all stack config. Coordinate carefully.

1. Choose a new strong passphrase (32+ characters).
2. Locally, set the old passphrase: `export PULUMI_CONFIG_PASSPHRASE="old-value"`.
3. Export current config: `pulumi config --show-secrets > /tmp/config-backup.json`.
4. Set the new passphrase: `export PULUMI_CONFIG_PASSPHRASE="new-value"`.
5. Re-import config or run `pulumi up` to re-encrypt.
6. In GitHub, update `PULUMI_CONFIG_PASSPHRASE`.
7. **Verify:** Run `pulumi-up` workflow in preview mode; confirm it decrypts config successfully.

### AUTH0_CLIENT_SECRET

**Cadence:** Semi-annually

1. Log in to [Auth0 Dashboard](https://manage.auth0.com/) > Applications > the M2M application used by Pulumi.
2. Go to **Settings** and click **Rotate Secret**.
3. Copy the new secret.
4. In GitHub, update `AUTH0_CLIENT_SECRET`.
5. **Verify:** Run `pulumi-up` workflow in preview mode; confirm Auth0 provider authenticates.

### LANGFUSE_SECRET_KEY

**Cadence:** Semi-annually

1. Log in to [Langfuse](https://cloud.langfuse.com/) > Settings > API Keys.
2. Create a new API key pair (public + secret).
3. In GitHub, update `LANGFUSE_SECRET_KEY`. If `LANGFUSE_PUBLIC_KEY` is also stored, update it too.
4. Redeploy services that use `@mbe/observability`.
5. **Verify:** Check Langfuse dashboard for new traces arriving from the deployed services.
6. Delete the old API key in Langfuse.

### GITLEAKS_LICENSE

**Cadence:** Semi-annually

1. Check license expiration at [gitleaks.io](https://gitleaks.io/).
2. Renew or re-download the license key if needed.
3. In GitHub, update `GITLEAKS_LICENSE`.
4. **Verify:** Trigger the `secret-scan` workflow; confirm it runs without license errors.

### TURBO_TOKEN

**Cadence:** Semi-annually

1. Log in to [Vercel](https://vercel.com/) (or your Turborepo remote cache provider) > Settings > Tokens.
2. Create a new token scoped to the remote cache.
3. In GitHub, update `TURBO_TOKEN`.
4. **Verify:** Trigger a CI run; confirm remote cache hits/misses appear in logs.
5. Revoke the old token.

## Non-Rotating Secrets

These values are identifiers or public configuration, not credentials:

| Secret | Reason |
|--------|--------|
| `SENTRY_DSN` | Public ingest URL; safe to expose in client bundles |
| `GITHUB_TOKEN` | Automatically provisioned per workflow run by GitHub Actions |
| `CLOUDFLARE_ACCOUNT_ID` | Account identifier, not a credential |
| `HEALTH_KV_NAMESPACE_ID` | KV namespace identifier, not a credential |
| `AUTH0_DOMAIN` | Public tenant URL |
| `AUTH0_CLIENT_ID` | Public OIDC client identifier |
| `AUTH0_GEN_CLIENT_ID` | Public OIDC client identifier |
| `AUTH0_HOSPITALITY_CLIENT_ID` | Public OIDC client identifier |
| `AGENT_API_URL` | Service URL, not a credential |

## Where Secrets Are Used

| Workflow File | Secrets Referenced |
|---------------|-------------------|
| `deploy-services.yml` | `GITHUB_TOKEN`, `DIGITALOCEAN_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `deploy-static.yml` | `MBE_CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTH0_HOSPITALITY_CLIENT_ID`, `HEALTH_KV_NAMESPACE_ID` |
| `pulumi-up.yml` | `AUTH0_GEN_CLIENT_ID`, `PULUMI_CONFIG_PASSPHRASE`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `HEALTH_KV_NAMESPACE_ID` |
| `ci.yml` | `TURBO_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `lighthouse.yml` | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `uptime-snapshot.yml` | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `synthetic-monitoring.yml` | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `load-test.yml` | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID` |
| `secret-scan.yml` | `GITHUB_TOKEN`, `GITLEAKS_LICENSE` |
| `changelog.yml` | `GITHUB_TOKEN` |
| `dependabot-auto-merge.yml` | `GITHUB_TOKEN` |
| `agent-task.yml` | `AGENT_API_URL` |

## Runtime Secrets (Not in GitHub Actions)

These secrets are injected at deploy time by Pulumi into DigitalOcean App Platform:

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | PostgreSQL connection string for all services |
| `SENTRY_DSN` | Sentry error reporting endpoint |
| `LANGFUSE_SECRET_KEY` | Observability trace export |
