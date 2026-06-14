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
└── typescript/
    ├── base.json  # Base TSConfig
    ├── node.json  # Node-specific TSConfig
    └── react.json # React-specific TSConfig
```

## Governance

- **Strictness**: TypeScript configs use `strict: true` and `noImplicitAny: true` by default.
- **Formatting**: Prettier is the source of truth for all whitespace and code style.
- **Linting**: ESLint is used for logical errors and architectural constraints (e.g., restricted imports).

## Patterns

- **Extension**: Always `extend` from these configs in local package directories rather than redefining rules.
- **Type Safety**: New packages should use `typescript/base` or the relevant platform config.
- **React**: Apps must use `eslint/react` to catch hook and accessibility violations.

## Commands

No per-package scripts (pure config files). Lint rules are consumed by `pnpm lint` in workspace packages that extend from `@mbe/config/eslint/*`.

Custom architectural rules live in `eslint/local-rules.js` — they enforce import boundaries, prevent cross-package coupling violations, and ensure monorepo structure compliance.
