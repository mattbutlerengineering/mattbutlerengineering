# AGENTS.md - Rialto Web

Cross-tool agent directives for `apps/rialto-web`.

## Context
- Inherits from root [AGENTS.md](../../AGENTS.md)
- Uses [Rialto design system](../../packages/rialto/)

## Code Style
- **Styling:** CSS Modules with Rialto tokens — **No Tailwind**
- **Components:** Functional React + Hooks
- **Naming:** kebab-case files, camelCase functions, PascalCase types

## Testing
- Run `pnpm test:visual` from root before marking UI complete
- E2E tests in `apps/rialto-web/e2e/`