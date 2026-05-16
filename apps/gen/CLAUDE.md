# Gen App

Dynamic UI rendering app using JSON-based component descriptions. Renders Rialto components from catalog definitions at runtime. Port **3005**, path prefix `/gen`.

## Architecture

Renders UIs defined in JSON format. The core rendering engine uses `@json-render/react` configured with the `@mattbutlerengineering/rialto` component catalog.

- **Source of Truth**: JSON specs representing component trees.
- **Renderer**: Dynamic component lookup and instantiation.
- **Catalog**: `@mbe/rialto-catalog` provides the metadata for all available Rialto components.

## Pages

| Page           | Route    | Description                                |
| -------------- | -------- | ------------------------------------------ |
| PlaygroundPage | `/`      | Interactive JSON editor and live preview   |
| SharedSpecPage | `/s/:id` | View a shared JSON component specification |

## Key Components

- `AppShell` - Main layout with sidebar and header.
- `PreviewPane` - Live rendering area for the current JSON spec.
- `PromptBar` - AI-assisted JSON generation/modification interface.
- `JsonInspector` - Deep-tree inspection of the current specification state.
- `TemplateGallery` - List of pre-defined component templates.
- `HistoryPanel` - Undo/redo and version history for the spec.

## Patterns

- **JSON Specs**: Strictly validated against Zod schemas in `types.ts`.
- **Dynamic Imports**: Components are loaded on-demand based on the catalog.
- **Context-Aware Rendering**: Uses `SpecContext` to manage the global state of the rendered UI.
- **Rialto Integration**: All primitives come from `@mattbutlerengineering/rialto`.

## Constraints for Agents

1. **No direct DOM manipulation** - Always use the spec state.
2. **Schema First** - All new component support must start with updating `types.ts`.
3. **Theming** - Use Rialto design tokens via `ThemedApp.tsx`.
4. **Validation** - All spec updates must pass Zod validation before rendering.

## Commands

```bash
pnpm dev          # Dev server on :3005
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E tests
```
