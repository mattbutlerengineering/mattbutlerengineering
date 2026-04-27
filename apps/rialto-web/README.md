# Rialto Web

<!-- acmm:begin -->![ACMM Level 2](https://img.shields.io/badge/ACMM-Level%202-4a9dff?style=flat-square)<!-- acmm:end -->

Interactive showcase and documentation site for the [Rialto design system](../../packages/rialto/). Served at `/rialto` on mattbutlerengineering.com.

## Tech Stack

- React 19 + Vite
- Rialto design system (`@mattbutlerengineering/rialto`)
- Framer Motion (animations)
- Lucide icons

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build (copies registry.json to public/)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```

## Visual Testing

From the monorepo root:

```bash
pnpm test:visual    # Playwright visual regression tests
pnpm lighthouse     # Lighthouse CI audit
```
