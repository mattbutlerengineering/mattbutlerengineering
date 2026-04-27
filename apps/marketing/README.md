# Marketing

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](../../LICENSE)
<!-- acmm:begin -->![ACMM Level 6](https://img.shields.io/badge/ACMM-Level%206-d4a030?style=flat-square)<!-- acmm:end -->

Public marketing site for mattbutlerengineering.com. Serves as the catch-all route at `/`.

## Tech Stack

- React 19 + Vite (port 3000)
- Rialto design system (`@mattbutlerengineering/rialto`)
- Framer Motion (animations)
- React Router

## Commands

```bash
pnpm dev          # Dev server on :3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```

## Deployment

Deployed as a Cloudflare Worker with Static Assets. The edge router forwards all unmatched paths to this app.
