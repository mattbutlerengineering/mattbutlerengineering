# @mbe/test-fixtures

Shared mock-data factories for service tests. One canonical `create*` per
entity so services/reservations and services/users don't each hand-roll
slightly different fixture shapes.

## Structure

```
src/
├── index.ts             # Barrel export, grouped by domain
├── users.ts             # createMockUser, createMockPaginatedResponse
├── reservations.ts      # createMockTable, createMockReservation, createMockPagination, ERROR_* constants
├── jwt.ts               # createMockJWTPayload — defined once, shared across domains
└── __tests__/index.test.ts
```

## Patterns

- **`create*` convention**: every factory takes an optional `Partial<T>` of overrides and spreads it over sane defaults
- **Frozen output**: all factories return `Object.freeze()`d objects — tests can't accidentally mutate a shared fixture and leak state between cases
- Types (`MockUser`, `MockReservation`, `MockTable`, `MockJWTPayload`, etc.) are inferred from `@mbe/types` where an entity overlaps a real domain type

## Consumers

- `services/reservations` (`src/test/mocks.ts`)
- `services/users` (`src/test/fixtures.ts`)

## Gotchas

- `depends on @mbe/types` — changes to shared entity shapes there (e.g. `Reservation`, `User`) can silently drift `MockReservation`/`MockUser` out of sync since they're hand-maintained interfaces, not `z.infer<>` aliases
- Always add overrides via the factory's `Partial<T>` param, not by mutating the returned object post-hoc — it's frozen and will throw in strict mode

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
