# @mbe/sentry

Sentry error monitoring wrapper with separate entry points for Node.js services and React apps.

## Entry Points

| Import | Platform | Use |
|--------|----------|-----|
| `@mbe/sentry` | Universal | Config types and `resolveConfig` only |
| `@mbe/sentry/node` | Node.js | `initSentry`, `sentryFastifyPlugin` |
| `@mbe/sentry/react` | Browser | `initSentry`, `handleErrorBoundary` |

## Config Resolution

`resolveConfig(dsn)` returns `SentryConfig` with:
- `enabled`: `true` only when DSN is a non-empty string
- `environment`: `SENTRY_ENVIRONMENT` > `NODE_ENV` > `"development"`
- `release`: `SENTRY_RELEASE` > `npm_package_version`

Works in both Node and browser (guards `process` access). No DSN = Sentry fully disabled.

## Node.js — Fastify Plugin

`initSentry({ serviceName })` initializes the SDK. Disables OTel integration (`skipOpenTelemetrySetup: true`) since `@mbe/observability` handles tracing separately. Traces sample rate is 0 (traces come from OTel).

`sentryFastifyPlugin` registers two hooks:

1. **Error handler** — captures thrown exceptions with request context (method, URL, requestId, user). Returns RFC 9457 Problem Details via `createProblemDetails`. Flags the reply with `__sentryErrorCaptured` to prevent double-capture. 500s return generic "Internal Server Error" to clients.

2. **onResponse hook** — catches status-based errors not thrown as exceptions:
   - **5xx**: captured as errors (unless already caught by error handler)
   - **409, 422, 429**: captured as warnings (notable client errors)
   - **400, 401, 403, 404**: silently ignored (expected client errors)

User context is extracted from `request.user` (set by `@mbe/auth` plugin) without importing auth types directly.

## React — Error Boundary

`initSentry({ appName, dsn })` initializes with:
- Session replay on errors only (`replaysOnErrorSampleRate: 1.0`)
- No session replay sampling in normal sessions
- App name tagged for filtering

`handleErrorBoundary(error, errorInfo)` captures React error boundary crashes with `componentStack` as extra context. Wire it to your error boundary's `onError` prop.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | DSN string; empty/missing disables Sentry entirely |
| `SENTRY_ENVIRONMENT` | Override environment (falls back to `NODE_ENV`) |
| `SENTRY_RELEASE` | Release version (falls back to `npm_package_version`) |

## Integration Pattern

```typescript
// Node service entry point
import { initSentry, sentryFastifyPlugin } from "@mbe/sentry/node";
initSentry({ serviceName: "reservations" });
app.register(sentryFastifyPlugin);

// React app entry point
import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
initSentry({ appName: "hospitality", dsn: import.meta.env.VITE_SENTRY_DSN });
```
