---
name: new-service
description: Scaffold a new Fastify + Prisma backend service in the mattbutlerengineering monorepo. Creates the service directory, package.json, app bootstrap, Prisma schema, health route, tests, and updates Turborepo config.
user-invocable: true
---

# Scaffold New Service

Creates a new backend service following the exact patterns used by `services/users`, `services/agent`, and `services/reservations`.

## Arguments

The user should provide:
- **Service name** (kebab-case, e.g., `payments`) — becomes `services/<name>/`
- **Port number** — next in sequence (current: 3000 marketing, 3001 users, 3002 hospitality, 3003 agent, 3004 reservations, 3005+ available)
- **Auth required?** — whether routes need JWT verification via `@mbe/auth`

## Scaffold Checklist

### 1. Create directory structure

```
services/<name>/
├── src/
│   ├── app.ts              # Fastify app builder
│   ├── index.ts             # Entry point
│   ├── routes/
│   │   └── health.ts        # GET /health endpoint
│   └── schemas/
│       └── index.ts         # Schema registration
├── prisma/
│   └── schema.prisma        # Prisma schema
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env                     # Local dev env vars
└── CLAUDE.md                # Service-specific context
```

### 2. File templates

**package.json** — use `@mbe/<name>-service` naming:
```json
{
  "name": "@mbe/<name>-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:migrate:status": "prisma migrate status",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.0",
    "@fastify/swagger": "^9.0.0",
    "@mbe/types": "workspace:*",
    "@prisma/client": "^6.0.0",
    "@scalar/fastify-api-reference": "^1.44.1",
    "fastify": "^5.8.1",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@mbe/config": "workspace:*",
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^4.0.18",
    "prisma": "^6.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.3",
    "vitest": "^4.0.18"
  }
}
```

If auth required, also add:
```json
"@mbe/auth": "workspace:*",
"jose": "^5.2.0"
```

**tsconfig.json**:
```json
{
  "extends": "@mbe/config/typescript/node",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

**vitest.config.ts**:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
```

**prisma/schema.prisma**:
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**src/index.ts**:
```typescript
import { buildApp } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "<port>", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const fastify = await buildApp();
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server running at http://${HOST}:${PORT}`);
    fastify.log.info(`API docs at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
```

**src/app.ts** — follow the exact pattern from `services/users/src/app.ts`:
- Register `@fastify/cors`, `@fastify/swagger`, `@scalar/fastify-api-reference`
- Register schemas, then routes
- Health routes at root, domain routes at `/api/v1/<name>`
- If auth required, register `@mbe/auth` plugin

**src/routes/health.ts** — standard health endpoint (copy from any existing service).

**.env**:
```
DATABASE_URL=postgresql://mbe:mbe_dev_password@localhost:5432/mbe
```
If auth required, add:
```
AUTH_AUTHORITY=https://dev-ytbgmz5ls3wh4xdx.us.auth0.com
AUTH_AUDIENCE=https://api.mattbutlerengineering.com
```

### 3. Post-scaffold updates

After creating the service directory:

1. **Install deps**: `pnpm install` from root
2. **Generate Prisma client**: `cd services/<name> && pnpm db:generate`
3. **Update root dev:local script** in root `package.json` if it needs db:push for the new service
4. **Update deploy-services.yml** — add `services/<name>/**` to the paths trigger
5. **Update CLAUDE.md port table** — add the new port assignment
6. **Create service CLAUDE.md** — document domain model, env vars, specific patterns
7. **Create a skill** at `.claude/skills/<name>-service/SKILL.md` for service-specific guidance

### 4. Verify

```bash
cd services/<name>
pnpm dev          # Should start on assigned port
pnpm test         # Should pass (health route test)
pnpm typecheck    # Should pass
pnpm lint         # Should pass
```
