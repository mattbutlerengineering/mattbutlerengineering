# @mbe/observability

OpenTelemetry SDK wrapper for Node.js services. Provides tracing, metrics, and request ID propagation.

## SDK Initialization

`initTelemetry({ serviceName, serviceVersion? })` creates a `NodeSDK` instance with OTLP/HTTP exporters. Must be called **before** importing Fastify or HTTP modules (the SDK monkey-patches Node's HTTP stack).

Instrumentations: `http`, `fastify`, `pino` only. No auto-instrumentation suite (avoids DNS/net/fs noise and ~8 MB heap overhead). Uses OTLP/HTTP, not gRPC (saves 8-12 MB from `@grpc/grpc-js`).

Resource attributes: service name, version, deployment environment, `deploy.sha`, `deploy.pr_number`, `deploy.author`.

### Filtered Paths

`shouldIgnoreRequest` excludes `/health`, `/docs`, `/reference` (and sub-paths) from tracing. Application routes like `/api/v1/*` are always traced.

## Request ID Middleware

`createRequestIdMiddleware(options?)` is a Fastify plugin that:

- Reads `x-request-id` header from incoming requests (or generates a UUID)
- Sets `request.id` for downstream logging and tracing

Helpers: `getRequestId(request)` extracts the ID; `logWithRequestId(logger, id, msg, ctx)` adds it to structured logs.

## Environment Variables

| Variable                      | Purpose                                             |
| ----------------------------- | --------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Grafana Cloud OTLP gateway URL                      |
| `OTEL_EXPORTER_OTLP_HEADERS`  | `Authorization=Basic <base64>`                      |
| `OTEL_SDK_DISABLED`           | Set `"true"` to disable (tests, local dev)          |
| `NODE_ENV`                    | Maps to `deployment.environment` resource attribute |
| `DEPLOY_SHA`                  | Git SHA of current deploy                           |
| `DEPLOY_PR_NUMBER`            | PR number that triggered deploy                     |
| `DEPLOY_AUTHOR`               | Author of the deploy                                |

## Package Exports

- `@mbe/observability` — main entry (initTelemetry, request ID middleware, readiness, error-rate monitor, rate-limit monitor)

## Service Integration Pattern

```typescript
// src/telemetry.ts — must be first import in entry point
import { initTelemetry } from "@mbe/observability";
const sdk = initTelemetry({ serviceName: "reservations" });
sdk.start();

// src/app.ts
import { createRequestIdMiddleware } from "@mbe/observability";
app.register(createRequestIdMiddleware());
```

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
