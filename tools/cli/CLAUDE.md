# @mbe/cli (`mbe`)

Monorepo CLI for development, agent orchestration, and infrastructure management. Installed as `mbe` via workspace bin.

## Reference

`src/` file map and per-command usage (agent local/API mode flags and defaults, issue frontmatter, pack, check-adr, check-deps, issue transition, check-model): [docs/reference.md](./docs/reference.md).

## Deterministic `mbe pack` output

The `pack` command generates `llms.txt` skeletons using ts-morph AST analysis. To ensure cross-platform deterministic output (critical for CI integrity checks on Linux):

1. **Sort glob results**: `(await glob(...)).sort()` — filesystem order differs between macOS and Linux
2. **Sort sections**: `[...sections.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))` — Map insertion order depends on iteration order; avoid `localeCompare` since it sorts differently on macOS vs Linux CI
3. **Use source types not resolved types**: `getTypeNode()?.getText() ?? "unknown"` instead of `getType().getText()` — resolved types contain absolute filesystem paths (`/Users/...` vs `/home/runner/...`)

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
