# @mbe/api-versioning

Fastify plugin for API versioning and deprecation headers.

## Structure

```
src/
├── fastify.ts     # Plugin implementation and decorators
└── index.ts       # Public exports
```

## Plugin Options

```typescript
interface ApiVersioningOptions {
  currentVersion: string; // e.g. "v1"
  successorVersion?: string; // Optional: next version path
  sunsetMonthsFromNow?: number; // Default: 6
}
```

## Usage

```typescript
import { apiVersioningPlugin } from "@mbe/api-versioning";

await fastify.register(apiVersioningPlugin, {
  currentVersion: "v1",
  successorVersion: "v2",
});
```

## Decorations

The plugin decorates the Fastify instance and reply:

- `fastify.apiVersion`: Current version string.
- `fastify.successorVersion`: Next version string.
- `fastify.sunsetDate`: Calculated UTC sunset date.
- `reply.addDeprecationHeaders()`: Manually trigger `Deprecation` and `Sunset` headers.

## Patterns

- **Auto-versioning**: If `successorVersion` is omitted, it defaults to incrementing the version number (e.g., `v1` -> `v2`).
- **Hook Injection**: Automatically adds `API-Version` and `Link` headers on every send.
- **RFC Compliance**: Headers follow common standards for API deprecation.

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run Vitest tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
