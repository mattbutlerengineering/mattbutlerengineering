# @mbe/agent-test-utils

Testing utilities for `@mbe/agent-core` that eliminate live API calls and their associated costs. Use these in unit and integration tests to get fast, deterministic, reproducible results.

## Installation

This is a private workspace package. Import it from other packages in this monorepo:

```json
{
  "devDependencies": {
    "@mbe/agent-test-utils": "workspace:*"
  }
}
```

## Modules

### 1. Mock Claude Client

Drop-in replacement for the `query` function from `@anthropic-ai/claude-agent-sdk`.

#### Deterministic mode (default)

Returns a predictable success result for every call — no network, no cost.

```ts
import { createMockClaudeClient } from "@mbe/agent-test-utils";

const client = createMockClaudeClient({
  deterministicCostUsd: 0.05,
  deterministicTokens: { input: 5000, output: 1000 },
});

for await (const msg of client.query({ prompt: "Fix the bug", model: "claude-sonnet-4-6" })) {
  console.log(msg); // { type: "result", subtype: "success", total_cost_usd: 0.05, ... }
}

console.log(client.calls);          // [{ callIndex: 1, prompt: "Fix the bug", ... }]
console.log(client.totalCostUsd()); // 0.05
```

#### Replay mode

Record real API responses to JSON files and replay them in tests.

```ts
const client = createMockClaudeClient({
  mode: "replay",
  fixtures: [
    // Load from a file: JSON.parse(readFileSync("fixtures/session-1.json", "utf-8"))
    [
      { type: "system", subtype: "init" },
      { type: "result", subtype: "success", total_cost_usd: 0.12, /* ... */ },
    ],
  ],
});
```

#### Error injection

Test retry and error-handling paths without hitting rate limits.

```ts
const client = createMockClaudeClient({
  errorOnCall: 2,
  errorToInject: new Error("Rate limit exceeded"),
});

// Call 1: succeeds
// Call 2: throws "Rate limit exceeded"
```

---

### 2. Session Event Fixtures

Pre-built `SessionEvent[]` sequences that mirror real agent output.

```ts
import {
  buildMinimalSuccessFixture,
  buildBugFixFixture,
  buildFailureFixture,
  createFixturePlayer,
  extractToolCalls,
  compareToolCalls,
} from "@mbe/agent-test-utils";

// Minimal: start + assistant + result
const simple = buildMinimalSuccessFixture({ sessionId: "test-123", costUsd: 0.02 });

// Full bug-fix: includes Read, Grep, Edit, Bash tool calls
const bugFix = buildBugFixFixture();

// Error path: includes session:error + failed result
const failure = buildFailureFixture();
```

#### Step-through player

```ts
const player = createFixturePlayer(buildBugFixFixture());

while (player.hasMore()) {
  const event = player.next();
  // process event one at a time
}

player.reset(); // rewind to beginning
```

#### Tool call comparison

```ts
const events = buildBugFixFixture();
const actual = extractToolCalls(events);

const expected = [
  { toolName: "Read", input: {} },
  { toolName: "Edit", input: {} },
];

const diff = compareToolCalls(expected, actual);
if (!diff.passed) {
  console.log("Missing tools:", diff.missing);
  console.log("Unexpected tools:", diff.unexpected);
}
```

#### Save/load fixtures from files

```ts
import { serializeFixture, loadFixtureFromFile } from "@mbe/agent-test-utils";
import { writeFileSync } from "node:fs";

// Save a fixture (e.g. recorded from a real run)
writeFileSync("fixtures/bug-fix.json", serializeFixture(buildBugFixFixture()));

// Load it back
const events = loadFixtureFromFile("fixtures/bug-fix.json");
```

---

### 3. Worktree Simulation

In-memory git operation mocks with three pre-built repo states.

```ts
import {
  createWorktreeSimulator,
  assertOperationCalled,
  assertOperationNotCalled,
} from "@mbe/agent-test-utils";

// Clean repo: hasChanges = false, verification passes
const sim = createWorktreeSimulator({ state: "clean" });

// Dirty repo: hasChanges = true, verification passes
const dirty = createWorktreeSimulator({ state: "dirty" });

// Conflicted: hasChanges = true, verification FAILS
const conflicted = createWorktreeSimulator({ state: "conflicted" });
```

#### Simulating failures

```ts
// createWorktree always throws
const failCreate = createWorktreeSimulator({ failOnCreate: true });

// pushBranch fails N times then succeeds (for retry testing)
const retryPush = createWorktreeSimulator({ failOnPush: true, pushFailCount: 2 });
```

#### Using as vitest mocks

```ts
import { createWorktreeMocks, createWorktreeSimulator } from "@mbe/agent-test-utils";
import { vi } from "vitest";

const sim = createWorktreeSimulator({ state: "dirty" });

vi.mock("../worktree-manager.js", () => createWorktreeMocks(sim));

// In your test:
await runSession(config);
assertOperationCalled(sim, "commitChanges");
assertOperationNotCalled(sim, "removeWorktree");
```

---

### 4. Cost Estimation

Calculate costs and estimate session budgets without API calls.

```ts
import {
  calculateCost,
  estimateSessionCost,
  createCostProfiler,
  wouldExceedBudget,
  estimateTokenCount,
} from "@mbe/agent-test-utils";

// Estimate token count from text
const tokens = estimateTokenCount("Fix the authentication bug in the login flow");

// Calculate cost for known token usage
const cost = calculateCost(
  { inputTokens: 50_000, outputTokens: 5_000 },
  "claude-sonnet-4-6"
);
console.log(`Estimated cost: $${cost.totalCostUsd.toFixed(4)}`);

// Budget planning before running a session
const estimate = estimateSessionCost("Implement OAuth2 login", {
  model: "claude-haiku-4-5",
  numTurns: 10,
  expectedOutputTokens: 800,
});
console.log(`Estimated: $${estimate.totalCostUsd.toFixed(4)}`);

// Guard: would this session exceed budget?
const tooExpensive = wouldExceedBudget("Rewrite entire codebase", 0.50, {
  numTurns: 100,
});
```

#### Profile costs across multiple sessions

```ts
const profiler = createCostProfiler();

profiler.record("session-1", { inputTokens: 5000, outputTokens: 1000 }, 3000);
profiler.record("session-2", { inputTokens: 8000, outputTokens: 1500 }, 5000);

const summary = profiler.summary();
console.log(`Total cost: $${summary.totalCostUsd.toFixed(4)}`);
console.log(`Most expensive: ${summary.mostExpensiveSession?.sessionId}`);
```

## Running Tests

```bash
pnpm --filter @mbe/agent-test-utils test
pnpm --filter @mbe/agent-test-utils test:coverage
```
