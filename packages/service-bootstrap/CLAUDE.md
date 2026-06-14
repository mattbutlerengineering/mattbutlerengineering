# @mbe/service-bootstrap

Fastify service bootstrap. Provides `createServiceApp` (fully-configured Fastify instance with all shared plugins) and `startServiceServer` (telemetry init + graceful shutdown). Services call these instead of duplicating bootstrap code.

## Structure

```
src/
├── index.ts                    # Re-exports
├── create-service-app.ts       # Fastify app factory
├── create-service-app.test.ts
├── feature-flags.ts            # Inline feature-flag evaluation (former @mbe/feature-flags)
├── feature-flags.test.ts
├── start-service-server.ts     # Telemetry + listen + graceful shutdown
├── start-service-server.test.ts
├── health.ts                   # createLatencyTracker, checkAuth0
├── health.test.ts
└── health-routes.ts            # registerHealthRoutes
```

## createServiceApp

Registers all shared plugins in order:

1. **JSON schemas** — service-specific schemas via `registerSchemas` callback
2. **CORS** — validates against `*.mattbutlerengineering.com` + localhost in dev
3. **Request ID** — `x-request-id` propagation (`@mbe/observability`)
4. **Error rate tracking** — per-endpoint error rates
5. **Feature flags** — `x-feature-flags` header → `request.features`
6. **Rate limiting** — 100 req/min per IP
7. **Swagger UI** — `/docs`
8. **Scalar API Reference** — `/reference`
9. **Auth** — Auth0 JWT verification (`@mbe/auth`)
10. **Sentry** — error handler (`@mbe/sentry/node`)
11. **API versioning** — `API-Version` / `Link` / `Sunset` headers

```typescript
import { createServiceApp, startServiceServer } from "@mbe/service-bootstrap";

const app = await createServiceApp({
  swagger: { title: "Users API", description: "...", serverUrl: "https://api.mbe.dev" },
});

app.get("/api/v1/users/me", { preHandler: requireAuth }, async (req) => {
  req.features.check("new-dashboard"); // inline feature flags
});

startServiceServer({
  serviceName: "users",
  port: 3001,
  buildApp: () => Promise.resolve(app),
});
```

## Feature Flags

Inlined from the former `@mbe/feature-flags` package. Read from `x-feature-flags` header set by edge router:

```typescript
request.features.check("flag-name");                     // 100% rollout
request.features.checkForUser("flag-name", userId);      // percentage rollout
```

## Health

```typescript
import { createLatencyTracker, checkAuth0, registerHealthRoutes } from "@mbe/service-bootstrap";

const tracker = createLatencyTracker();
tracker.record(42);
const { isAnomaly } = tracker.checkAnomaly(150); // true if >3x rolling avg

const auth0 = await checkAuth0(); // { status: "ok"|"degraded", latency }
registerHealthRoutes(app, { tracker, prisma: db.prisma });
```

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
