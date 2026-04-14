# Monorepo Conversion Design

**Date:** 2026-02-22
**Status:** Approved

## Goal

Convert the mattinay repo from a single-package Rialto design system into a pnpm workspaces monorepo that hosts multiple projects (frontends and backend services) alongside Rialto.

## Decisions

- **Tooling:** pnpm workspaces (Turborepo layered on later)
- **Scope:** `@mbe/*`
- **Layout:** `apps/` for deployables, `packages/` for libraries
- **Showcase:** Extracted to `apps/showcase/` as the first consumer of `@mattbutlerengineering/rialto`
- **Rialto:** Stays as a single package (tokens + components together, no split)

## Directory Structure

```
mattinay/
├── pnpm-workspace.yaml
├── package.json                 (root — private, workspace scripts)
├── .npmrc
├── apps/
│   └── showcase/                (@mbe/showcase, private)
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── showcase/        (from src/showcase/)
│           ├── pages/           (from src/pages/)
│           └── layouts/         (from src/layouts/)
├── packages/
│   └── rialto/                  (@mattbutlerengineering/rialto)
│       ├── package.json
│       ├── vite.config.lib.ts
│       ├── tsconfig.json
│       ├── tsconfig.lib.json
│       ├── CLAUDE.md
│       ├── llms.txt
│       └── src/
│           ├── lib-entry.ts
│           ├── components/
│           ├── tokens/
│           ├── styles/
│           ├── hooks/
│           ├── providers/
│           └── test/
├── .github/                     (stays at root)
├── docs/                        (stays at root)
├── scripts/                     (stays at root)
├── .changeset/                  (stays at root)
├── playwright.config.ts         (stays at root)
└── lighthouserc.json            (stays at root)
```

## Package Configuration

### Root package.json

```json
{
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @mbe/showcase dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

### packages/rialto/package.json

Renamed from `rialto` to `@mattbutlerengineering/rialto`. Same exports structure. DevDeps for testing/building stay here.

### apps/showcase/package.json

Private package. Depends on `@mattbutlerengineering/rialto` via `"workspace:*"`. Owns its own vite config, tsconfig, and index.html.

### pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

## Showcase Import Migration

All relative imports from showcase code into library code become package imports:

```tsx
// Before
import { Button } from "../components/Button/Button";
import { precision } from "../tokens/motion";
import styles from "../styles/surfaces.module.css";

// After
import { Button } from "@mattbutlerengineering/rialto";
import { precision } from "@mattbutlerengineering/rialto/motion";
```

CSS module `composes` from surfaces won't work cross-package. Showcase components that compose surfaces will need to use className props or local styles instead.

## CI Changes

- `pnpm install` replaces `npm install`
- Build order: rialto first, then showcase
- Tests run per-package via `pnpm -r test`
- Visual tests and Lighthouse target showcase build output
- Changesets scoped to `@mattbutlerengineering/rialto`

## What Stays at Root

`.github/`, `docs/`, `scripts/`, `.changeset/`, `playwright.config.ts`, `lighthouserc.json`, root `CLAUDE.md`.

## Migration Strategy

Non-breaking. No changes to Rialto's public API. The rename from `rialto` to `@mattbutlerengineering/rialto` is the only consumer-facing change (no external consumers exist yet).

Order of operations:

1. Install pnpm, create workspace config
2. Create directory structure, move files
3. Update package.json files (rename, deps, scripts)
4. Update all showcase imports to `@mattbutlerengineering/rialto`
5. Update tsconfig files for new paths
6. Update CI workflow for pnpm
7. Verify: `pnpm install`, `pnpm -r build`, `pnpm -r test`
