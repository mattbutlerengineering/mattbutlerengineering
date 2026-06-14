# @mbe/rialto-plugin

Claude Code plugin for the Rialto design system. Enhances agent productivity when working with Rialto components.

## Structure

```
.
├── agents/        # Rialto-specialized sub-agents
├── hooks/         # PostToolUse validation hook
├── scripts/       # Build scripts
└── skills/        # Specialized Claude Code skill
```

## Skills

- `skills/rialto/SKILL.md` — invoked as `/rialto`. Use when building UI with the Rialto design system: choosing components, applying design tokens, composing layouts, or authoring new Rialto components.

## Agents

- `agents/rialto-ui-builder.md` — autonomous UI builder; generates complete page sections, forms, and layouts with correct component selection, token usage, accessibility, and motion.

## Validation Hooks

`hooks/hooks.json` wires a `PostToolUse` hook on every `Write` or `Edit` call. `hooks/validate-rialto.mjs` runs and emits advisory stderr warnings (never blocking) for:

- **Hardcoded hex colors** — suggests `var(--rialto-*)` token instead
- **Subpath imports** — `rialto/components/…` should be the `"rialto"` barrel
- **Physical CSS properties** — `margin-left` → `margin-inline-start`, etc.
- **Raw `cubic-bezier()`** — use `var(--rialto-ease-*)` token
- **`<img>` without `alt`** — basic a11y check in `.tsx`/`.jsx` files

Only fires on `.tsx`, `.jsx`, `.ts`, `.js`, or `.css` files that contain `"rialto"` or `"--rialto-"`.

## Commands

```bash
pnpm build        # Alias for pnpm generate — runs scripts/generate-reference.ts
                  # → writes generated/component-reference.md
pnpm typecheck    # TypeScript check (tsc --noEmit)
```

> There is no `pnpm lint` script in this package.

## Patterns

- **Catalog Integration**: Uses `@mattbutlerengineering/rialto` (workspace dep) to provide component context to Claude Code.
- **Zero-Touch Validation**: PostToolUse hook auto-reviews UI code for token/import/a11y violations without requiring a manual step.
- **Generated Reference**: `pnpm build` regenerates `generated/component-reference.md` with per-component props, slots, and character limits from the live Rialto source.
