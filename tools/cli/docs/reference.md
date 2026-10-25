# @mbe/cli reference

File map and per-command usage, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a CLI file is read. The rules (deterministic `mbe pack` output, adding a new command, package commands) stay in CLAUDE.md. The source of truth is `src/` — run `node tools/cli/dist/index.js <command> --help` for current flags.

## Structure

```
src/
├── index.ts           # Commander program setup
├── command-loaders.ts # Lazy per-command module loaders
├── config.ts          # CLI configuration (auth tokens, API URLs)
├── commands/
│   ├── agent.ts       # agent run/start/list/status/logs/cancel/delete/orchestrate/cost
│   ├── agent-eval.ts  # agent eval — run golden-task eval suite
│   ├── agent-frontmatter.ts  # agent frontmatter — parse yaml agent block from issue body
│   ├── adr.ts         # check-adr — validate Architecture Decision Records
│   ├── check-deps.ts  # check-deps — dependency version enforcement
│   ├── issue.ts       # issue transition — apply label-machine state transitions
│   ├── login.ts       # login — authenticate with Auth0
│   ├── logout.ts      # logout — clear local tokens
│   ├── loop.ts        # loop — run command repeatedly on interval
│   ├── pack.ts        # pack/pack-changed — generate llms.txt context files
│   ├── sync-rules.ts  # sync-rules — sync Claude rules across packages
│   ├── users.ts       # users — API user management
│   └── whoami.ts      # whoami — show current user
└── __tests__/         # Test files
```

## Key Commands

### Agent (local mode — runs via @mbe/agent-core)

```bash
mbe agent run "Fix the login bug"    # Create worktree, run Claude, get PR
  --adapter <type>                   # auto, claude, claude-cli, opencode, grok, omp (default: claude)
  --model <model>                    # default: claude-sonnet-5
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
mbe agent cost [id]        # Show per-turn cost breakdown or summary
mbe agent logs <id>        # Stream SSE events
mbe agent cancel <id>      # Cancel running session
mbe agent orchestrate "task"  # Decompose → parallel sessions → PRs
```

### Issue frontmatter

````bash
gh issue view <n> --json body -q .body | mbe agent frontmatter
# Parses the ```yaml agent block from an issue body into mbe agent run flags.
# Empty output = no usable overrides (fall back to model router).
# Warnings → stderr, always exits 0. Schema: docs/agents/issue-tracker.md
````

### Context Management

```bash
mbe pack <package>         # Generate llms.txt for a package
mbe pack-changed           # Regenerate llms.txt for changed packages (git hook)
mbe sync-rules             # Sync Claude rules across packages
```

### Development

```bash
mbe check-adr --staged     # Validate staged changes against ADRs
mbe check-deps             # Enforce dependency version constraints
mbe issue transition <n>   # Apply a label-machine state transition to a GitHub issue
  --to <state>              # ready|in-progress|has-pr|agent-failed|agent-skip
```

### Model Governance

```bash
mbe check-model "<directive>"  # Verify recommended model tier for task complexity
  --issue <number>             # Fetch issue body as the directive
```
