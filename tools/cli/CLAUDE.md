# @mbe/cli (`mbe`)

Monorepo CLI for development, agent orchestration, and infrastructure management. Installed as `mbe` via workspace bin.

## Structure

```
src/
├── index.ts           # Commander program setup, command registration
├── api.ts             # API client for agent service (localhost:3003)
├── config.ts          # CLI configuration (auth tokens, API URLs)
├── commands/
│   ├── agent.ts       # agent run/start/list/status/logs/cancel/delete/orchestrate
│   ├── adr.ts         # check-adr — validate Architecture Decision Records
│   ├── check-deps.ts  # check-deps — dependency version enforcement
│   ├── cleanup-worktrees.ts  # cleanup-worktrees — remove stale git worktrees
│   ├── generate.ts    # generate — scaffold code from templates
│   ├── login.ts       # login — authenticate with Auth0
│   ├── logout.ts      # logout — clear local tokens
│   ├── loop.ts        # loop — run command repeatedly on interval
│   ├── new.ts         # new — scaffold new packages/services
│   ├── pack.ts        # pack/pack-changed — generate llms.txt context files
│   ├── prime.ts       # prime — prepare repo context for AI agents
│   ├── stats.ts       # stats/log-session/audit-perf — agent performance metrics
│   ├── sync-rules.ts  # sync-rules — sync Claude rules across packages
│   ├── up.ts          # up — start dev servers
│   ├── users.ts       # users — API user management
│   ├── visual.ts      # visual — UI development tools
│   ├── wave.ts        # wave — parallel agent execution
│   └── whoami.ts      # whoami — show current user
└── __tests__/         # Test files
```

## Key Commands

### Agent (local mode — runs via @mbe/agent-core)

```bash
mbe agent run "Fix the login bug"    # Create worktree, run Claude, get PR
  --model <model>                    # default: claude-sonnet-4-6
  --max-budget <usd>                 # default: 1.00
  --max-turns <n>                    # default: 50
  --no-pr                            # skip PR, keep worktree
  -v, --verbose                      # stream agent events
```

### Agent (API mode — requires agent service on :3003)

```bash
mbe agent start "task"     # Create session via API
mbe agent list             # List all sessions
mbe agent status <id>      # Get session details
mbe agent logs <id>        # Stream SSE events
mbe agent cancel <id>      # Cancel running session
mbe agent orchestrate "task"  # Decompose → parallel sessions → PRs
```

### Context Management

```bash
mbe pack <package>         # Generate llms.txt for a package
mbe pack-changed           # Regenerate llms.txt for changed packages (git hook)
mbe prime                  # Prepare full repo context for agents
mbe sync-rules             # Sync Claude rules across packages
```

### Development

```bash
mbe up                     # Start dev servers
mbe new <type> <name>      # Scaffold new package/service
mbe generate <template>    # Generate code from templates
mbe check-adr --staged     # Validate staged changes against ADRs
mbe check-deps             # Enforce dependency version constraints
mbe cleanup-worktrees      # Remove stale agent worktrees
```

### Observability

```bash
mbe stats                  # Agent performance metrics
mbe log-session            # Log a session for tracking
mbe audit-perf             # Audit agent performance trends
```

## Adding a New Command

1. Create `src/commands/<name>.ts` — export a `Command` instance
2. Import and register in `src/index.ts` via `program.addCommand()`
3. Add tests in `src/__tests__/`

## Commands

```bash
pnpm build       # Compile TypeScript
pnpm lint        # ESLint
pnpm typecheck   # Type check
pnpm test        # Run tests
```
