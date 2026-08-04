# @mbe/config

Shared configuration presets for the workspace. Centralizes ESLint, TypeScript, and Prettier rules to ensure consistency across apps and packages.

## Structure

```
.
├── eslint/
│   ├── base.js         # Shared linting rules
│   ├── local-rules.js  # Custom architectural lint rules (import restrictions, etc.)
│   ├── node.js         # Node-specific rules
│   └── react.js        # React-specific rules
├── prettier/
│   └── index.js   # Shared formatting rules
├── typescript/
│   ├── base.json  # Base TSConfig
│   ├── node.json  # Node-specific TSConfig
│   └── react.json # React-specific TSConfig
└── vitest/
    ├── base.js         # (+ base.d.ts types) internal factory core (not exported directly)
    ├── node.js         # (+ node.d.ts types) defineVitestConfig() — node environment preset
    └── react.js        # (+ react.d.ts types) defineVitestConfig() — jsdom + @vitejs/plugin-react preset
```

## Governance

- **Strictness**: TypeScript configs use `strict: true` and `noImplicitAny: true` by default.
- **Formatting**: Prettier is the source of truth for all whitespace and code style.
- **Linting**: ESLint is used for logical errors and architectural constraints (e.g., restricted imports).

## Patterns

- **Extension**: Always `extend` from these configs in local package directories rather than redefining rules.
- **Type Safety**: New packages should use `typescript/base` or the relevant platform config.
- **React**: Apps must use `eslint/react` to catch hook and accessibility violations.

## Vitest Presets

`@mbe/config/vitest/node` and `@mbe/config/vitest/react` export a `defineVitestConfig(options)` factory covering the axes that vary per package: `environment` (defaults to `"node"`/`"jsdom"` respectively), `globals`, `include`, and a required `coverage: { include, exclude, thresholds, reporter? }` block. An `extend` escape hatch (raw `ViteUserConfig`, merged last via vitest's `mergeConfig`) covers everything package-specific — `setupFiles`, `testTimeout`, `env`, `css`, `environmentMatchGlobs`, etc.

```typescript
// packages/example/vitest.config.ts
import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
  },
});
```

Shipped as hand-authored `.js` runtime + sibling `.d.ts` types (no build step), the same shape as the `eslint/*` and `prettier` presets. **This is deliberate:** a consumer's `vitest.config.ts` is loaded by Vite, which externalizes workspace packages and `require()`s the preset directly. Node 22 strips TS types on `require()`, but older Node majors do not — a raw `.ts` preset throws `SyntaxError: Unexpected token '{'` there. Plain `.js` loads on both. The internal `vitest/base.js` import is resolved through a private `#vitest-base` subpath (package.json `imports` field) rather than a relative specifier, so it works identically under Node's runtime resolution and every consumer's own `tsc` (whatever `moduleResolution` mode they use).

## Commands

No per-package scripts (pure config files) other than `@mbe/config`'s own `test`/`typecheck`, which cover the vitest preset factory. Lint rules are consumed by `pnpm lint` in workspace packages that extend from `@mbe/config/eslint/*`.

Custom architectural rules live in `eslint/local-rules.js` — they enforce import boundaries, prevent cross-package coupling violations, and ensure monorepo structure compliance.
