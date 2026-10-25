# @mbe/service-bootstrap

Fastify service bootstrap. Provides `createServiceApp` (fully-configured Fastify instance with all shared plugins) and `startServiceServer` (telemetry init + graceful shutdown). Services call these instead of duplicating bootstrap code.

## Reference

`src/` file map and full `createServiceApp` / `startServiceServer` and health usage examples: [docs/reference.md](./docs/reference.md).

## createServiceApp

Registers all shared plugins in order:

1. **JSON schemas** — service-specific schemas via `registerSchemas` callback
2. **CORS** — validates against `*.mattbutlerengineering.com` + localhost in dev
3. **Request ID** — `x-request-id` propagation (`observability/request-id.ts`)
4. **Error rate tracking** — per-endpoint error rates
5. **Feature flags** — `x-feature-flags` header → `request.features`
6. **Rate limiting** — 100 req/min per IP
7. **Swagger UI** — `/docs`
8. **Scalar API Reference** — `/reference`
9. **Auth** — Auth0 JWT verification (`@mbe/auth`)
10. **Sentry** — error handler (`@mbe/sentry/node`)
11. **Error handler** — maps thrown errors (incl. Prisma `P2025`/`P2002`/`P2003`) to RFC 7807 problem-details bodies (`error-handler.ts`)
12. **API versioning** — `API-Version` / `Link` / `Sunset` headers

Usage example: [docs/reference.md](./docs/reference.md#createserviceapp).

## Feature Flags

Inlined from the former `@mbe/feature-flags` package. Read from `x-feature-flags` header set by edge router:

```typescript
request.features.check("flag-name"); // 100% rollout
request.features.checkForUser("flag-name", userId); // percentage rollout
```

## Health

`createLatencyTracker` (anomaly = >3x rolling avg), `checkAuth0` and `registerHealthRoutes`, all exported from the package root. Example: [docs/reference.md](./docs/reference.md#health).

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```

## Observability (`src/observability/`)

Folded in from the former observability package (#7106). Internal: `src/observability/index.ts` is a private barrel, not part of the package's public API. ADR-009 `/health` vs `/ready` contract is unchanged.

- `initTelemetry({ serviceName, serviceVersion? })` (`sdk.ts`) creates a `NodeSDK` with OTLP/HTTP exporters and `http`, `fastify`, `pino` instrumentations only. It must run **before** Fastify/HTTP modules load, which is why `start-service-server.ts` loads it via a dynamic `await import(...)`. `shouldIgnoreRequest` excludes `/health`, `/docs`, `/reference` from tracing.
- Build identity (`resolveBuildInfo`, `DEPLOY_SHA` else `"unknown"`) lives in `@mbe/sentry` (`build-info.ts`) so the browser-safe `@mbe/sentry/react` does not depend on this package. It feeds OTel `service.version`, Sentry `release` and `/health` `version`.
- `createRequestIdMiddleware` — `x-request-id` read-or-generate onto `request.id`.
- Env: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SDK_DISABLED`, `NODE_ENV`, `DEPLOY_SHA`, `DEPLOY_PR_NUMBER`, `DEPLOY_AUTHOR`.
