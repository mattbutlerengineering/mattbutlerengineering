# Secret Rotation Schedule

> **WARNING:** This document catalogs secret _names_, purposes, and rotation procedures.
> It must NEVER contain actual secret values.

## Overview

All secrets are stored in **GitHub Actions Secrets** (`Settings > Secrets and variables > Actions`)
and referenced via `${{ secrets.NAME }}` in workflow files.

Production infrastructure secrets are injected by Pulumi at deploy time (see `infrastructure/pulumi/index.ts`).

## Rotation Schedule

| Secret                        | Purpose                                                                                                  | Cadence                         | Next Rotation |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------- |
| `DIGITALOCEAN_TOKEN`          | DigitalOcean API (deploy-services, Pulumi)                                                               | Quarterly                       | —             |
| `MBE_CLOUDFLARE_API_TOKEN`    | Cloudflare API (Pages deploys, KV, DNS, Pulumi)                                                          | Quarterly                       | —             |
| `DATABASE_URL`                | PostgreSQL connection string -- Pulumi config `mbe-infrastructure:databaseUrl`, **not** a GitHub secret  | Quarterly                       | —             |
| `R2_ACCESS_KEY_ID`            | Cloudflare R2 / S3-compat access key (Pulumi state backend)                                              | Quarterly                       | —             |
| `R2_SECRET_ACCESS_KEY`        | Cloudflare R2 / S3-compat secret key (Pulumi state backend)                                              | Quarterly                       | —             |
| `PULUMI_ACCESS_TOKEN`         | Pulumi Cloud API (if used; currently state is in R2)                                                     | Semi-annually                   | —             |
| `PULUMI_CONFIG_PASSPHRASE`    | Encrypts Pulumi stack config values                                                                      | Semi-annually                   | —             |
| `AUTH0_CLIENT_SECRET`         | Auth0 Machine-to-Machine secret (Pulumi provider)                                                        | Semi-annually                   | —             |
| `LANGFUSE_SECRET_KEY`         | Langfuse observability API secret                                                                        | Semi-annually                   | —             |
| `GITLEAKS_LICENSE`            | Gitleaks commercial license key (secret-scan workflow)                                                   | Semi-annually                   | —             |
| `SENTRY_DSN`                  | Sentry ingest endpoint (public identifier)                                                               | No rotation needed              | N/A           |
| `GITHUB_TOKEN`                | GitHub Actions built-in token                                                                            | Auto-rotated by Actions         | N/A           |
| `CLOUDFLARE_ACCOUNT_ID`       | Cloudflare account identifier (not a secret per se)                                                      | No rotation needed              | N/A           |
| `HEALTH_KV_NAMESPACE_ID`      | Cloudflare KV namespace ID for health checks                                                             | No rotation needed              | N/A           |
| `AUTH0_DOMAIN`                | Auth0 tenant domain (e.g. `xxx.auth0.com`)                                                               | No rotation needed              | N/A           |
| `AUTH0_CLIENT_ID`             | Auth0 application client ID (public)                                                                     | No rotation needed              | N/A           |
| `AUTH0_GEN_CLIENT_ID`         | Auth0 general SPA client ID (public)                                                                     | No rotation needed              | N/A           |
| `AUTH0_HOSPITALITY_CLIENT_ID` | Auth0 hospitality app client ID (public)                                                                 | No rotation needed              | N/A           |
| `TURBO_TOKEN`                 | Turborepo remote cache token                                                                             | Semi-annually                   | —             |
| `AGENT_API_URL`               | Agent service API base URL (not a credential)                                                            | No rotation needed              | N/A           |
| `AUTOMATION_PAT`              | PAT/bot-token for scheduled automation that pushes commits (see below)                                   | Semi-annually                   | —             |
| `RIALTO_PACKAGES_TOKEN`       | Classic PAT (`write:packages`) publishing `@mattbutlerengineering/rialto` to GitHub Packages (see below) | Optional -- unset skips publish | —             |

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

**Cadence:** Quarterly. **Human step -- do not run from an agent session.**

> **`DATABASE_URL` is not a GitHub Actions secret.** `gh secret list` has no such entry and no
> workflow reads `secrets.DATABASE_URL`. The only source of truth in this repo is the encrypted
> Pulumi config key `mbe-infrastructure:databaseUrl` (`infrastructure/pulumi/Pulumi.prod.yaml`),
> read by `infrastructure/pulumi/index.ts` via `config.requireSecret("databaseUrl")` and wired in as
> `DATABASE_URL` on the three API services and the three `db-migrate-*` pre-deploy jobs. Updating a
> GitHub secret of that name does nothing at runtime.

**What the database is** (from `infrastructure/pulumi/index.ts`, `infrastructure/migrate/`,
[ADR-026](adr/ADR-026-postgres-rls-venue-backstop.md) and `services/reservations/CLAUDE.md`):

- **DigitalOcean Managed PostgreSQL 16**, one cluster shared by users, reservations and agent. ADR-026
  measured Postgres 16.13 and states DO Managed Postgres grants no true superuser.
- **The connection user is the table owner, which ADR-026 names `doadmin`** ("`doadmin` in
  production"). The service process connects as that owner, and `db-migrate-reservations` receives the
  _same_ `databaseUrl` secret. The old runbook's `mbe_app` user does not appear anywhere in the repo.
  The repo cannot show the username inside the encrypted URL: confirm it (step 1) before relying on this.
- **RLS roles (ADR-026):** `app_reservations` is `NOLOGIN NOINHERIT`
  (`20261009000000_create_app_reservations_role`). `20261009000100_grant_app_reservations_and_force_rls`
  runs `GRANT app_reservations TO CURRENT_USER` (the migrate/owner role becomes a member so it can
  `SET ROLE`; never the reverse), grants `USAGE` on schema `public`, DML on ten tables (`venue_groups`,
  `venues`, `floor_plans`, `tables`, `guests`, `reservations`, `deposits`, `waitlist_entries`,
  `reservation_holds`, `venue_memberships`) and `EXECUTE` on `app_cross_venue_venues`,
  `app_resolve_venue_id`, `app_reservation_venue_ids_for_user`, then `FORCE ROW LEVEL SECURITY` on seven
  tables. Every app transaction starts with `SET LOCAL ROLE "app_reservations"`. A login role that
  lacks membership in `app_reservations` fails with `42501`, and one that cannot own or act as the
  owner breaks migrations. RLS policies admit the owner by `pg_has_role(current_user, relowner)`, so
  the replacement login must behave as a member of the owner.
- **No dual-credential overlap exists.** A DO database user has exactly one password, and resetting it
  invalidates the old one immediately. Do **not** reset the existing user's password (or run
  `ALTER USER ... PASSWORD`) first: every service would fail to connect until a deploy landed. Use a
  second login role instead.

**`pulumi-up` will NOT update the live `DATABASE_URL`.** `infrastructure/pulumi/index.ts:299` sets
`ignoreChanges: ["spec.features", "spec.jobs", "spec.services"]` on the DO App, and its own comment says env
vars "remain exactly as unmanaged as they were" (full reconciliation is #3277). A changed `databaseUrl`
produces no diff on the three services or the three `db-migrate-*` jobs, so `pulumi-up` can report success
while the app keeps the old URL. The working update path is the DO app spec, the same pattern
`.github/workflows/deploy-services.yml:246-289` uses for `SENTRY_DSN`: `doctl apps spec get` -> edit the
value with `yq` -> `doctl apps update --spec` -> `doctl apps create-deployment`. `pulumi config set` is kept
only to keep config in sync (and for when #3277 lands). Do not retire the old role until step 6 proves the
new one is in use.

1. **Identify the current login role and database.** From a trusted workstation (never CI logs), run
   `pulumi config get databaseUrl --stack prod` with `PULUMI_CONFIG_PASSPHRASE` set, and note the
   user, host, port and database name (do not paste the URL anywhere). Connect with `psql` and run:
   ```sql
   SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
   SELECT relowner::regrole FROM pg_class WHERE oid = 'public.venues'::regclass;
   SELECT roleid::regrole, member::regrole FROM pg_auth_members
    WHERE roleid = 'app_reservations'::regrole;
   ```
   Record the owner and the members of `app_reservations`. The new role must reproduce them.
2. **Create a second login role** in the DO console (Databases > cluster > Users & Databases), name it
   `mbe-svc-YYYYMM`. Do not touch the existing user. Then, as the owner, replicate its grants and
   memberships (substitute the owner and role names found in step 1):
   ```sql
   GRANT "<owner>" TO "mbe-svc-YYYYMM";
   GRANT app_reservations TO "mbe-svc-YYYYMM";
   ```
   On PG15+ the first `GRANT`, run as non-superuser `doadmin`, may fail with `42501` (no implicit ADMIN
   OPTION). If it does, the second-role path is blocked: **STOP and do nothing further** (drop the unused
   new user in the DO console) and escalate.
   Prefer `ALTER ROLE "mbe-svc-YYYYMM" IN DATABASE "<db>" SET role = '<owner>';` so objects created by
   migrations stay owned by the original owner. Verify as the new role, without touching production data:
   ```sql
   SELECT pg_has_role(current_user, '<owner>', 'USAGE');             -- expect true
   SELECT pg_has_role(current_user, 'app_reservations', 'USAGE');    -- expect true
   BEGIN; SET LOCAL ROLE "app_reservations"; SELECT count(*) FROM venues; ROLLBACK;
   ```
   If either `pg_has_role` is false, or `SET LOCAL ROLE` raises `42501`, stop and fix grants; do not
   proceed. Leave any new grants additive: no `BYPASSRLS` (not creatable on DO, per ADR-026).
3. **Build the URL** for the new role: `postgresql://mbe-svc-YYYYMM:<password>@<host>:<port>/<db>?sslmode=require`
   (host, port and database from step 1; the DO console shows the pooled and direct hosts, and migrations
   need the same kind of host as the current URL).
4. **Update the live app spec (this is what changes runtime).** Needs `DO_APP_ID` and doctl auth:
   ```bash
   doctl apps spec get "$DO_APP_ID" > spec.yaml   # holds secret values: never commit it
   ```
   Confirm `DATABASE_URL` is held as a `SECRET` env on `users-api`, `reservations-api`, `agent-api` and on
   the three `db-migrate-*` jobs. Save a copy of the old spec for rollback. Replace the value on all six
   entries with `yq` (feed the URL from an env var read from stdin, not the command line), then
   `doctl apps update "$DO_APP_ID" --spec spec.yaml` and `doctl apps create-deployment "$DO_APP_ID" --wait`.
   Delete the spec files afterwards.
5. **Keep Pulumi config in sync.** Pipe the value on stdin; never put it on the command line:
   ```bash
   cd infrastructure/pulumi
   pbpaste | pulumi config set --secret databaseUrl --stack prod   # reads the value from stdin
   ```
   This rewrites the encrypted `mbe-infrastructure:databaseUrl` entry in `Pulumi.prod.yaml`. Commit that
   diff and open a PR; it lands via `pulumi-up` but does not change the running services (see above). The
   `.claude` PreToolUse hook blocks agent edits to `Pulumi.prod.yaml` on purpose, so this is a human step.
   Pulumi state lives in R2 and needs `PULUMI_CONFIG_PASSPHRASE` plus the R2 credentials.
6. **Verify the new role is in use.** Health endpoints that run a real query (not `/health`, which is
   liveness-only; see gotchas, "Prisma + DO migrate"):
   - `/api/v1/users/health` (users-api, runs `$queryRaw`; read `checks.database.status`, `ok` or `error`. Top-level `degraded` can come from any failed check such as auth0, pool or slow_queries)
   - `/api/v1/reservations/health` (reservations-api)
   - `/api/gen/health` (agent-api)

   Then confirm the live sessions: `SELECT usename, count(*) FROM pg_stat_activity GROUP BY 1;` shows
   connections for `mbe-svc-YYYYMM` and none from the services for the old user. Your own `psql` session
   will always appear under the old user if you connected with it, so exclude `pid = pg_backend_pid()` and
   filter by `application_name`/`client_addr`. A reservation read for a real venue must
   return rows: a broken RLS grant answers 404/empty, not 5xx (see `services/reservations/CLAUDE.md`).

7. **Retire the old role** only after step 6 shows zero connections from it, ideally a day later:
   remove its password or delete the user in the DO console.

**Rollback (before step 7):** a Pulumi config revert alone is a no-op under `ignoreChanges`. Restore the
OLD `DATABASE_URL` in the live spec by the same route (`doctl apps spec get` -> `yq` -> `doctl apps update
--spec`, or use the saved old spec), then `doctl apps create-deployment "$DO_APP_ID" --wait`.
Revert the Pulumi config PR afterwards to keep config in sync.

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
4. Redeploy services that use `@mbe/service-bootstrap`.
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
   `workflow` scope, on the bot account. A fine-grained PAT needs **Contents, Pull requests, Issues,
   Actions and Workflows** all at read and write, scoped to this repository only.
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

### RIALTO_PACKAGES_TOKEN

**Cadence:** Optional -- unset intentionally skips publish; rotate semi-annually once set.

**This secret is optional (Matt, refs #3322 follow-up):** nothing outside this monorepo installs
`@mattbutlerengineering/rialto` -- every consumer (`apps/*`, other `packages/*`) pulls it in via
`workspace:*`. Publishing to GitHub Packages is not needed for any current consumer, so it's
opt-in: leave this secret unset and `release.yml` skips the publish step and exits 0, rather than
failing the whole Release workflow on every push to main.

**Why `GITHUB_TOKEN` doesn't work here, if you do want to publish:** `@mattbutlerengineering/rialto`
was hand-published to GitHub Packages in April with no `repository` field set, so
npm.pkg.github.com never linked the package to this repo. `GITHUB_TOKEN` can only read/write
packages GitHub Packages considers linked to the repo that's running it, so `release.yml`'s
`changeset publish` step 403s against an orphaned package with `E403 permission_denied:
read_package` (runs 35961368353, attempts 1-3). A PAT authenticating as a real identity with
explicit access to the package sidesteps the link requirement entirely.

To resume publishing:

1. Generate a classic PAT (fine-grained PATs cannot scope to GitHub Packages publish as of this
   writing) with the `write:packages` scope only.
2. In GitHub, set the repo secret: `gh secret set RIALTO_PACKAGES_TOKEN --body "<token>"`.
3. **Verify:** Trigger `release.yml` on a run with nothing to version (so it takes the publish
   path); confirm the "Create Version Packages PR or publish to GitHub Packages" step succeeds
   with no `E403`/`E401`.
4. Once set, rotate semi-annually: revoke the old token before generating a replacement.

Used by `release.yml`'s `publish-script` (`scripts/release-publish.sh`), which emits
`::notice::RIALTO_PACKAGES_TOKEN is not set -- skipping publish` and exits 0 when this secret is
missing, rather than failing the run or surfacing a cryptic registry error mid-publish.

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

| Secret                | Purpose                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | PostgreSQL connection string (Pulumi config `mbe-infrastructure:databaseUrl`; see its runbook for a caveat on `ignoreChanges`) |
| `SENTRY_DSN`          | Sentry error reporting endpoint                                                                                                |
| `LANGFUSE_SECRET_KEY` | Observability trace export                                                                                                     |
