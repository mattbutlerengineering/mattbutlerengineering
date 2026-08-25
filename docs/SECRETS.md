# Secret Rotation Schedule

> **WARNING:** This document catalogs secret _names_, purposes, and rotation procedures.
> It must NEVER contain actual secret values.

## Overview

All secrets are stored in **GitHub Actions Secrets** (`Settings > Secrets and variables > Actions`)
and referenced via `${{ secrets.NAME }}` in workflow files.

Production infrastructure secrets are injected by Pulumi at deploy time (see `infrastructure/pulumi/index.ts`).

## Rotation Schedule

| Secret                        | Purpose                                                                | Cadence                 | Next Rotation |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------- | ------------- |
| `DIGITALOCEAN_TOKEN`          | DigitalOcean API (deploy-services, Pulumi)                             | Quarterly               | —             |
| `MBE_CLOUDFLARE_API_TOKEN`    | Cloudflare API (Pages deploys, KV, DNS, Pulumi)                        | Quarterly               | —             |
| `DATABASE_URL`                | PostgreSQL connection string (services)                                | Quarterly               | —             |
| `R2_ACCESS_KEY_ID`            | Cloudflare R2 / S3-compat access key (Pulumi state backend)            | Quarterly               | —             |
| `R2_SECRET_ACCESS_KEY`        | Cloudflare R2 / S3-compat secret key (Pulumi state backend)            | Quarterly               | —             |
| `PULUMI_ACCESS_TOKEN`         | Pulumi Cloud API (if used; currently state is in R2)                   | Semi-annually           | —             |
| `PULUMI_CONFIG_PASSPHRASE`    | Encrypts Pulumi stack config values                                    | Semi-annually           | —             |
| `AUTH0_CLIENT_SECRET`         | Auth0 Machine-to-Machine secret (Pulumi provider)                      | Semi-annually           | —             |
| `LANGFUSE_SECRET_KEY`         | Langfuse observability API secret                                      | Semi-annually           | —             |
| `GITLEAKS_LICENSE`            | Gitleaks commercial license key (secret-scan workflow)                 | Semi-annually           | —             |
| `SENTRY_DSN`                  | Sentry ingest endpoint (public identifier)                             | No rotation needed      | N/A           |
| `GITHUB_TOKEN`                | GitHub Actions built-in token                                          | Auto-rotated by Actions | N/A           |
| `CLOUDFLARE_ACCOUNT_ID`       | Cloudflare account identifier (not a secret per se)                    | No rotation needed      | N/A           |
| `HEALTH_KV_NAMESPACE_ID`      | Cloudflare KV namespace ID for health checks                           | No rotation needed      | N/A           |
| `AUTH0_DOMAIN`                | Auth0 tenant domain (e.g. `xxx.auth0.com`)                             | No rotation needed      | N/A           |
| `AUTH0_CLIENT_ID`             | Auth0 application client ID (public)                                   | No rotation needed      | N/A           |
| `AUTH0_GEN_CLIENT_ID`         | Auth0 general SPA client ID (public)                                   | No rotation needed      | N/A           |
| `AUTH0_HOSPITALITY_CLIENT_ID` | Auth0 hospitality app client ID (public)                               | No rotation needed      | N/A           |
| `TURBO_TOKEN`                 | Turborepo remote cache token                                           | Semi-annually           | —             |
| `AGENT_API_URL`               | Agent service API base URL (not a credential)                          | No rotation needed      | N/A           |
| `AUTOMATION_PAT`              | PAT/bot-token for scheduled automation that pushes commits (see below) | Semi-annually           | —             |

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

### AUTOMATION_PAT

**Cadence:** Semi-annually

> **Not currently set.** Until this secret exists, every workflow below falls back to
> `secrets.GITHUB_TOKEN` (via `${{ secrets.AUTOMATION_PAT || secrets.GITHUB_TOKEN }}`) and
> hits the bug this secret exists to fix (see below) — the fallback is a silent no-op, not
> a working alternative.

**Why `GITHUB_TOKEN` doesn't work here:** GitHub has a hard-coded, non-configurable
anti-privilege-escalation rule: a `pull_request` event whose head commit was pushed using the
default `GITHUB_TOKEN` from another workflow always requires a human to manually approve the
resulting workflow run before it can post its checks — regardless of repo settings. Scheduled
automation that opens/updates a PR by pushing a commit as `github-actions[bot]` (via the
ambient `GITHUB_TOKEN`) hits this every run: `CI`, `Auto Review`, `ADR check`, etc. all land in
`action_required` and the PR sits `BLOCKED` until someone approves the runs by hand (see #3684).
Pushing as a real PAT/bot-token identity instead avoids the rule entirely, because the commit is
no longer attributed to `github-actions[bot]`.

1. Create a dedicated GitHub account for automation (or reuse an existing bot account) — do not
   use a personal account, so the token can be scoped and rotated independently of any one person.
2. Generate a fine-grained PAT (or classic PAT) with `repo` (contents + pull-requests) and
   `workflow` scope, on the bot account.
3. In GitHub, set the repo secret: `gh secret set AUTOMATION_PAT --body "<token>"`.
4. **Verify:** Trigger one of the workflows listed below via `workflow_dispatch`; confirm the
   resulting PR's checks (`CI`, etc.) start automatically with no `action_required` state, and
   `gh pr view <n> --json mergeStateStatus` resolves to `CLEAN` (given a green CI Gate) without
   manual approval.
5. Revoke the old token on the bot account before generating a replacement at next rotation.

**Workflows that push commits and need this secret** (all fall back to the broken
`GITHUB_TOKEN` behavior above until it is set): `production-feedback.yml`, `auto-qa-tune.yml`,
`drift-fix.yml`, `pr-metrics.yml`, `acmm-regression.yml`, `acmm-cold-start.yml`,
`changelog.yml`, `revert-watchdog.yml`, `auto-rollback.yml`.

### `packages/gh-client` REST-fallback token precedence

Not a GitHub Actions secret, but a related credential-resolution concern worth documenting
next to `AUTOMATION_PAT`: `packages/gh-client` normally shells out to the `gh` binary, but
when `gh` isn't on `PATH` (observed in Claude Code Remote cloud sessions — the environment
scheduled routines like `learning-loop`/`ci-monitor` run in) it falls back to calling the
GitHub REST API directly, and that fallback needs its own bearer token via
`resolveToken()` (`packages/gh-client/src/rest-args.ts`).

`resolveToken()` checks, in order, and uses the first one set:

```
GITHUB_TOKEN → GH_TOKEN → GITHUB_PERSONAL_ACCESS_TOKEN → AUTOMATION_PAT
```

**Why the fallback exists:** #3937 diagnosed that the shell-level `GITHUB_TOKEN`/`GH_TOKEN`
available in a Claude Code Remote session is scoped for git-over-HTTPS only and 401s (later
observed as 403 — "REST fallback credential is not valid for direct API calls") against
direct REST calls, even though the same session's `github` MCP tools authenticate fine. That
silently blacked out 6 sensors (`prCategoryMetrics`, `ciHealth`, `issues`, `issueFeedback`,
`e2eStability`, `queueEfficiency`) in every cloud-scheduled `sensor-report.mjs` run.
`GITHUB_PERSONAL_ACCESS_TOKEN`/`AUTOMATION_PAT` give the REST fallback a chance to find a
credential that actually works for direct API calls in that environment, the same way
`AUTOMATION_PAT` above exists to route around a different `GITHUB_TOKEN` limitation.

**If neither `GITHUB_PERSONAL_ACCESS_TOKEN` nor `AUTOMATION_PAT` is set** in a given cloud
session, the honest result is the sensors staying dark with an explicit auth-failure error
(not a silent empty state) — that's a real "N/A in this environment" condition, not a bug in
the fallback chain itself. See #4099 (parent proposal) and #4191/#4192/#4193 (the three-part
fix/verification chain) for the full history.

## Non-Rotating Secrets

These values are identifiers or public configuration, not credentials:

| Secret                        | Reason                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `SENTRY_DSN`                  | Public ingest URL; safe to expose in client bundles          |
| `GITHUB_TOKEN`                | Automatically provisioned per workflow run by GitHub Actions |
| `CLOUDFLARE_ACCOUNT_ID`       | Account identifier, not a credential                         |
| `HEALTH_KV_NAMESPACE_ID`      | KV namespace identifier, not a credential                    |
| `AUTH0_DOMAIN`                | Public tenant URL                                            |
| `AUTH0_CLIENT_ID`             | Public OIDC client identifier                                |
| `AUTH0_GEN_CLIENT_ID`         | Public OIDC client identifier                                |
| `AUTH0_HOSPITALITY_CLIENT_ID` | Public OIDC client identifier                                |
| `AGENT_API_URL`               | Service URL, not a credential                                |

## Where Secrets Are Used

| Workflow File               | Secrets Referenced                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `deploy-services.yml`       | `GITHUB_TOKEN`, `DIGITALOCEAN_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                          |
| `deploy-static.yml`         | `MBE_CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTH0_HOSPITALITY_CLIENT_ID`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                 |
| `pulumi-up.yml`             | `AUTH0_GEN_CLIENT_ID`, `PULUMI_CONFIG_PASSPHRASE`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`, `MBE_CLOUDFLARE_API_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `HEALTH_KV_NAMESPACE_ID` |
| `ci.yml`                    | `TURBO_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                                 |
| `lighthouse.yml`            | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                                                |
| `uptime-snapshot.yml`       | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                                                |
| `synthetic-monitoring.yml`  | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                                                |
| `load-test.yml`             | `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`, `HEALTH_KV_NAMESPACE_ID`                                                                                                                                                                                |
| `resource-audit.yml`        | `GITHUB_TOKEN`, `DIGITALOCEAN_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MBE_CLOUDFLARE_API_TOKEN`                                                                                                                                                                    |
| `secret-scan.yml`           | `GITHUB_TOKEN`, `GITLEAKS_LICENSE`                                                                                                                                                                                                                           |
| `changelog.yml`             | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `dependabot-auto-merge.yml` | `GITHUB_TOKEN`                                                                                                                                                                                                                                               |
| `agent-task.yml`            | `AGENT_API_URL`                                                                                                                                                                                                                                              |
| `production-feedback.yml`   | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `auto-qa-tune.yml`          | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `drift-fix.yml`             | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `pr-metrics.yml`            | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `acmm-regression.yml`       | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `acmm-cold-start.yml`       | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `revert-watchdog.yml`       | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |
| `auto-rollback.yml`         | `AUTOMATION_PAT` (falls back to `GITHUB_TOKEN`)                                                                                                                                                                                                              |

## Runtime Secrets (Not in GitHub Actions)

These secrets are injected at deploy time by Pulumi into DigitalOcean App Platform:

| Secret                | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string for all services |
| `SENTRY_DSN`          | Sentry error reporting endpoint               |
| `LANGFUSE_SECRET_KEY` | Observability trace export                    |
