# @mbe/types

Shared TypeScript type definitions and Zod schemas for the workspace.

## Structure

```
src/
├── index.ts            # Barrel export
├── agent.ts            # Agent session and event types
├── api.ts              # API request/response and error types (RFC 9457)
├── availability.ts     # Time slot and availability types
├── date.ts             # Date/time utility types
├── floor-plan.ts       # Floor plan entity types
├── guest.ts            # Guest CRM types
├── reservation.ts      # Reservation entity and status types
├── schema-compat.ts    # Zod ↔ JSON Schema bridge utilities
├── user.ts             # User and preferences types
├── venue.ts            # Venue and venue group types
└── schemas/            # Zod schemas for runtime validation
```

## Governance

- **PascalCase**: All type and interface names.
- **Explicit Exports**: Use barrel exports in `index.ts` for public types.
- **Import Type**: Always use `import type` when referencing these types from other packages to avoid runtime overhead.

## Patterns

- **Zod Sync**: Many types are inferred from Zod schemas (`z.infer<typeof Schema>`) to ensure runtime/compile-time alignment.
- **Null vs Undefined**: Prefer `null` for missing database fields, `undefined` for optional function parameters.
- **Schema Compat**: `schema-compat.ts` bridges Zod schemas to JSON Schema for Fastify route validation.

## Usage

```typescript
import type { User, Reservation, Venue } from "@mbe/types";
import { UserSchema, ReservationSchema } from "@mbe/types";
```

Primary consumers: `@mbe/api-client` (7+ modules), `@mbe/observability`, all services.

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm test:coverage # Coverage report
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
