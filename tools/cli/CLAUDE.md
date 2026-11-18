# @mbe/cli (`mbe`)

Monorepo CLI for development, agent orchestration, and infrastructure management. Installed as `mbe` via workspace bin.

## Reference

`src/` file map and per-command usage (agent local/API mode flags and defaults, issue frontmatter, check-adr, check-deps, issue transition, check-model): [docs/reference.md](./docs/reference.md).

## Adding a New Command

1. Create `src/commands/<name>.ts` — export a `Command` instance
2. Add a lazy loader entry in `src/command-loaders.ts` (modules are imported only when their command runs)
3. Add tests in `src/__tests__/`

## Commands

```bash
pnpm build       # Compile TypeScript
pnpm lint        # ESLint
pnpm typecheck   # Type check
pnpm test        # Run tests
```
