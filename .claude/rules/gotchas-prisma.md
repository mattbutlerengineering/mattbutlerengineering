---
paths:
  - "services/*/prisma/**"
  - "services/*/prisma.config.ts"
  - "infrastructure/migrate/**"
---

# Gotchas — Prisma + DO migrate

Path-scoped sibling of [gotchas.md](./gotchas.md#prisma--do-migrate).

- **Prisma generated clients are NOT committed** — `services/*/src/generated/` is gitignored and produced by each service's `postinstall`. If one slips in, `git rm -r --cached` it.
- **The migrate Dockerfile must pin the same Prisma major as `@prisma/client`** — Prisma 7 rejects schema-level `url` (P1012) while the Prisma 6 CLI requires it. On Prisma 7 the URL comes from per-service `prisma.config.ts`.
- **A globally installed Prisma 7 needs `ENV NODE_PATH=/usr/local/lib/node_modules`**, or the config loader fails with `Cannot find module 'prisma/config'`.
- **Verify prod DB connectivity via `/api/v1/users/health`, not `/health`** — `/health` is liveness only.
