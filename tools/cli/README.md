# MBE CLI

Command-line tool for managing AI agent sessions, user operations, and authentication.

## Installation

Built and linked from the monorepo:

```bash
cd tools/cli
pnpm build
```

The `mbe` binary is available via the `bin` field in `package.json`.

## Commands

### Agent (local mode)

```bash
mbe agent run "Fix the login bug"       # Run agent, get PR
  --model <model>                        # Default: claude-sonnet-4-6
  --max-budget <usd>                     # Default: 1.00
  --max-turns <n>                        # Default: 50
  --no-pr                                # Skip PR creation
  -v, --verbose                          # Stream agent events
```

### Agent (API mode)

Requires the [Agent Service](../../services/agent/) running on port 3003.

```bash
mbe agent start "Fix the login bug"     # Create session via API
mbe agent list                           # List all sessions
mbe agent status <id>                    # Get session details
mbe agent logs <id>                      # Stream SSE events
mbe agent cancel <id>                    # Cancel running session
mbe agent delete <id>                    # Delete session and cleanup
mbe agent orchestrate "Big task"         # Decompose into parallel sessions
```

## Dependencies

- `@mbe/agent-core` -- session execution engine
- `@mbe/types` -- shared type definitions
- `commander` -- CLI framework

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
