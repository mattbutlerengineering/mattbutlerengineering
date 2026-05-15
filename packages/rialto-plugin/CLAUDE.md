# @mbe/rialto-plugin

Claude Code plugin for the Rialto design system. Enhances agent productivity when working with Rialto components.

## Structure

```
.
├── agents/        # Rialto-specialized sub-agents
├── hooks/         # Pre-commit/Pre-push validation hooks
├── scripts/       # Plugin lifecycle and build scripts
├── skills/        # Specialized Claude Code skills (e.g. /rialto-review)
└── .claude-plugin # Plugin manifest and configuration
```

## Skills

- `/rialto-review`: Analyzes UI code for proper token usage and component selection.
- `/rialto-docs`: Returns the latest documentation for a specific component from the catalog.

## Validation Hooks

- **Token Guard**: Scans CSS and JS for hardcoded colors/spacing; suggests Rialto variables.
- **Component Guard**: Discourages the use of raw HTML elements when a Rialto equivalent exists.

## Patterns

- **Catalog Integration**: Uses `@mbe/rialto-catalog` to provide context to Claude Code.
- **Zero-Touch**: Aims to automate the "Review" phase of the RIPER workflow for UI tasks.
- **MCP Sync**: Updates local `.mcp.json` with Rialto-specific server configurations.

## Commands

```bash
pnpm build        # Build plugin assets
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
