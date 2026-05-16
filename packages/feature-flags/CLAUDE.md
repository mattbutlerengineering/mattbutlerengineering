# @mbe/feature-flags

Lightweight feature flag evaluation library. Flags are stored in Cloudflare KV (managed by the edge router) and injected into service requests via the `X-Feature-Flags` header.

## Structure

```
src/
└── index.ts   # Types, evaluation functions, header parsing
```

## API

### Types

```typescript
interface FeatureFlag {
  enabled: boolean;
  percentage: number;  // 0-100 rollout percentage
}

type FeatureFlagMap = Record<string, FeatureFlag>;
```

### Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `isEnabled` | `(flags, flagName) => boolean` | Check if flag is enabled (100% rollout only) |
| `isEnabledForSeed` | `(flags, flagName, seed) => boolean` | Check with percentage rollout using consistent hashing |
| `parseFeatureFlags` | `(header) => FeatureFlagMap` | Parse `X-Feature-Flags` JSON header (safe, returns `{}` on failure) |

### Percentage Rollout

Uses a deterministic hash of the seed string (typically user IP or ID) to decide inclusion. The same seed always gets the same result for a given percentage, ensuring consistent user experience.

## Usage

### In Fastify services

```typescript
import { parseFeatureFlags, isEnabled } from "@mbe/feature-flags";

const flags = parseFeatureFlags(request.headers["x-feature-flags"]);
if (isEnabled(flags, "new-booking-flow")) {
  // New behavior
}
```

### Flag lifecycle

1. **Create/update**: `PUT /api/flags/<name>` on the edge router (requires `ADMIN_TOKEN`)
2. **Storage**: Cloudflare KV (`HEALTH_STATE` namespace, key `flags/all`)
3. **Distribution**: Edge router reads KV, evaluates per-request, sets `X-Feature-Flags` header
4. **Consumption**: Services parse header with `parseFeatureFlags()`

## Commands

```bash
pnpm build       # Compile TypeScript
pnpm lint        # ESLint
pnpm typecheck   # Type check
```
