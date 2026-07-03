import { Command } from "commander";
import type { AgentSession, ApiResponse, PaginatedResponse } from "@mbe/types";
import { createAgentApiClient } from "../../cli-api-client.js";
import { formatStatus, formatCost } from "./shared.js";

interface TurnMetrics {
  turnIndex: number;
  startedAt: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  modelId: string;
}

interface ToolCallMetrics {
  toolName: string;
  toolUseId: string;
  latencyMs: number;
  isError: boolean;
}

interface SessionWithMetrics extends AgentSession {
  turnMetrics?: TurnMetrics[];
  toolCallMetrics?: ToolCallMetrics[];
  failureCategory?: string;
}

function printCostBreakdown(session: SessionWithMetrics): void {
  const turns = session.turnMetrics ?? [];
  const tools = session.toolCallMetrics ?? [];

  console.log(`Session:    ${session.id}`);
  console.log(`Task:       ${session.taskDescription}`);
  console.log(`Status:     ${formatStatus(session.status)}`);

  if (session.failureCategory) {
    console.log(`Failure:    ${session.failureCategory}`);
  }

  console.log("");

  if (turns.length === 0) {
    console.log("No per-turn metrics available for this session.");
    console.log("(Metrics are only recorded for sessions run after this feature was added.)");
  } else {
    console.log("Per-Turn Cost Breakdown");
    console.log("──────────────────────");

    // Table header
    const header = [
      "Turn".padEnd(6),
      "Model".padEnd(24),
      "Input Tokens".padEnd(14),
      "Output Tokens".padEnd(15),
      "Cost (USD)",
    ].join("  ");
    console.log(header);
    console.log("─".repeat(header.length));

    for (const turn of turns) {
      const row = [
        String(turn.turnIndex).padEnd(6),
        (turn.modelId || "unknown").slice(0, 24).padEnd(24),
        turn.inputTokens.toLocaleString().padEnd(14),
        turn.outputTokens.toLocaleString().padEnd(15),
        formatCost(turn.costUsd),
      ].join("  ");
      console.log(row);
    }

    const totalIn = turns.reduce((s, t) => s + t.inputTokens, 0);
    const totalOut = turns.reduce((s, t) => s + t.outputTokens, 0);
    const totalCost = session.costUsd ?? 0;

    console.log("─".repeat(header.length));
    console.log(
      [
        "TOTAL".padEnd(6),
        "".padEnd(24),
        totalIn.toLocaleString().padEnd(14),
        totalOut.toLocaleString().padEnd(15),
        formatCost(totalCost),
      ].join("  ")
    );
  }

  if (tools.length > 0) {
    console.log("");
    console.log("Tool Call Latency");
    console.log("─────────────────");

    // Group by tool name and compute stats
    const byTool = new Map<string, number[]>();
    for (const call of tools) {
      const existing = byTool.get(call.toolName) ?? [];
      byTool.set(call.toolName, [...existing, call.latencyMs]);
    }

    const toolHeader = [
      "Tool".padEnd(16),
      "Calls".padEnd(8),
      "Avg (ms)".padEnd(12),
      "Max (ms)",
    ].join("  ");
    console.log(toolHeader);
    console.log("─".repeat(toolHeader.length));

    for (const [toolName, latencies] of byTool) {
      const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
      const max = Math.max(...latencies);
      const row = [
        toolName.slice(0, 16).padEnd(16),
        String(latencies.length).padEnd(8),
        avg.toFixed(0).padEnd(12),
        String(max),
      ].join("  ");
      console.log(row);
    }
  }
}

export const costCommand = new Command("cost")
  .argument("[id]")
  .description("Show per-turn cost breakdown for a session, or cost summary for all sessions")
  .option("--summary", "Show aggregated cost summary across all sessions", false)
  .action(async (id: string | undefined, options: { summary: boolean }) => {
    try {
      if (options.summary || !id) {
        // Summary mode: fetch all sessions and aggregate
        const response =
          await createAgentApiClient().request<PaginatedResponse<AgentSession>>(
            "/v1/sessions?limit=100"
          );

        const sessions = response.data;

        if (sessions.length === 0) {
          console.log("No sessions found.");
          return;
        }

        console.log("Cost Summary");
        console.log("────────────");
        console.log("");

        const totalCost = sessions.reduce((s, sess) => s + (sess.costUsd ?? 0), 0);
        const succeeded = sessions.filter((s) => s.status === "succeeded").length;
        const failed = sessions.filter((s) => s.status === "failed").length;

        console.log(
          `Sessions:   ${sessions.length} total (${succeeded} succeeded, ${failed} failed)`
        );
        console.log(`Total cost: ${formatCost(totalCost)}`);
        console.log(`Avg cost:   ${formatCost(totalCost / sessions.length)}`);

        const withCost = sessions.filter((s) => s.costUsd !== null && s.costUsd > 0);
        if (withCost.length > 0) {
          const maxSession = withCost.reduce((a, b) =>
            (a.costUsd ?? 0) > (b.costUsd ?? 0) ? a : b
          );
          console.log(
            `Max cost:   ${formatCost(maxSession.costUsd ?? 0)} (${maxSession.id.slice(0, 16)}...)`
          );
        }

        console.log("");
        console.log("Recent Sessions");
        console.log("───────────────");

        const sessionHeader = [
          "ID".padEnd(28),
          "Status".padEnd(14),
          "Cost".padEnd(12),
          "Turns",
        ].join("  ");
        console.log(sessionHeader);
        console.log("─".repeat(sessionHeader.length));

        for (const session of sessions.slice(0, 20)) {
          const row = [
            session.id.padEnd(28),
            formatStatus(session.status).padEnd(14),
            (session.costUsd !== null ? formatCost(session.costUsd) : "-").padEnd(12),
            session.numTurns !== null ? String(session.numTurns) : "-",
          ].join("  ");
          console.log(row);
        }
      } else {
        // Per-session breakdown
        const response = await createAgentApiClient().request<ApiResponse<SessionWithMetrics>>(
          `/v1/sessions/${id}`
        );

        console.log("Cost Breakdown");
        console.log("──────────────");
        console.log("");
        printCostBreakdown(response.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
