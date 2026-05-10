# @mbe/feature-flags

Lightweight feature flag evaluation library for the mattbutlerengineering ecosystem.

## Installation

```json
{
  "dependencies": {
    "@mbe/feature-flags": "workspace:*"
  }
}
```

## Tech Stack

- TypeScript
- Consistent Hashing (for percentage rollouts)

## Key Features

- **Safe Parsing**: Robust parsing of the `X-Feature-Flags` JSON header.
- **Percentage Rollouts**: Seed-based deterministic evaluation for consistent UX.
- **Header Propagation**: Designed to work with the workspace edge router.
- **Zero Dependencies**: Lightweight and fast.

## Usage

```typescript
import { parseFeatureFlags, isEnabled } from "@mbe/feature-flags";

const flags = parseFeatureFlags(request.headers["x-feature-flags"]);
if (isEnabled(flags, "my-feature")) {
  // logic here
}
```

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
