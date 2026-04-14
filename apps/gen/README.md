# Gen

Dynamic UI rendering app using JSON-based component descriptions. Renders Rialto components from catalog definitions at runtime.

## Tech Stack

- React 19 + Vite
- `@json-render/react` for JSON-to-component rendering
- `@mattbutlerengineering/rialto` + `@mbe/rialto-catalog` for component definitions
- `@mbe/auth` for authentication

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```

## Deployment

Deployed as a Cloudflare Worker with Static Assets, managed via Pulumi. The edge router serves this app at `/gen`.
