# @mbe/sentry

Sentry error tracking for Node.js services and React apps. Exposes three entry points: base config, Fastify plugin for backend error capture, and React integration for frontend error boundaries.

## Structure

```
src/
├── index.ts    # resolveConfig, SentryConfig type
├── config.ts   # Environment-based config resolution
├── config.test.ts
├── node.ts     # initSentry, sentryFastifyPlugin (Fastify error handler)
├── node.test.ts
├── react.ts    # initSentry, handleErrorBoundary, reportApiError
└── react.test.ts
```

## Exports

| Entry               | Key exports                                           |
| ------------------- | ----------------------------------------------------- |
| `@mbe/sentry`       | `resolveConfig`, `SentryConfig`                       |
| `@mbe/sentry/node`  | `initSentry`, `sentryFastifyPlugin`                   |
| `@mbe/sentry/react` | `initSentry`, `handleErrorBoundary`, `reportApiError` |

## Fastify Plugin (node)

Registered by `createServiceApp` (`@mbe/service-bootstrap`). Captures unhandled errors and notable 4xx/5xx responses:

- **500+**: captured via explicit error handler (masks real message from client) and `onResponse` hook
- **409/422/429**: captured as warning-level messages
- **401/403/404**: silently ignored (expected client errors)

```typescript
import { initSentry, sentryFastifyPlugin } from "@mbe/sentry/node";

initSentry({ serviceName: "reservations" });
fastify.register(sentryFastifyPlugin);
```

## React Integration

```typescript
import { initSentry, handleErrorBoundary, reportApiError } from "@mbe/sentry/react";

initSentry({ appName: "hospitality", dsn: process.env.SENTRY_DSN });

// In error boundary
componentDidCatch(error, info) {
  handleErrorBoundary(error, info);
}

// Report API errors with severity classification
reportApiError(apiError);
```

`reportApiError` classifies by status code: 5xx `captureException`, 401/403 `captureMessage` (warning), other 4xx breadcrumb only.

## Config Resolution

`resolveConfig(dsn)` reads `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE` from env. Sentry is no-op when `SENTRY_DSN` is unset.

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
