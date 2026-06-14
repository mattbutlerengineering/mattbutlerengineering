# @mbe/mcp-server

Infrastructure MCP server that gives Claude Code access to live system state via stdio transport.

## Structure

```
src/
├── index.ts              # Server setup, tool registry, request handler
└── tools/
    ├── ci.ts             # ci_run_status — GitHub Actions workflow status
    ├── database.ts       # db_list_tables, db_migration_status — Postgres introspection
    ├── deploy_status.ts  # deploy_status — DigitalOcean App Platform status
    ├── git.ts            # git_workflow_status — branch, uncommitted changes, CI
    ├── health.ts         # service_health_check — backend service health
    ├── logs.ts           # check_logs — recent backend service logs
    └── pulumi.ts         # pulumi_stack_outputs — Pulumi stack exports
```

## Available Tools

| Tool                   | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `pulumi_stack_outputs` | List all outputs from the Pulumi production stack       |
| `service_health_check` | Check health of users, reservations, agent services     |
| `ci_run_status`        | Get latest GitHub Actions run status for all workflows  |
| `check_logs`           | Read recent logs from backend services                  |
| `deploy_status`        | Get current DigitalOcean App Platform deployment status |
| `git_workflow_status`  | Current branch, uncommitted changes, CI status          |
| `db_list_tables`       | List all tables in the database                         |
| `db_migration_status`  | Show applied Prisma migrations                          |

## Transport

Uses `StdioServerTransport` from `@modelcontextprotocol/sdk`. Configured in `.mcp.json` at repo root:

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

## Adding a New Tool

1. Create tool implementation in `src/tools/<name>.ts` — export an async function returning a string
2. Add tool definition to the `TOOLS` array in `src/index.ts` (name, description, inputSchema)
3. Add handler case in the `CallToolRequestSchema` handler

## Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `pg` — Direct Postgres access for database tools
- `zod` — Schema validation

## Commands

```bash
pnpm build         # Compile TypeScript
pnpm typecheck     # Type check
pnpm test          # Run tests
pnpm test:coverage # Run tests with coverage report
pnpm start         # Run server (stdio)
```
