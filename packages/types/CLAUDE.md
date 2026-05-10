# @mbe/types

Shared TypeScript type definitions for the workspace.

## Structure

```
src/
├── agent.ts     # Agent session and event types
├── api.ts       # API request/response and error types
├── auth.ts      # Auth0 and OIDC types
├── database.ts  # Prisma-adjacent business models
├── index.ts     # Main barrel export
└── user.ts      # User and profile types
```

## Governance

- **PascalCase**: All type and interface names.
- **Explicit Exports**: Use barrel exports in `index.ts` for public types.
- **Import Type**: Always use `import type` when referencing these types from other packages to avoid runtime overhead.

## Patterns

- **Zod Sync**: Many types here are inferred from Zod schemas to ensure runtime/compile-time alignment.
- **Opaque Types**: Use branded types for IDs (e.g. `UserId`, `ReservationId`) where applicable.
- **Null vs Undefined**: Prefer `null` for missing database fields, `undefined` for optional function parameters.

## Commands

```bash
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
