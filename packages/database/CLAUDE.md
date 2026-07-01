# @mbe/database

Prisma/Postgres connection pool wrapper. Creates a `DatabaseInstance` that manages a Prisma client backed by a `pg.Pool` with slow-query tracking, pool metrics, and health status.

## Structure

```
src/
├── index.ts        # createDatabase — Prisma client + pg.Pool + monitoring
├── list-utils.ts   # parsePaginationQuery, createListResponseSchema
├── validators.ts   # validateDateString, validatePartySize, validateDateRange, validateEnum — query-param validation
└── testing.ts      # createMockDatabaseService, createMockDatabaseModule — mocks for the "./testing" subpath export
```

## createDatabase

```typescript
import { createDatabase } from "@mbe/database";
import { PrismaClient } from "@prisma/client";

const db = createDatabase<PrismaClient>(PrismaClient);
```

`createDatabase` accepts a PrismaClient constructor and an optional `DATABASE_URL`. It creates a `pg.Pool` with `PRISMA_CONNECTION_LIMIT` (default 5), wraps the Prisma client with query monitoring, and returns:

| Export              | Type                   | Purpose                                  |
| ------------------- | ---------------------- | ---------------------------------------- |
| `prisma`            | `T` (Prisma client)    | Query interface with $extends monitoring |
| `getSlowQueryStats` | `() => SlowQueryStats` | Count + slowest duration (last 5 min)    |
| `getPoolStats`      | `() => PoolStats`      | Pool utilization metrics                 |
| `getPoolMetrics`    | `() => PoolMetrics`    | Pool + degradation check                 |
| `getServiceStatus`  | `() => ServiceStatus`  | `"ok"` or `"degraded"`                   |
| `shutdown`          | `() => Promise<void>`  | Disconnect Prisma + end pool             |

Health status degrades when: slow queries exceed 10 in 5 min, or pool utilization exceeds 80%.

## list-utils

```typescript
import { parsePaginationQuery, createListResponseSchema } from "@mbe/database";

// Pagination
const { page, limit } = parsePaginationQuery({ page: "2", limit: "25" });

// Response schema (Fastify)
const schema = createListResponseSchema("$ref:User");
```

## Testing helpers

`src/testing.ts` is published as the `@mbe/database/testing` subpath export. It provides typed mocks (`createMockDatabaseService`, `createMockDatabaseModule`) for a service's database module — a stubbed `prisma` (always includes `$queryRaw`) plus `getSlowQueryStats`/`getServiceStatus`/`getPoolMetrics` — so consuming services can mock their `database.js` module in tests without re-implementing the shape by hand:

```typescript
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
```

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
