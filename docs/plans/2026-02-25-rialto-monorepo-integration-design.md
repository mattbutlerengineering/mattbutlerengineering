# Rialto Monorepo Integration Design

**Date:** 2026-02-25
**Status:** Approved

## Overview

Move the Rialto design system (`mattbutlerengineering/rialto`) into the mattbutlerengineering monorepo as a shared package. Rialto is a 52-component React library with warm aluminum surfaces, spring physics, and gold accents.

## Approach

Direct integration: clone rialto, copy files into the monorepo's standard directory structure, adapt to Turborepo, and upgrade shared dependencies.

## File Layout

```
mattbutlerengineering/
├── apps/
│   ├── dashboard/             # (existing, upgraded)
│   ├── web/                   # (existing, upgraded)
│   └── rialto-web/            # ← renamed from apps/showcase
│       ├── src/
│       ├── e2e/               # ← visual regression tests
│       ├── public/            # PWA assets
│       ├── playwright.config.ts
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json       # @mbe/rialto-web
├── packages/
│   ├── rialto/                # ← component library
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── providers/
│   │   │   ├── styles/
│   │   │   ├── tokens/
│   │   │   └── test/
│   │   ├── scripts/           # ← manifest generation
│   │   ├── CLAUDE.md          # design system conventions
│   │   ├── llms.txt           # AI component reference
│   │   ├── vite.config.lib.ts
│   │   ├── tsconfig.json      # extends @mbe/config
│   │   ├── tsconfig.lib.json
│   │   └── package.json       # @mattbutlerengineering/rialto
│   ├── auth/                  # (existing)
│   ├── types/                 # (existing)
│   ├── ui/                    # (existing, to be replaced by rialto later)
│   └── config/                # (existing, upgraded)
```

## Version Upgrades

All apps and packages upgraded:

| Package                   | From | To   |
| ------------------------- | ---- | ---- |
| react                     | 18.3 | 19.x |
| react-dom                 | 18.3 | 19.x |
| @types/react              | 18.3 | 19.x |
| @types/react-dom          | 18.3 | 19.x |
| vite                      | 6.0  | 7.x  |
| @vitejs/plugin-react      | 4.3  | 5.x  |
| typescript                | 5.7  | 5.9  |
| eslint                    | 9.x  | 10.x |
| eslint-plugin-react-hooks | 5.x  | 7.x  |

## Config Integration

### Prettier

Monorepo's config takes precedence:

- `singleQuote: false` (double quotes)
- `printWidth: 100`

All rialto source files will be reformatted after copy.

### ESLint

Upgrade `@mbe/config` to ESLint 10. Add `jsx-a11y` plugin to `@mbe/config/eslint/react.js` for accessibility linting.

### TypeScript

Rialto packages extend `@mbe/config/typescript/react` with overrides:

- `noUncheckedIndexedAccess: true`
- `useDefineForClassFields: true`
- `moduleDetection: "force"`
- `vitest/globals` types (for rialto package only)

Rialto keeps its `tsconfig.lib.json` for the library build (used by `vite-plugin-dts`).

### .npmrc

Keep monorepo's `auto-install-peers=true`. Drop rialto's `shamefully-hoist=true`.

## Root Config Additions

### package.json devDependencies

- `@changesets/cli`, `@changesets/changelog-github`
- `@size-limit/file`, `size-limit`
- `@playwright/test`
- `@lhci/cli`

### Root Scripts

- `changeset` — create changeset
- `release` — build rialto + publish via changesets
- `test:visual` — run Playwright visual tests
- `lighthouse` — run Lighthouse CI

### turbo.json

Add `test:visual` task (no cache, depends on build).

### .changeset/config.json

Copy from rialto, update repo reference to `mattbutlerengineering/mattbutlerengineering`.

### lighthouserc.json

Copy from rialto, update `@mbe/showcase` references to `@mbe/rialto-web`.

### .gitignore

Add: `e2e/test-results/`, `.lighthouseci/`

## What Gets Dropped

- Rialto's root eslint.config.js (use @mbe/config)
- Rialto's root vitest.config.ts (rialto package has its own)
- Rialto's root tsconfig.json (project references file)
- Rialto's root .prettierrc (use monorepo's)
- Rialto's root .npmrc (use monorepo's)
- Rialto's .githooks/ (use monorepo's)
- Rialto's root CLAUDE.md, AGENTS.md, README.md, TODO.md
- Rialto's root public/404.html (GitHub Pages artifact)

## Git Approach

Clean copy — files only, no history preservation. Original rialto repo stays as archive.

## Out of Scope (Follow-up Work)

- Wiring dashboard/web to consume `@mattbutlerengineering/rialto`
- Migrating components from `@mbe/ui` to `@mattbutlerengineering/rialto`
- Removing `@mbe/ui` package
- Updating CI/CD pipelines for rialto builds
- React 19 compatibility fixes in existing apps (if any)

## Relationship: @mattbutlerengineering/rialto vs @mbe/ui

`@mattbutlerengineering/rialto` is the long-term replacement for `@mbe/ui`. Both coexist during migration. Apps will gradually adopt rialto components and eventually `@mbe/ui` will be removed.
