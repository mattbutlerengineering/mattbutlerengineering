# Phase 12: Catalog Foundation - Research

**Researched:** 2026-03-27
**Domain:** json-render catalog definition, Zod v4 migration, TypeScript-to-Zod schema generation, CI drift checking
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAT-01 | Zod v4 upgrade across all services and packages without breaking existing schemas | Zod v4 changelog verified — all existing usages (z.string, z.object, z.array, z.union, z.enum, z.optional, .describe) are stable; z.string().url() deprecated but still works; pnpm workspace catalog enforces single version |
| CAT-02 | `packages/rialto-catalog` with `defineCatalog()` containing Zod schemas for ~25 Rialto components | defineCatalog API verified from json-render docs; 25-component curated set from PRD; existing generate-manifest.ts TypeScript Compiler API provides the source-of-truth pipeline |
| CAT-03 | `defineRegistry()` mapping catalog component types to Rialto React components | defineRegistry API verified; wraps Rialto components with ({ props, children, emit }) render pattern |
| CAT-04 | `catalog.prompt()` generates a system prompt with usage-oriented descriptions and character limit constraints | catalog.prompt() API confirmed; character-limits.ts already has .max() data for all constrained props; description field maps to usage-oriented text |
| CAT-05 | CI check that fails if committed catalog schemas drift from Rialto TypeScript prop interfaces | Pattern: generate-catalog script produces deterministic output; CI runs it and diffs against committed file |
| CAT-06 | Catalog includes action declarations for `setState`, `validateForm`, and `navigate` | setState/pushState/removeState are built-in to React schema (auto-injected); validateForm and navigate are custom actions declared in the catalog actions map |
</phase_requirements>

## Summary

Phase 12 establishes the `packages/rialto-catalog` package — the foundation every downstream generative UI feature depends on. There are three distinct workstreams: upgrading Zod v4 across the monorepo, defining the json-render catalog and registry, and implementing the automated drift-prevention pipeline. None of them are technically risky, but the ordering matters: Zod upgrade first (it unblocks `@json-render/core`), then the catalog definition with its automation, then the registry.

The biggest open question from milestone research was how to automate Zod catalog schema generation from Rialto TypeScript prop interfaces. This is now answered: the existing `generate-manifest.ts` uses the TypeScript Compiler API with a consistent pattern (`extractComponents` → TypeChecker → getProperties) that can be directly extended to output Zod schemas instead of JSON prop lists. This avoids introducing ts-morph as a new dependency and reuses a pipeline the codebase already maintains.

The json-render API is clean and well-matched to what's needed. `defineCatalog` accepts a Zod object per component, an optional slots array, a description string, and an actions map. `catalog.prompt()` converts this into a system prompt for the LLM. The React schema provides three built-in actions (setState, pushState, removeState) automatically — only `validateForm` and `navigate` need explicit declaration. The catalog and registry are cleanly separable: catalog stays server-side, registry is client-side (React component map).

**Primary recommendation:** Extend `generate-manifest.ts` into a `generate-catalog.ts` script using the same TypeScript Compiler API approach, outputting `packages/rialto-catalog/src/generated-schemas.ts`. Hand-write descriptions and character limits in a companion `catalog-config.ts`, then merge them in `catalog.ts`. CI diff check runs `pnpm --filter @mbe/rialto-catalog generate` and `git diff --exit-code`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@json-render/core` | `^0.15.0` | `defineCatalog()`, schema parsing, `catalog.prompt()` | Selected framework; hard dependency on Zod 4 |
| `@json-render/react` | `^0.15.0` | `defineRegistry()`, React component renderer | Provides React schema (first arg to defineCatalog) |
| `zod` | `^4.3.6` | Prop schema definitions in catalog | Required by `@json-render/core` peer dep |
| `typescript` | `^5.9.3` | Already in monorepo; used in generate-catalog.ts | Used by existing generate-manifest.ts |

### New Package

| Package | Config | Purpose |
|---------|--------|---------|
| `packages/rialto-catalog` | `private: true`, `@mbe/rialto-catalog` | Houses catalog, registry, generated schemas |

### Zod Upgrade Scope

All four packages need `zod` bumped from `^3.23.0` to `^4.3.6`:

| Package | Current | Target |
|---------|---------|--------|
| `services/users` | `^3.23.0` | `^4.3.6` |
| `services/agent` | `^3.23.0` | `^4.3.6` |
| `services/reservations` | `^3.23.0` | `^4.3.6` |
| `packages/agent-core` | `^3.23.0` | `^4.3.6` |

**pnpm workspace catalog approach:**

Add to `pnpm-workspace.yaml`:
```yaml
catalog:
  zod: "^4.3.6"
```

Then in each `package.json`, change `"zod": "^3.23.0"` to `"zod": "catalog:"`. This enforces a single resolved version across the monorepo.

**Installation:**
```bash
# Upgrade existing packages (run from repo root)
pnpm --filter @mbe/agent-core add zod@^4.3.6
pnpm --filter @mbe/users-service add zod@^4.3.6
pnpm --filter @mbe/agent-service add zod@^4.3.6
pnpm --filter @mbe/reservations-service add zod@^4.3.6

# New catalog package
mkdir -p packages/rialto-catalog/src
cd packages/rialto-catalog
pnpm init
pnpm add @json-render/core@^0.15.0 @json-render/react@^0.15.0 zod@^4.3.6
pnpm add -D typescript tsx @mbe/config
```

## Architecture Patterns

### Recommended Project Structure

```
packages/rialto-catalog/
├── package.json             # name: @mbe/rialto-catalog; private: true
├── tsconfig.json
├── scripts/
│   └── generate-catalog.ts  # TypeScript Compiler API → generated-schemas.ts
├── src/
│   ├── catalog-config.ts    # Hand-authored: descriptions, character limits, curated list
│   ├── generated-schemas.ts # Auto-generated: Zod schemas from Rialto TypeScript props
│   ├── catalog.ts           # defineCatalog() — merges config + generated schemas
│   ├── registry.tsx         # defineRegistry() — maps names to Rialto components
│   └── index.ts             # re-exports: catalog, registry, inferred types
```

### Pattern 1: defineCatalog() API

**What:** Accepts the React schema (first arg) and a config object with `components`, `actions`.

**When to use:** Called once in `catalog.ts` at module initialization. Result is a singleton exported from `index.ts`.

```typescript
// Source: https://json-render.dev/docs/api/core
// packages/rialto-catalog/src/catalog.ts
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { generatedSchemas } from "./generated-schemas.js";
import { catalogConfig } from "./catalog-config.js";

export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: generatedSchemas.Button,   // z.object({ variant, size, disabled, ... })
      description: catalogConfig.Button.description,
    },
    Card: {
      props: generatedSchemas.Card,
      slots: ["default"],
      description: catalogConfig.Card.description,
    },
    // ... ~23 more components
  },
  actions: {
    // setState, pushState, removeState are BUILT-IN to React schema (auto-injected)
    // Only declare custom actions here:
    validateForm: {
      params: z.object({ formId: z.string() }),
      description: "Validate all inputs in a form and show validation errors",
    },
    navigate: {
      params: z.object({ path: z.string() }),
      description: "Navigate to a path within the app",
    },
  },
});
```

**Key insight:** `setState`, `pushState`, `removeState` are built-in to the React schema and are auto-injected into prompts — do NOT re-declare them in the actions map. Only `validateForm` and `navigate` need explicit declaration.

### Pattern 2: defineRegistry() — Client-Side

**What:** Maps catalog component names to actual Rialto React component implementations. Server-agnostic — this is the client bundle piece.

**When to use:** Only imported in `apps/gen` and `apps/hospitality` (client-side). Never imported in Fastify routes.

```typescript
// Source: https://deepwiki.com/vercel-labs/json-render/2-getting-started
// packages/rialto-catalog/src/registry.tsx
import { defineRegistry } from "@json-render/react";
import { Button, Card, Input, Text, Stack, Badge, Alert } from "@mbe/rialto";
import { catalog } from "./catalog.js";

export const { registry } = defineRegistry(catalog, {
  components: {
    Button: ({ props, emit }) => (
      <Button
        variant={props.variant}
        size={props.size}
        disabled={props.disabled}
        onClick={() => emit("press")}
      >
        {props.children ?? props.label}
      </Button>
    ),
    Card: ({ props, children }) => (
      <Card title={props.title} subtitle={props.subtitle} padding={props.padding}>
        {children}
      </Card>
    ),
    // ... remaining components
  },
});
```

### Pattern 3: Generated Schema Pipeline

**What:** A `generate-catalog.ts` script (mirrors `generate-manifest.ts`) uses the TypeScript Compiler API to extract prop types from Rialto components and output Zod schemas as a TypeScript file.

**When to use:** Run during `packages/rialto` build (added to its `build` script). Output committed to git. CI diffs to detect drift.

```typescript
// packages/rialto-catalog/scripts/generate-catalog.ts
import * as ts from "typescript";

// Reuses same extractComponents() pattern from generate-manifest.ts
// Key differences:
// 1. Output is TypeScript (Zod schemas) not JSON
// 2. Type strings → Zod schema builders:
//    "string" → "z.string()"
//    "\"primary\" | \"secondary\" | \"ghost\"" → "z.enum(['primary','secondary','ghost'])"
//    "boolean" → "z.boolean()"
//    "number" → "z.number()"
//    "ReactNode" → treated as slot, skipped
//    Optional props → append ".optional()"

function typeStringToZod(typeStr: string, isOptional: boolean): string {
  // Union of string literals → z.enum([...])
  if (/^"/.test(typeStr) || typeStr.includes('" | "')) {
    const values = typeStr.split(" | ").map(v => v.trim().replace(/^"|"$/g, ""));
    const base = `z.enum(${JSON.stringify(values)})`;
    return isOptional ? `${base}.optional()` : base;
  }
  // boolean
  if (typeStr === "boolean" || typeStr === "true | false") {
    return isOptional ? "z.boolean().optional()" : "z.boolean()";
  }
  // number
  if (typeStr === "number") {
    return isOptional ? "z.number().optional()" : "z.number()";
  }
  // string (default)
  return isOptional ? "z.string().optional()" : "z.string()";
}
```

**Output format** — `generated-schemas.ts`:
```typescript
// AUTO-GENERATED — do not edit. Run: pnpm --filter @mbe/rialto-catalog generate
import { z } from "zod";

export const generatedSchemas = {
  Button: z.object({
    variant: z.enum(["primary", "secondary", "ghost"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
    disabled: z.boolean().optional(),
    type: z.enum(["button", "submit", "reset"]).optional(),
  }),
  Card: z.object({
    variant: z.enum(["default", "outlined"]).optional(),
    padding: z.enum(["sm", "md", "lg"]).optional(),
    title: z.string().max(60).optional(),
    subtitle: z.string().max(80).optional(),
  }),
  // ...
} as const;
```

**Character limit injection:** The `character-limits.ts` in `packages/rialto` already has max values for all constrained props. The generator reads this file and applies `.max(n)` to matching `z.string()` schemas at generation time.

### Pattern 4: Catalog Config (Hand-Authored)

Usage-oriented descriptions cannot be auto-generated from prop interfaces — they require human authorship. Keep them in a companion file:

```typescript
// packages/rialto-catalog/src/catalog-config.ts
export const catalogConfig = {
  Button: {
    description: "Clickable action trigger. Use variant=primary for the main CTA; secondary for supporting actions; ghost for tertiary or inline actions. Children text must be a verb phrase (max 30 chars).",
    include: true,
  },
  Card: {
    description: "Content container. Use for grouping related information with a title. Compose inside Stack to build layouts. Use padding=lg for featured content, sm for dense lists.",
    include: true,
    slots: ["default"],
  },
  // ... 23 more
  // Components NOT in the catalog (set include: false to exclude from generation):
  AccordionItem: { include: false },
  BreadcrumbItem: { include: false },
  // etc.
} as const;
```

### Pattern 5: CI Drift Check

```yaml
# .github/workflows/ci.yml (add step to existing lint/test workflow)
- name: Check catalog drift
  run: |
    pnpm --filter @mbe/rialto-catalog generate
    git diff --exit-code packages/rialto-catalog/src/generated-schemas.ts
  # Fails if committed schemas differ from freshly generated ones
```

The `generate` script is added to `packages/rialto-catalog/package.json`:
```json
{
  "scripts": {
    "generate": "tsx scripts/generate-catalog.ts",
    "build": "pnpm generate && tsc",
    "test": "vitest run"
  }
}
```

Also hook into `packages/rialto` build so catalog schemas regenerate whenever Rialto builds:
```json
// packages/rialto/package.json — add to build script
{
  "scripts": {
    "build": "vite build --config vite.config.lib.ts && pnpm manifest && pnpm catalog:generate"
  }
}
```

### Curated Component Set (~25 components)

Based on PRD section 5.1. These are the components included in `catalogConfig` with `include: true`:

**Layout (4):** Stack, Card, Divider, AspectRatio

**Typography & Content (3):** Text, Badge, Avatar

**Forms (5):** Button, Input, Select, Toggle, Checkbox

**Navigation (3):** Tabs, Breadcrumb, NavigationMenu

**Feedback (4):** Alert, Banner, Dialog, Toast (via hook declaration)

**Data Display (4):** Table, DataList, EmptyState, Accordion

**App Shell (3):** Sidebar, AppBar, Footer

**Total: 26** (close enough to "~25" — drop Sidebar or Footer if prompt length is a concern)

### Anti-Patterns to Avoid

- **Hand-writing Zod schemas:** Any hand-written schema will drift from the Rialto TypeScript interface within days. Generate from source; never write schemas manually.
- **Importing catalog into client apps:** `catalog.ts` imports `@json-render/core` and Zod — these must never land in a browser bundle. Only `registry.tsx` is client-safe.
- **Re-declaring built-in actions:** Do not add `setState` to the actions map. It is built-in to the React schema and auto-injected. Re-declaring it creates duplicates in the generated prompt.
- **Using `.passthrough()` on component schemas:** Use default strict behavior (Zod 4) so unknown props cause validation errors rather than silently passing through to Rialto components.
- **Putting catalog definition inside `packages/rialto`:** Couples every consumer of `@mbe/rialto` to json-render. Keep in its own package.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM system prompt from component list | Custom string builder | `catalog.prompt()` | json-render handles JSON Schema conversion, slot descriptions, action listings, character limits |
| Component schema validation | Custom validator | Zod schemas + `catalog.validate()` | Runtime validation with typed errors |
| TypeScript prop → Zod conversion | Custom parser | Extend existing `generate-manifest.ts` | Same TypeScript Compiler API already working in codebase |
| Character limit enforcement | In-prompt instructions | Zod `.max()` on generated string schemas | LLM sees limits in JSON Schema and respects them |

**Key insight:** The `catalog.prompt()` method converts all Zod schemas, descriptions, slots, and custom rules into a structured LLM system prompt automatically. The schema generation script is the only custom work; everything else uses json-render.

## Common Pitfalls

### Pitfall 1: Zod v4 `.strict()` vs `.passthrough()` behavior change

**What goes wrong:** In Zod v3, `z.object()` strips unknown keys by default. In Zod v4, `.strict()` is preferred as a top-level constructor (`z.strictObject()`). The instance methods `.strict()`, `.passthrough()`, `.strip()` are deprecated. If existing code calls `.strict()` on a schema object, it still works in v4 but emits deprecation warnings.

**How to avoid:** For catalog schemas, use `z.object()` (default strip behavior). Only use `z.strictObject()` if you explicitly want to throw on unknown props. The existing usage in `agent-core` (`z.string()`, `z.object()`, etc.) is unaffected.

**Warning signs:** `z.object({ ... }).strict()` in new catalog schemas — use `z.strictObject({ ... })` instead.

### Pitfall 2: `z.string().url()` deprecation warning

**What goes wrong:** `pr-creator.ts` uses `z.string().url()` (line 9). This still works in Zod v4 but emits a deprecation warning. In Zod v4, the correct form is `z.url()`.

**How to avoid:** Update `z.string().url()` to `z.url()` in `pr-creator.ts` during the Zod upgrade. Do not leave deprecation warnings — they obscure real issues.

### Pitfall 3: Built-in vs Custom Actions Confusion

**What goes wrong:** `setState`, `pushState`, `removeState` are built-in to the React schema and automatically appear in every generated prompt. Declaring them again in the `actions` map creates duplicate entries in the prompt, confusing the LLM.

**How to avoid:** Only declare `validateForm` and `navigate` in the actions map. Test by calling `catalog.prompt()` and confirming setState appears exactly once.

### Pitfall 4: Type String Parsing Complexity

**What goes wrong:** The TypeScript Compiler API returns complex union type strings for some props. For example, `NumberInput`'s `value` might return `number | string | undefined`. The schema generator must handle union types, optional types, and complex React types correctly or fail silently.

**How to avoid:** Start with the 26 curated components and only handle the type patterns that actually appear in their prop interfaces. Unsupported type patterns (function types like `onClick`, object types like `columns[]`) are skipped — these are handled via slots or not included in the catalog. Log a warning for any unrecognized type pattern.

### Pitfall 5: React 19.2 Version for `@json-render/react`

**What goes wrong:** `@json-render/react@0.15.0` requires `react@^19.2.3`. Apps in the monorepo declare `react: "^19.0.0"`. pnpm may resolve to 19.0.x if that is what is installed.

**How to avoid:** Run `pnpm why react` before installing `@json-render/react`. If the resolved version is below 19.2.3, update the `react` version range in `packages/rialto-catalog/package.json` and the apps that will import it.

## Code Examples

### catalog.prompt() Output Structure

```typescript
// Source: https://json-render.dev/docs/api/core
// Call server-side only (in Fastify route handler)
const systemPrompt = catalog.prompt({
  customRules: [
    "Always use Stack as the root layout element.",
    "Never nest Card inside Card.",
    "Use Alert variant=warning for time-sensitive messages.",
  ],
});
// Returns a string with:
// 1. Available components with JSON Schema of each prop
// 2. Slot definitions per component
// 3. Built-in action descriptions (setState, pushState, removeState)
// 4. Custom action descriptions (validateForm, navigate)
// 5. Custom rules appended
```

### Package Setup

```json
// packages/rialto-catalog/package.json
{
  "name": "@mbe/rialto-catalog",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "generate": "tsx scripts/generate-catalog.ts",
    "build": "pnpm generate && tsc --noEmit",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@json-render/core": "^0.15.0",
    "@json-render/react": "^0.15.0",
    "@mbe/rialto": "workspace:*",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@mbe/config": "workspace:*",
    "@types/node": "^25.3.0",
    "@types/react": "^19.2.14",
    "tsx": "^4.19.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18",
    "react": "^19.2.4"
  }
}
```

### Zod v4 Migration for Existing Code

```typescript
// packages/agent-core/src/pr-creator.ts
// BEFORE (v3 — deprecated in v4):
z.string().url()

// AFTER (v4 — correct):
z.url()

// Everything else in the codebase is unaffected:
z.string()        // ✓ unchanged
z.number()        // ✓ unchanged
z.object({})      // ✓ unchanged
z.array()         // ✓ unchanged
z.union([])       // ✓ unchanged
z.enum([])        // ✓ unchanged
z.optional()      // ✓ unchanged
.describe()       // ✓ unchanged
z.string().optional()  // ✓ unchanged
```

### index.ts Exports

```typescript
// packages/rialto-catalog/src/index.ts
// Server-safe exports (catalog has Zod + json-render/core — do NOT import in browser bundles)
export { catalog } from "./catalog.js";

// Client-safe export (registry is just a { name: ReactComponent } map)
export { registry } from "./registry.js";

// Types (safe everywhere)
export type { CatalogComponentNames } from "./catalog.js";
```

**CRITICAL:** Consumer code in Fastify routes imports `catalog` only. Consumer code in React apps imports `registry` only. The `index.ts` exports both but callers must import selectively.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-written JSON schema for AI component prompts | `defineCatalog()` with Zod schemas → `catalog.prompt()` | json-render released Jan 2026 | Auto-generates structured, type-safe LLM prompts from Zod definitions |
| Zod v3 `.strict()` as instance method | `z.strictObject()` as top-level constructor | Zod v4.0 (2025) | Instance `.strict()` still works but deprecated |
| `z.string().url()` | `z.url()` | Zod v4.0 (2025) | String format methods moved to top-level |
| `z.object().merge()` | `z.object().extend()` | Zod v4.0 (2025) | `.merge()` deprecated; `.extend()` is the replacement |

**Deprecated/outdated:**
- `z.string().url()`: Still works in v4 but use `z.url()` for new code
- `z.object().strict()`: Still works in v4 but use `z.strictObject()` for new code
- `z.object().merge()`: Deprecated; use `.extend()`

## Open Questions

1. **Complex prop types in the generator**
   - What we know: The TypeScript Compiler API returns complex type strings for props like `options` (array of objects), `columns` (Table config), and callback types like `onCheckedChange`
   - What's unclear: How many of the 26 curated components have complex prop types that the generator cannot represent as Zod schemas
   - Recommendation: Start generation, log all unrecognized type patterns, and manually add Zod schemas for those specific props in `catalog-config.ts`. Expect 3-5 complex types across 26 components.

2. **`catalog.prompt()` token count**
   - What we know: With 26 components and full descriptions, the system prompt will likely be 3,000-8,000 tokens
   - What's unclear: Exact token count before writing it — affects whether Anthropic prompt caching threshold (2,048 tokens for Sonnet 4.6) is met
   - Recommendation: After generating the first `catalog.prompt()` output, count tokens with the Anthropic tokenizer. If under 2,048, add more descriptions or use Haiku (4,096 threshold).

3. **React 19.2 version resolution**
   - What we know: `@json-render/react` requires `react@^19.2.3`; apps declare `react: "^19.0.0"`
   - What's unclear: What version pnpm actually resolves to in CI
   - Recommendation: Run `pnpm why react` as the first step of Phase 12 and update version constraints if needed.

## Validation Architecture

> nyquist_validation is not set in config.json (workflow.nyquist_validation absent — defaults to disabled)

Skipping formal validation architecture section. However, the phase has clear testable success criteria that the planner should address:

1. `pnpm build` succeeds monorepo-wide after Zod v4 upgrade — verified by running build in CI
2. `packages/rialto-catalog` test suite passes — write tests for `catalog.prompt()` output and `registry` component presence
3. CI drift check fails on manual edit — verify with a deliberate schema mutation test
4. Action declarations present — verify `catalog.prompt()` output includes setState (built-in), validateForm, navigate

Minimum test cases for `packages/rialto-catalog`:
- `catalog.prompt()` returns a non-empty string containing "Button" and "Card"
- `catalog.prompt()` output includes "validateForm" and "navigate"
- `catalog.prompt()` output includes "setState" (from built-in React schema)
- `registry` object has keys for all 26 curated component names
- Generated spec with unknown prop throws validation error (Zod strict check)
- `generate-catalog.ts` output is deterministic (run twice, diff is empty)

## Sources

### Primary (HIGH confidence)
- json-render official API docs `https://json-render.dev/docs/api/core` — `defineCatalog` function signature, CatalogConfig structure, built-in vs custom actions, `catalog.validate()`, `catalog.zodSchema()`, `catalog.jsonSchema()`
- json-render getting started DeepWiki `https://deepwiki.com/vercel-labs/json-render/2-getting-started` — `defineRegistry` pattern, component render signature `({ props, children, emit })`
- Zod v4 changelog `https://zod.dev/v4/changelog` — breaking changes: `.url()` deprecation, `.strict()` deprecation, `.merge()` deprecation, core APIs (string, object, array, union, enum, optional, describe) unchanged
- npm registry direct inspection — `@json-render/core@0.15.0` peerDeps `zod: "^4.0.0"`, `@json-render/react@0.15.0` peerDeps `react: "^19.2.3"`
- Existing codebase: `packages/rialto/scripts/generate-manifest.ts` — TypeScript Compiler API approach, extractComponents pattern, character-limits.ts data
- Existing codebase: `packages/rialto/scripts/character-limits.ts` — complete list of component/prop/max constraints ready for `.max()` injection
- Existing codebase: `packages/agent-core/src/orchestrator.ts`, `pr-creator.ts` — confirmed Zod usage limited to stable v4 APIs (one `.url()` deprecation at line 9 of pr-creator.ts)
- docs/design/2026-03-27-generative-ui-prd.md section 5.1 — curated 25-component list with key props per component
- `.planning/research/STACK.md` — version compatibility matrix, Zod migration risk assessment
- `.planning/research/PITFALLS.md` — Pitfall 1 (catalog drift), Pitfall 4 (SSR assumptions in Vite SPA)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — `packages/rialto-catalog` structure, client/server split, `catalog.ts` vs `registry.tsx` separation
- `.planning/research/FEATURES.md` — component descriptions must be usage-oriented; built-in actions (setState, pushState, removeState, validateForm); character limits as Zod .max() constraints
- `.planning/research/SUMMARY.md` — Phase 1 (Catalog Foundation) rationale, gap: "catalog generation pipeline ... will require a spike"

### Tertiary (LOW confidence)
- None — all key claims verified via official sources or direct codebase inspection

## Metadata

**Confidence breakdown:**
- Zod v4 migration: HIGH — changelog verified directly; existing usages audited in codebase
- json-render API (`defineCatalog`, `defineRegistry`, `catalog.prompt()`): HIGH — official API docs fetched
- Built-in vs custom actions: HIGH — confirmed setState/pushState/removeState are auto-injected; validateForm and navigate are custom
- Schema generation pipeline design: HIGH — existing `generate-manifest.ts` provides direct extension point
- Token count of generated prompt: LOW — cannot know until first generation

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (json-render is fast-moving; re-verify if `@json-render/core` major version changes)
