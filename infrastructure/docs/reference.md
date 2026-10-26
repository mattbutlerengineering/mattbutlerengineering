# Infrastructure reference

DO App Platform component table, edge-router route map and DNS records, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time an infrastructure file is read. The rules (ingress order, deploy triggers, Service Binding pattern, gotchas, commands) stay in CLAUDE.md. The source of truth is `pulumi/index.ts` and `worker/edge-router.js`.

## DigitalOcean App Platform components

Single DO app (`mattbutlerengineering-api`) with 3 services + 3 per-service pre-deploy migration jobs:

| Component                       | Dockerfile                          | Port | Ingress Prefix                                                |
| ------------------------------- | ----------------------------------- | ---- | ------------------------------------------------------------- |
| `users-api`                     | `services/users/Dockerfile`         | 3001 | `/api/v1/users`                                               |
| `reservations-api`              | `services/reservations/Dockerfile`  | 3004 | `/api` (catch-all)                                            |
| `agent-api`                     | `services/agent/Dockerfile`         | 3003 | `/api/gen`, `/v1/sessions`, `/v1/orchestrate`, `/v1/webhooks` |
| `db-migrate-users` (job)        | `infrastructure/migrate/Dockerfile` | —    | PRE_DEPLOY                                                    |
| `db-migrate-reservations` (job) | `infrastructure/migrate/Dockerfile` | —    | PRE_DEPLOY                                                    |
| `db-migrate-agent` (job)        | `infrastructure/migrate/Dockerfile` | —    | PRE_DEPLOY                                                    |

## Edge router routes

Worker that routes all `mattbutlerengineering.com` traffic:

```
www.*         → 301 redirect to non-www
/dashboard*   → 301 redirect to /hospitality (legacy)
/api/*        → HTTP subrequest to api.mattbutlerengineering.com (DO)
/hospitality* → Service Binding → HOSPITALITY Worker
/rialto*      → Service Binding → RIALTO Worker
/gen*         → Service Binding → GEN Worker
/*            → Service Binding → MARKETING Worker
```

## Cloudflare DNS records

- `@` → `AAAA 100::` (proxied, Worker handles)
- `www` → CNAME to root (proxied, Worker redirects)
- `api` → CNAME to DO app (NOT proxied — DO needs domain verification)
