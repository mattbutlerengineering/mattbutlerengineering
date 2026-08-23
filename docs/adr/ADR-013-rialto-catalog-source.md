---
id: ADR-013
title: Co-located CatalogSource for Rialto Catalog Metadata
status: active
date: 2026-06-21
---

# ADR-013: Co-located CatalogSource for Rialto Catalog Metadata

## Context

> **Status: resolved.** This Context section describes the _pre-#2046_ problem
> this ADR set out to solve, not the current architecture. As of #2046 the
> migration below is complete — see "Migration Order" and the "Current State"
> section for what ships today.

The AI component catalog (`packages/rialto-catalog`) lets the gen service emit
Rialto UIs from a JSON spec. A single component's catalog knowledge **used to be**
spread across **three hand-synced seams**, and keeping them aligned was manual and
error-prone:

1. **Generated schemas** — `packages/rialto-catalog/src/generated-schemas.ts`
   (~164 lines). Zod prop schemas auto-extracted from each `*Props` interface by
   `scripts/generate-catalog.ts` via the TypeScript Compiler API. But the
   **curated-component list** (`CURATED_COMPONENTS`) and the per-prop
   **`CHARACTER_LIMITS`** table are hardcoded in the generator
   (`generate-catalog.ts:24-51`, `:67-92`).
2. **Catalog config** — `packages/rialto-catalog/src/catalog-config.ts`
   (~177 lines). Hand-written `include` flags, AI usage `description`s, and `slots`
   for each component. No source of truth — descriptions are authored by hand and
   drift from the component.
3. **Registry adapters** — `packages/rialto-catalog/src/registry.tsx` (~259 lines).
   25 hand-written `({props, children, emit}) => JSX` adapters that forward props
   to the real Rialto component. They also carry **prop aliasing** (`tabs ?? items`),
   **silent fallbacks** (`options ?? []`), and **event wiring** (`emit("press")`).

This drift class has produced real bugs — e.g. the `AppBar` `title` → `logo`
rename (commit `e08792a`) that left tests and adapters calling a prop that no
longer existed — and spawned a bespoke `rialto-prop-drift-detector` agent to police it.

## Decision

Adopt a **co-located `CatalogSource`**: each curated component declares its catalog
metadata in a sibling **`<Component>.catalog.ts`** file exporting a typed const
(`satisfies CatalogMeta`). The generator imports these directly instead of reading
three hand-synced files.

```ts
// AppBar.catalog.ts
import type { CatalogMeta } from "@mattbutlerengineering/rialto-catalog";

export const catalog = {
  include: true,
  description: "Sticky header. Use logo for the brand slot, actions for the right slot.",
  slots: ["default"],
  renderer: "declarative", // or "custom" for provider-hook components (Toast)
  props: {
    height: { max: 20 },
    glass: { default: true },
  },
  aliases: {}, // declarative prop aliases, moved out of the adapter
} satisfies CatalogMeta;
```

### What the CatalogSource absorbs

| Pre-#2046 seam                                          | Moves into `*.catalog.ts`                         |
| ------------------------------------------------------- | ------------------------------------------------- |
| `catalog-config.ts` `description` / `slots` / `include` | `description`, `slots`, `include`                 |
| generator `CHARACTER_LIMITS` table                      | per-prop `props.<name>.max`                       |
| adapter prop aliases (`tabs ?? items`)                  | declarative `aliases` map                         |
| generator `CURATED_COMPONENTS` list                     | **derived** from which `*.catalog.ts` files exist |

### Hand-written-residue boundary

The JSX adapter functions in `registry.tsx` **stay hand-written**. They encode
rendering structure, children handling, and event emission — behaviour, not data —
and forcing that into config would be a leaky abstraction. The boundary is:

- **Data → CatalogSource:** include flag, description, slots, character limits,
  prop aliases, default hints, and a `renderer` discriminator.
- **Behaviour → adapter:** JSX shape, children placement, `emit(...)` event wiring.
- **Irregular renderers** (e.g. `Toast`, which uses the `useToast()` provider hook
  and cannot be instantiated from JSON) declare `renderer: "custom"` and keep their
  bespoke handling explicitly, not silently excluded.

### Drift defeated by construction

- The generator derives the curated list from the set of `*.catalog.ts` files, so
  adding a component is one file, not three edits (kills seam A).
- A build/test check asserts **1:1 parity**: every `*.catalog.ts` has a matching
  `registry.tsx` adapter and vice-versa. A renamed/removed prop or a missing
  adapter fails the check instead of silently falling back. This check ships
  today as `packages/rialto-catalog/src/__tests__/drift-check.test.ts`
  (`pnpm test:drift` in that package) — see "Current State" below.

## Current State (post-#2046)

The migration below is complete. Confirmed against the tree:

- `packages/rialto-catalog/src/catalog-config.ts` no longer exists.
- 37 co-located `<Component>.catalog.ts` files live under
  `packages/rialto/src/components/**` (one per curated component), each
  `satisfies CatalogMeta` (`packages/rialto/src/components/catalog-meta.ts`;
  `packages/rialto-catalog/src/catalog-meta.ts` is its documented mirror).
- `scripts/generate-catalog.ts` reads those files and emits the two generated
  artifacts, `generated-catalog.ts` and `generated-schemas.ts`
  (`packages/rialto-catalog/src/`), which `catalog.ts` assembles into the
  catalog the gen service consumes.
- The adapter↔meta 1:1 parity check described above is real and running:
  `packages/rialto-catalog/src/__tests__/drift-check.test.ts` asserts
  `registry.tsx`'s adapter keys equal the `include !== false` set of
  `generated-catalog.ts`'s `catalogMeta` (Toast is the one documented,
  sanctioned exception — it has no declarative renderer). The same file also
  checks that `generate-catalog.ts` sources component data from the canonical
  `introspectComponents` module (no independent TS parse) and that every
  `charLimits` key resolves to a real field in the generated schema.
- `registry.tsx` remains hand-written per the "Hand-written-residue boundary"
  above — that part of the Decision was never meant to go away.

## Alternatives Considered

- **JSDoc `@catalog {...}` tags on `*Props` interfaces** — most co-located, but
  requires a custom doc-comment parser, is stringly-typed, and has no compile-time
  safety. The structured-JSON-in-comments pattern is exactly the kind of brittle
  seam this ADR removes. Rejected.
- **One central `catalogSource` const** (the pre-#2046 `catalog-config.ts`,
  expanded to absorb limits + aliases) — simpler to write but not co-located; the
  metadata still lives away from the component and drifts on rename. Rejected in
  favour of per-component co-location.
- **Fully data-driven adapters (no `registry.tsx`)** — rejected. Adapter JSX +
  event wiring is genuine behaviour; encoding it as data produces a worse, leakier
  abstraction than a small typed function.

## Consequences

**Positive**

- One authoritative source per component; adding/changing a catalog component is a
  single co-located edit.
- Character limits and descriptions live next to the props they describe → far less
  rename drift; the `rialto-prop-drift-detector` agent becomes a backstop, not the
  primary defence.
- Parity check turns a whole bug class (adapter/meta/schema mismatch) into a failing
  test instead of a silent runtime fallback.

**Negative / trade-offs**

- Adds one small file per curated component (~25 files).
- `registry.tsx` adapters remain hand-written — the residue is reduced, not removed.
- Migration touches all 25 components and the drift-check test (see #2046).

## Migration Order (executed in #2046)

1. Define the `CatalogMeta` type and teach `generate-catalog.ts` to read a
   `*.catalog.ts` when present (additive; no behaviour change yet).
2. Move `CHARACTER_LIMITS` into per-component `props.<name>.max`.
3. Move `catalog-config.ts` `description` / `slots` / `include` into the meta files.
4. Move adapter prop aliases into declarative `aliases`.
5. Flip the generator to derive the curated list from the `*.catalog.ts` set; delete
   the hardcoded `CURATED_COMPONENTS`.
6. Add the adapter↔meta parity check to the drift-check test.

Each step is guarded by the existing drift-check; migrate component-by-component,
`Toast` (custom renderer) last.
