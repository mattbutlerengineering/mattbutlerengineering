import { Command } from "commander";
import { DEFAULT_SESSION_CONFIG } from "@mbe/agent-core";
import type { AgentSession, ApiResponse } from "@mbe/types";
import { createAgentApiClient } from "../../cli-api-client.js";
import { formatDuration, formatCost, formatStatus } from "./shared.js";

export const orchestrateCommand = new Command("orchestrate")
  .argument("<task>")
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
  .option("--max-turns <n>", "Max turns per child session", String(DEFAULT_SESSION_CONFIG.maxTurns))
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

        const response = await createAgentApiClient().request<OrchestrateApiResponse>(
          "/v1/orchestrate",
          {
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
          }
        );

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
              const child = await createAgentApiClient().request<ApiResponse<AgentSession>>(
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
