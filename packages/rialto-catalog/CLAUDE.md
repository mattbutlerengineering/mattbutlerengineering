# @mbe/rialto-catalog

Component catalog generator for the Rialto design system.

## Structure

```
src/
├── catalog.ts            # Assembles the json-render catalog from the two generated artifacts
├── catalog-meta.ts       # CatalogMeta type (consumer mirror of the rialto authoring type)
├── generated-catalog.ts  # AUTO-GENERATED — descriptions / slots / include / aliases / charLimits
├── generated-schemas.ts  # AUTO-GENERATED — component prop Zod schemas
├── index.ts              # Public exports
└── registry.tsx          # Hand-written prop→JSX adapters (the residue boundary)
scripts/
└── generate-catalog.ts   # One-pass generator: reads co-located metadata, emits both artifacts
```

## Catalog Generation (single CatalogSource)

Component catalog knowledge lives in ONE place: a co-located
`packages/rialto/src/components/<Component>/<Component>.catalog.ts` file per
curated component (`satisfies CatalogMeta`). One generator pass reads every
`*.catalog.ts` and emits both generated artifacts:

- **`generated-schemas.ts`** — Zod prop schemas. Types come from the component's
  `Props` interface via the TypeScript Compiler API; character limits come from
  each meta's `charLimits`.
- **`generated-catalog.ts`** — descriptions, slots, `include` flags, and declared
  prop `aliases`. This is the data `catalog.ts` feeds to `defineCatalog`.

The set of `*.catalog.ts` files IS the curated include-list — there is no more
hand-maintained `CURATED_COMPONENTS` set, `CHARACTER_LIMITS` table, or
`catalog-config.ts`. Adding or changing a component is one edit at the source.

`registry.tsx` keeps the genuinely-irregular hand-written prop→JSX adapters
(events, named slots, declared aliases). `drift-check.test.ts` enforces an
adapter↔meta 1:1 parity check (Toast is the one documented exception — it uses
the `useToast()` provider pattern and has no declarative renderer).

## Usage

```typescript
import { getCatalog } from "@mbe/rialto-catalog";

const catalog = await getCatalog();
// Returns structured metadata used by the Gen app
```

## Patterns

- **Static Analysis**: Uses TypeScript Compiler API (via `scripts/generate-catalog.ts`) to extract types without executing code.
- **JSON Output**: The generated catalog is serialized to JSON for consumption by web apps.
- **Sync**: The `mbe pack` command (or `pnpm generate`) should be run after modifying Rialto components to keep the catalog in sync.

## Commands

```bash
pnpm generate       # Regenerate catalog from @mbe/rialto
pnpm build          # Compile TypeScript
pnpm typecheck      # TypeScript check
pnpm test           # Vitest unit tests
pnpm test:drift     # Check catalog drift — fails if catalog is stale
```
