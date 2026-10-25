# @mbe/service-bootstrap reference

File map and full usage examples, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a service-bootstrap file is read. The rules (plugin order, feature-flag header, observability load order, env vars, commands) stay in CLAUDE.md. The source of truth is `src/`.

## Structure

```
src/
├── index.ts                    # Re-exports
├── create-service-app.ts       # Fastify app factory
├── create-service-app.test.ts
├── apply-versioning.ts         # API-Version / Link / Sunset header policy (ADR-002)
├── classify-error.ts           # Maps a thrown error to { status, title, detail, extensions }
├── error-handler.ts            # Fastify error-handler plugin — wraps classify-error into RFC 7807 problem-details bodies
├── readiness-routes.ts         # registerReadinessRoutes — /ready probe backed by observability/ checks
├── feature-flags.ts            # Inline feature-flag evaluation (former @mbe/feature-flags)
├── feature-flags.test.ts
├── start-service-server.ts     # Telemetry + listen + graceful shutdown
├── start-service-server.test.ts
├── observability/              # OTel SDK, request-id, readiness, error-rate + rate-limit monitors, Auth0 JWKS probe (folded in from the former observability package)
├── health.ts                   # createLatencyTracker, checkAuth0
├── health.test.ts
└── health-routes.ts            # registerHealthRoutes
```

## createServiceApp

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

## Health

```typescript
import { createLatencyTracker, checkAuth0, registerHealthRoutes } from "@mbe/service-bootstrap";

const tracker = createLatencyTracker();
tracker.record(42);
const { isAnomaly } = tracker.checkAnomaly(150); // true if >3x rolling avg

const auth0 = await checkAuth0(); // { status: "ok"|"degraded", latency }
registerHealthRoutes(app, { tracker, prisma: db.prisma });
```
