# @mbe/agent-test-utils

Testing utilities for `@mbe/agent-core`. Provides mocks, simulators, and fixtures to enable deterministic testing without live API calls.

## Key Modules

| Module                  | Responsibility                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mock-claude-client.ts` | Drop-in replacement for the Claude SDK `query` function. Supports deterministic, replay, and error-injection modes. |
| `fixtures.ts`           | Pre-built `SessionEvent[]` sequences mirroring real agent output (success, bug-fix, failure).                       |
| `worktree-simulator.ts` | In-memory git operation mocks for testing worktree lifecycles.                                                      |
| `cost-estimator.ts`     | Offline cost calculation and budget validation helpers.                                                             |
| `fixture-player.ts`     | Utility to step through session events one at a time in tests.                                                      |

## Patterns

- **Deterministic Tests**: Favor `createMockClaudeClient({ mode: "deterministic" })` for basic flow verification.
- **Regression Testing**: Use `mode: "replay"` with saved JSON fixtures to verify fixes against specific historical agent outputs.
- **Error Handling**: Use `errorOnCall` or `errorToInject` to test retry logic and circuit breakers.
- **Simulator State**: The `WorktreeSimulator` supports `clean`, `dirty`, and `conflicted` states to mirror common git scenarios.

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
