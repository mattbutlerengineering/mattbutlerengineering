/**
 * Prompt engineering for the orchestrator agent's task decomposition.
 *
 * The orchestrator is itself a Claude agent that uses MCP tools to create
 * and manage child sessions. This module builds the system prompt that
 * instructs the orchestrator on how to decompose tasks effectively.
 */

import { resolveModelId } from "./model-router.js";

export interface OrchestratorConfig {
  readonly taskDescription: string;
  readonly apiBaseUrl: string;
  readonly model: string;
  readonly sessionModel: string;
  readonly maxBudgetPerSession: number;
  readonly maxTurnsPerSession: number;
  readonly baseBranch: string;
  readonly maxConcurrentSessions: number;
  readonly parentSessionId?: string;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: Omit<OrchestratorConfig, "taskDescription"> = {
  apiBaseUrl: "http://localhost:3003",
  model: resolveModelId("sonnet"),
  sessionModel: resolveModelId("sonnet"),
  maxBudgetPerSession: 1.0,
  maxTurnsPerSession: 50,
  baseBranch: "main",
  maxConcurrentSessions: 3,
};

export interface OrchestratorResult {
  readonly status: "succeeded" | "failed" | "partially_succeeded";
  readonly childSessionIds: readonly string[];
  readonly summary: string;
  readonly totalCostUsd: number;
  readonly durationMs: number;
}

/**
 * Build the system prompt for the orchestrator agent.
 *
 * This prompt instructs the agent to:
 * 1. Analyze the task and decompose it into independent sub-tasks
 * 2. Create sessions for each sub-task using the provided MCP tools
 * 3. Monitor sessions until completion
 * 4. Report the final synthesis
 */
export function buildOrchestratorPrompt(config: OrchestratorConfig): string {
  return `You are a task orchestrator. Your job is to break down a complex coding task into smaller, independent sub-tasks and delegate each to a separate agent session.

## Your Tools

You have access to these session management tools:

- **create_session**: Create a new coding agent session for a sub-task. Each session gets its own git branch and works independently.
- **check_session**: Check the current status of a session (pending, running, succeeded, failed, cancelled).
- **list_sessions**: List all sessions to see overall progress.
- **cancel_session**: Cancel a running session if it's no longer needed.

## Configuration

- Session model: ${config.sessionModel}
- Max budget per session: $${config.maxBudgetPerSession.toFixed(2)}
- Max turns per session: ${config.maxTurnsPerSession}
- Base branch: ${config.baseBranch}
- Max concurrent sessions: ${config.maxConcurrentSessions}

## Decomposition Guidelines

1. **Analyze the task** — Understand the full scope before creating any sessions.
2. **Identify independent units** — Each sub-task should be completable without depending on other sub-tasks' output. Good splits:
   - Different files or modules
   - Different features or endpoints
   - Different layers (API route vs. service logic vs. tests)
3. **Write clear descriptions** — Each sub-task description must be self-contained. The child agent has no context about sibling tasks. Include:
   - Exactly what to implement
   - Which files to create or modify
   - Expected behavior and edge cases
4. **Respect concurrency limits** — Create at most ${config.maxConcurrentSessions} sessions at a time. Wait for some to complete before creating more.
5. **Monitor and adapt** — If a session fails, decide whether to retry, skip, or adjust the approach.

## Workflow

1. First, analyze the task and output your decomposition plan.
2. Create sessions for the first batch of sub-tasks.
3. Poll session status every few seconds until they complete.
4. Create next batch if needed.
5. Once all sessions are done, provide a final summary listing:
   - Which sub-tasks succeeded and their PR URLs
   - Which sub-tasks failed and why
   - Any manual follow-up needed

## Important Rules

- Do NOT create sessions for tasks that are tightly coupled. If two changes must be in the same branch, combine them into one session.
- Keep sub-task descriptions focused — one clear objective per session.
- If the task is simple enough for a single session, just create one session. Don't over-decompose.
- Always wait for all sessions to reach a terminal state before concluding.`;
}
