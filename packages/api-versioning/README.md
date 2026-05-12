# @mbe/api-versioning

Fastify plugin for automated API versioning management. Handles `API-Version`, `Link` (rel="successor-version"), `Deprecation`, and `Sunset` headers.

## Installation

```json
{
  "dependencies": {
    "@mbe/api-versioning": "workspace:*"
  }
}
```

## Tech Stack

- Fastify
- TypeScript

## Key Features

- Automated `API-Version` header injection.
- Successor version discovery and `Link` header generation.
- Graceful deprecation management with `Sunset` dates.
- Type-safe Fastify decorations for version metadata.

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
