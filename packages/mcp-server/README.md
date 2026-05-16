# @mbe/mcp-server

Infrastructure Model Context Protocol (MCP) server for the mattbutlerengineering workspace. Provides AI agents with real-time access to database schemas, CI/CD status, and cloud deployment state.

## Installation

```json
{
  "dependencies": {
    "@mbe/mcp-server": "workspace:*"
  }
}
```

## Tech Stack

- Node.js
- @modelcontextprotocol/sdk
- Postgres (pg)
- Zod

## Available Tools

| Category           | Tools                                   |
| ------------------ | --------------------------------------- |
| **Infrastructure** | `pulumi_stack_outputs`, `deploy_status` |
| **Database**       | `db_list_tables`, `db_migration_status` |
| **CI/CD**          | `ci_run_status`, `git_workflow_status`  |
| **Health**         | `service_health_check`                  |

## Usage with Claude Code

Add the following to your `.mcp.json`:

```json
{
  "mcpServers": {
    "mbe-infra": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"]
    }
  }
}
```

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm start        # Run server via stdio
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
