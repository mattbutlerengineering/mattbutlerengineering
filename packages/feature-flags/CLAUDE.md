# @mbe/feature-flags

Lightweight feature flag evaluation library. Flags are stored in Cloudflare KV (managed by the edge router) and injected into service requests via the `X-Feature-Flags` header.

## Structure

```
src/
├── index.ts    # Types, FeatureContext factory, evaluation helpers (private)
└── plugin.ts   # Fastify plugin — decorates request.features
```

## API

### Types

```typescript
interface FeatureFlag {
  enabled: boolean;
  percentage: number; // 0-100 rollout percentage
}

interface FeatureContext {
  check(flagName: string): boolean; // 100% rollout only
  checkForUser(flagName: string, userId: string): boolean; // percentage rollout
}
```

### Exports

| Export                     | Signature                          | Purpose                                                              |
| -------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `createFeatureFlagsPlugin` | `() => FastifyPluginAsync`         | Fastify plugin: parses the header once per request, sets `request.features` |
| `createFeatureContext`     | `(header) => FeatureContext`       | Build a context from a raw header value (tests, non-Fastify callers) |
| `FEATURE_FLAGS_HEADER`     | `"x-feature-flags"`                | Header name constant                                                  |

Parsing is safe — missing, invalid, or repeated headers all evaluate to "flags disabled", never a throw.

### Percentage Rollout

`checkForUser` uses a deterministic hash of the seed string (typically user ID) to decide inclusion. The same seed always gets the same result for a given percentage, ensuring consistent user experience.

## Usage

### In Fastify services

The plugin is registered automatically by `createServiceApp` (`@mbe/service-bootstrap`) — routes need no imports:

```typescript
if (request.features.check("new-booking-flow")) {
  // New behavior
}
```

For non-Fastify callers or unit tests, build a context directly:

```typescript
import { createFeatureContext } from "@mbe/feature-flags";

const features = createFeatureContext('{"new-booking-flow":{"enabled":true,"percentage":100}}');
features.check("new-booking-flow"); // true
```

### Flag lifecycle

1. **Create/update**: `PUT /api/flags/<name>` on the edge router (requires `ADMIN_TOKEN`)
2. **Storage**: Cloudflare KV (`HEALTH_STATE` namespace, key `flags/all`)
3. **Distribution**: Edge router reads KV, evaluates per-request, sets `X-Feature-Flags` header
4. **Consumption**: `createServiceApp` registers the plugin; routes read `request.features`

## Commands

```bash
pnpm build       # Compile TypeScript
pnpm lint        # ESLint
pnpm typecheck   # Type check
pnpm test        # Vitest
```
