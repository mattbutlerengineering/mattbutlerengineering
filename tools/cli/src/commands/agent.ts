import { Command } from "commander";
import { resolve } from "node:path";
import type { SessionConfig, SessionEvent } from "@mbe/agent-core";
import {
  runSession,
  DEFAULT_SESSION_CONFIG,
  DEFAULT_FEEDBACK_LOOP_CONFIG,
  resolveBudget,
  resolveModel,
  routeModelWithReason,
} from "@mbe/agent-core";
import type {
  AgentSession,
  ApiResponse,
  PaginatedResponse,
  AgentSessionEvent,
} from "@mbe/types";

// ── Helpers ──────────────────────────────────────────────────────────────

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:3003";

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function formatStatus(status: string): string {
  const icons: Record<string, string> = {
    pending: "○ pending",
    running: "◉ running",
    succeeded: "✓ succeeded",
    failed: "✗ failed",
    cancelled: "⊘ cancelled",
  };
  return icons[status] ?? status;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function printSession(session: AgentSession, verbose = false): void {
  console.log(`ID:         ${session.id}`);
  console.log(`Status:     ${formatStatus(session.status)}`);
  console.log(`Task:       ${session.taskDescription}`);
  console.log(`Model:      ${session.model}`);
  console.log(`Budget:     ${formatCost(session.maxBudgetUsd)}`);
  console.log(`Max turns:  ${session.maxTurns}`);
  console.log(`Branch:     ${session.branchName ?? "(not yet created)"}`);

  if (session.prUrl) {
    console.log(`PR:         ${session.prUrl}`);
  }

  if (session.costUsd !== null) {
    console.log(`Cost:       ${formatCost(session.costUsd)}`);
  }

  if (session.numTurns !== null) {
    console.log(`Turns:      ${session.numTurns}`);
  }

  if (session.durationMs !== null) {
    console.log(`Duration:   ${formatDuration(session.durationMs)}`);
  }

  if (session.inputTokens !== null && session.outputTokens !== null) {
    console.log(
      `Tokens:     ${session.inputTokens.toLocaleString()} in / ${session.outputTokens.toLocaleString()} out`
    );
  }

  console.log(`Created:    ${formatTimestamp(session.createdAt)}`);

  if (session.startedAt) {
    console.log(`Started:    ${formatTimestamp(session.startedAt)}`);
  }

  if (session.completedAt) {
    console.log(`Completed:  ${formatTimestamp(session.completedAt)}`);
  }

  if (session.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of session.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (verbose && session.resultText) {
    console.log("");
    console.log("Agent output:");
    console.log(session.resultText);
  }
}

async function agentApiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${AGENT_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({
      message: response.statusText,
    }))) as { message?: string };
    throw new Error(error.message ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function handleEvent(event: SessionEvent, verbose: boolean): void {
  if (!verbose) return;

  const timestamp = new Date(event.timestamp).toLocaleTimeString();

  if (event.type === "session:start" || event.type === "session:result") {
    const data = event.data as { message: string };
    console.log(`[${timestamp}] ${data.message}`);
  } else if (event.type === "session:error") {
    const data = event.data as { message: string };
    console.error(`[${timestamp}] ERROR: ${data.message}`);
  } else if (event.type === "session:message" && verbose) {
    const msg = event.data as { type: string };
    if (msg.type === "assistant") {
      console.log(`[${timestamp}] Agent is working...`);
    }
  }
}

// ── Command definitions ──────────────────────────────────────────────────

export const checkModelCommand = new Command("check-model")
  .description("Dry-run model selection for a directive")
  .argument("<directive>", "The task description")
  .action(async (directive: string) => {
    const result = routeModelWithReason({
      title: directive,
      labels: [], // No labels in dry-run
      body: "",
    });

    console.log("\n🤖 Model Selection Dry-Run");
    console.log("==========================");
    console.log(`Directive:  "${directive}"`);
    console.log(`Tier:       ${result.tier.toUpperCase()}`);
    console.log(`Model ID:   ${result.modelId}`);
    console.log(`Reason:     ${result.reason}`);
    console.log("");
  });

export const agentCommand = new Command("agent").description(
  "Run autonomous coding agents"
);

// ── Local execution: mbe agent run ───────────────────────────────────────

agentCommand
  .command("run <task>")
  .description("Run an agent session locally (no API server required)")
  .option("-m, --model <model>", "Claude model to use", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--max-budget <usd>",
    "Maximum budget in USD",
    String(DEFAULT_SESSION_CONFIG.maxBudgetUsd)
  )
  .option(
    "--max-turns <n>",
    "Maximum conversation turns",
    String(DEFAULT_SESSION_CONFIG.maxTurns)
  )
  .option("--base-branch <branch>", "Base branch for the worktree", DEFAULT_SESSION_CONFIG.baseBranch)
  .option("--no-pr", "Skip PR creation, keep worktree for inspection")
  .option("-v, --verbose", "Stream all agent events", false)
  .action(
    async (
      task: string,
      options: {
        model: string;
        maxBudget: string;
        maxTurns: string;
        baseBranch: string;
        pr: boolean;
        verbose: boolean;
      }
    ) => {
      const repoPath = resolve(process.cwd());

      // Use task intelligence for smart defaults when user doesn't override
      const smartBudget = resolveBudget(task);
      const smartModel = resolveModel(task);

      const isDefaultModel = options.model === DEFAULT_SESSION_CONFIG.model;
      const isDefaultBudget = options.maxBudget === String(DEFAULT_SESSION_CONFIG.maxBudgetUsd);
      const isDefaultTurns = options.maxTurns === String(DEFAULT_SESSION_CONFIG.maxTurns);

      const config: SessionConfig = {
        taskDescription: task,
        repoPath,
        baseBranch: options.baseBranch,
        model: isDefaultModel ? smartModel : options.model,
        maxTurns: isDefaultTurns ? smartBudget.maxTurns : parseInt(options.maxTurns, 10),
        maxBudgetUsd: isDefaultBudget ? smartBudget.budgetUsd : parseFloat(options.maxBudget),
        allowedTools: [...DEFAULT_SESSION_CONFIG.allowedTools],
        createPr: options.pr,
        feedbackLoop: DEFAULT_FEEDBACK_LOOP_CONFIG,
      };

      console.log("Agent Session (local)");
      console.log("─────────────────────");
      console.log(`Task:       ${task}`);
      console.log(`Model:      ${config.model}`);
      console.log(`Budget:     ${formatCost(config.maxBudgetUsd)}`);
      console.log(`Max turns:  ${config.maxTurns}`);
      console.log(`Create PR:  ${config.createPr ? "yes" : "no"}`);
      console.log("");

      try {
        const result = await runSession(config, (event) =>
          handleEvent(event, options.verbose)
        );

        console.log("");
        console.log("Result");
        console.log("──────");
        console.log(`Status:     ${formatStatus(result.status)}`);
        console.log(`Branch:     ${result.branchName}`);
        console.log(`Duration:   ${formatDuration(result.durationMs)}`);
        console.log(`Cost:       ${formatCost(result.costUsd)}`);
        console.log(`Turns:      ${result.numTurns}`);
        console.log(
          `Tokens:     ${result.tokenUsage.inputTokens.toLocaleString()} in / ${result.tokenUsage.outputTokens.toLocaleString()} out`
        );

        if (result.prUrl) {
          console.log(`PR:         ${result.prUrl}`);
        }

        if (result.errors.length > 0) {
          console.log("");
          console.log("Errors:");
          for (const error of result.errors) {
            console.log(`  - ${error}`);
          }
        }

        if (result.resultText && options.verbose) {
          console.log("");
          console.log("Agent output:");
          console.log(result.resultText);
        }

        process.exit(result.status === "succeeded" ? 0 : 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\nFatal error: ${message}`);
        process.exit(1);
      }
    }
  );

// ── API-backed commands ──────────────────────────────────────────────────

agentCommand
  .command("start <task>")
  .description("Create and start a session via the agent API")
  .option("-m, --model <model>", "Claude model to use", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--max-budget <usd>",
    "Maximum budget in USD",
    String(DEFAULT_SESSION_CONFIG.maxBudgetUsd)
  )
  .option(
    "--max-turns <n>",
    "Maximum conversation turns",
    String(DEFAULT_SESSION_CONFIG.maxTurns)
  )
  .option("--base-branch <branch>", "Base branch", DEFAULT_SESSION_CONFIG.baseBranch)
  .option("-f, --follow", "Follow session logs after creation", false)
  .action(
    async (
      task: string,
      options: {
        model: string;
        maxBudget: string;
        maxTurns: string;
        baseBranch: string;
        follow: boolean;
      }
    ) => {
      try {
        const response = await agentApiRequest<ApiResponse<AgentSession>>("/v1/sessions", {
          method: "POST",
          body: JSON.stringify({
            taskDescription: task,
            model: options.model,
            maxTurns: parseInt(options.maxTurns, 10),
            maxBudgetUsd: parseFloat(options.maxBudget),
            baseBranch: options.baseBranch,
          }),
        });

        console.log("Session created");
        console.log("───────────────");
        printSession(response.data);

        if (options.follow) {
          console.log("");
          console.log("Streaming events...");
          console.log("");
          await streamEvents(response.data.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    }
  );

agentCommand
  .command("list")
  .description("List sessions from the agent API")
  .option("-p, --page <number>", "Page number", "1")
  .option("-l, --limit <number>", "Items per page", "10")
  .option(
    "-s, --status <status>",
    "Filter by status (pending, running, succeeded, failed, cancelled)"
  )
  .action(
    async (options: { page: string; limit: string; status?: string }) => {
      try {
        const params = new URLSearchParams({
          page: options.page,
          limit: options.limit,
        });
        if (options.status) {
          params.set("status", options.status);
        }

        const response = await agentApiRequest<PaginatedResponse<AgentSession>>(
          `/v1/sessions?${params.toString()}`
        );

        if (response.data.length === 0) {
          console.log("No sessions found");
          return;
        }

        console.log("Sessions");
        console.log("────────");
        console.log("");

        // Table header
        const header = [
          "ID".padEnd(28),
          "Status".padEnd(14),
          "Task".padEnd(40),
          "Cost".padEnd(10),
          "Created",
        ].join("  ");
        console.log(header);
        console.log("─".repeat(header.length));

        for (const session of response.data) {
          const row = [
            session.id.padEnd(28),
            formatStatus(session.status).padEnd(14),
            session.taskDescription.slice(0, 40).padEnd(40),
            (session.costUsd !== null ? formatCost(session.costUsd) : "-").padEnd(10),
            formatTimestamp(session.createdAt),
          ].join("  ");
          console.log(row);
        }

        console.log("");
        console.log(
          `Page ${response.pagination.page} of ${response.pagination.totalPages} (${response.pagination.total} total)`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    }
  );

agentCommand
  .command("status <id>")
  .description("Get session details by ID")
  .option("-v, --verbose", "Show full output text", false)
  .action(async (id: string, options: { verbose: boolean }) => {
    try {
      const response = await agentApiRequest<ApiResponse<AgentSession>>(
        `/v1/sessions/${id}`
      );

      console.log("Session");
      console.log("───────");
      printSession(response.data, options.verbose);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

agentCommand
  .command("logs <id>")
  .description("Stream session events via SSE")
  .action(async (id: string) => {
    try {
      // Verify session exists first
      await agentApiRequest<ApiResponse<AgentSession>>(`/v1/sessions/${id}`);

      console.log(`Streaming events for session ${id}...`);
      console.log("");

      await streamEvents(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

agentCommand
  .command("cancel <id>")
  .description("Cancel a running session")
  .action(async (id: string) => {
    try {
      const response = await agentApiRequest<ApiResponse<AgentSession>>(
        `/v1/sessions/${id}/cancel`,
        { method: "POST" }
      );

      console.log("Session cancelled");
      console.log("─────────────────");
      printSession(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

agentCommand
  .command("delete <id>")
  .description("Delete a session")
  .action(async (id: string) => {
    try {
      await agentApiRequest<void>(`/v1/sessions/${id}`, {
        method: "DELETE",
      });
      console.log(`Session ${id} deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ── Orchestration command ─────────────────────────────────────────────────

agentCommand
  .command("orchestrate <task>")
  .description("Decompose a complex task into parallel agent sessions")
  .option("-m, --model <model>", "Model for the orchestrator agent", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--session-model <model>",
    "Model for child coding sessions",
    DEFAULT_SESSION_CONFIG.model
  )
  .option(
    "--max-budget <usd>",
    "Budget cap per child session in USD",
    String(DEFAULT_SESSION_CONFIG.maxBudgetUsd)
  )
  .option(
    "--max-turns <n>",
    "Max turns per child session",
    String(DEFAULT_SESSION_CONFIG.maxTurns)
  )
  .option("--base-branch <branch>", "Base branch", DEFAULT_SESSION_CONFIG.baseBranch)
  .option("--max-concurrent <n>", "Max parallel child sessions", "3")
  .action(
    async (
      task: string,
      options: {
        model: string;
        sessionModel: string;
        maxBudget: string;
        maxTurns: string;
        baseBranch: string;
        maxConcurrent: string;
      }
    ) => {
      console.log("Orchestration");
      console.log("─────────────");
      console.log(`Task:            ${task}`);
      console.log(`Orchestrator:    ${options.model}`);
      console.log(`Session model:   ${options.sessionModel}`);
      console.log(`Budget/session:  ${formatCost(parseFloat(options.maxBudget))}`);
      console.log(`Max concurrent:  ${options.maxConcurrent}`);
      console.log("");
      console.log("Sending to agent service...");
      console.log("");

      try {
        interface OrchestrateApiResponse {
          data: {
            parentSessionId: string;
            status: string;
            childSessionIds: string[];
            summary: string;
            totalCostUsd: number;
            durationMs: number;
          };
        }

        const response = await agentApiRequest<OrchestrateApiResponse>("/v1/orchestrate", {
          method: "POST",
          body: JSON.stringify({
            taskDescription: task,
            model: options.model,
            sessionModel: options.sessionModel,
            maxBudgetPerSession: parseFloat(options.maxBudget),
            maxTurnsPerSession: parseInt(options.maxTurns, 10),
            baseBranch: options.baseBranch,
            maxConcurrentSessions: parseInt(options.maxConcurrent, 10),
          }),
        });

        const { data } = response;

        console.log("Orchestration Result");
        console.log("────────────────────");
        console.log(`Status:          ${formatStatus(data.status)}`);
        console.log(`Parent session:  ${data.parentSessionId}`);
        console.log(`Child sessions:  ${data.childSessionIds.length}`);
        console.log(`Total cost:      ${formatCost(data.totalCostUsd)}`);
        console.log(`Duration:        ${formatDuration(data.durationMs)}`);
        console.log("");

        if (data.childSessionIds.length > 0) {
          console.log("Child Sessions:");
          for (const childId of data.childSessionIds) {
            try {
              const child = await agentApiRequest<ApiResponse<AgentSession>>(
                `/v1/sessions/${childId}`
              );
              const s = child.data;
              console.log(
                `  ${formatStatus(s.status).padEnd(14)} ${s.id}  ${s.prUrl ?? "(no PR)"}`
              );
            } catch {
              console.log(`  ?              ${childId}`);
            }
          }
          console.log("");
        }

        if (data.summary) {
          console.log("Summary:");
          console.log(data.summary);
        }

        const exitCode = data.status === "succeeded" ? 0 : 1;
        process.exit(exitCode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    }
  );

// ── SSE streaming helper ─────────────────────────────────────────────────

async function streamEvents(sessionId: string): Promise<void> {
  const response = await fetch(`${AGENT_API_URL}/v1/sessions/${sessionId}/events`);

  if (!response.ok) {
    throw new Error(`Failed to connect to event stream (${response.status})`);
  }

  if (!response.body) {
    throw new Error("No response body for event stream");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ")) {
          const rawData = line.slice(6);

          if (currentEvent === "stream:end") {
            const data = JSON.parse(rawData) as { reason: string; status?: string };
            console.log(`\nStream ended: ${data.reason}${data.status ? ` (${data.status})` : ""}`);
            return;
          }

          if (currentEvent === "stream:error") {
            const data = JSON.parse(rawData) as { message: string };
            console.error(`\nStream error: ${data.message}`);
            return;
          }

          const event = JSON.parse(rawData) as AgentSessionEvent;
          const timestamp = new Date(event.createdAt).toLocaleTimeString();
          const message = (event.data as { message?: string }).message;

          if (message) {
            console.log(`[${timestamp}] ${event.type}: ${message}`);
          } else {
            console.log(`[${timestamp}] ${event.type}: ${JSON.stringify(event.data)}`);
          }

          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
