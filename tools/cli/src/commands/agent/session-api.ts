import { Command } from "commander";
import { DEFAULT_SESSION_CONFIG } from "@mbe/agent-core";
import type { AgentSession, ApiResponse, PaginatedResponse, AgentSessionEvent } from "@mbe/types";
import { createAgentApiClient } from "../../cli-api-client.js";
import { formatStatus, formatTimestamp, formatCost, printSession } from "./shared.js";

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:3003";

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

// ── mbe agent start ──────────────────────────────────────────────────────

export const startCommand = new Command("start")
  .argument("<task>")
  .description("Create and start a session via the agent API")
  .option("-m, --model <model>", "Claude model to use", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--max-budget <usd>",
    "Maximum budget in USD",
    String(DEFAULT_SESSION_CONFIG.maxBudgetUsd)
  )
  .option("--max-turns <n>", "Maximum conversation turns", String(DEFAULT_SESSION_CONFIG.maxTurns))
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
        const response = await createAgentApiClient().request<ApiResponse<AgentSession>>(
          "/v1/sessions",
          {
            method: "POST",
            body: JSON.stringify({
              taskDescription: task,
              model: options.model,
              maxTurns: parseInt(options.maxTurns, 10),
              maxBudgetUsd: parseFloat(options.maxBudget),
              baseBranch: options.baseBranch,
            }),
          }
        );

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

// ── mbe agent list ───────────────────────────────────────────────────────

export const listCommand = new Command("list")
  .description("List sessions from the agent API")
  .option("-p, --page <number>", "Page number", "1")
  .option("-l, --limit <number>", "Items per page", "10")
  .option(
    "-s, --status <status>",
    "Filter by status (pending, running, succeeded, failed, cancelled)"
  )
  .action(async (options: { page: string; limit: string; status?: string }) => {
    try {
      const params = new URLSearchParams({
        page: options.page,
        limit: options.limit,
      });
      if (options.status) {
        params.set("status", options.status);
      }

      const response = await createAgentApiClient().request<PaginatedResponse<AgentSession>>(
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
  });

// ── mbe agent status ─────────────────────────────────────────────────────

export const statusCommand = new Command("status")
  .argument("<id>")
  .description("Get session details by ID")
  .option("-v, --verbose", "Show full output text", false)
  .action(async (id: string, options: { verbose: boolean }) => {
    try {
      const response = await createAgentApiClient().request<ApiResponse<AgentSession>>(
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

// ── mbe agent logs ───────────────────────────────────────────────────────

export const logsCommand = new Command("logs")
  .argument("<id>")
  .description("Stream session events via SSE")
  .action(async (id: string) => {
    try {
      // Verify session exists first
      await createAgentApiClient().request<ApiResponse<AgentSession>>(`/v1/sessions/${id}`);

      console.log(`Streaming events for session ${id}...`);
      console.log("");

      await streamEvents(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ── mbe agent cancel ─────────────────────────────────────────────────────

export const cancelCommand = new Command("cancel")
  .argument("<id>")
  .description("Cancel a running session")
  .action(async (id: string) => {
    try {
      const response = await createAgentApiClient().request<ApiResponse<AgentSession>>(
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

// ── mbe agent delete ─────────────────────────────────────────────────────

export const deleteCommand = new Command("delete")
  .argument("<id>")
  .description("Delete a session")
  .action(async (id: string) => {
    try {
      await createAgentApiClient().request<void>(`/v1/sessions/${id}`, {
        method: "DELETE",
      });
      console.log(`Session ${id} deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
