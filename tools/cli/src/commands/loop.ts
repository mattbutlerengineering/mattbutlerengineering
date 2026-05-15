import { Command } from "commander";
import { runSession, DEFAULT_SESSION_CONFIG, resolveBudget, resolveModel } from "@mbe/agent-core";
import type { SessionEvent } from "@mbe/agent-core";

// ── Command ───────────────────────────────────────────────────────────────

export const loopCommand = new Command("loop")
  .description("Run an agent directive in an autonomous loop (Ralph Wiggum pattern)")
  .argument("<directive>", "The task for the agent to complete")
  .option("--max-loops <number>", "Maximum number of iterations", parseInt, 10)
  .option("--model <model>", "LLM model to use")
  .option("--max-budget <usd>", "Maximum budget for the entire loop", "1.00")
  .option("--max-turns <n>", "Maximum turns per iteration", parseInt, 50)
  .option("-v, --verbose", "Show detailed agent events", false)
  .action(async (directive: string, options) => {
    let currentLoop = 1;
    let totalCost = 0;
    let taskComplete = false;

    // Resolve max budget
    const budgetConfig = resolveBudget(directive);
    const maxBudgetUsd = options.maxBudget ? parseFloat(options.maxBudget) : budgetConfig.budgetUsd;

    console.log(`🚀 Starting Ralph Wiggum Loop: "${directive}"`);
    console.log(`Target: ${options.maxLoops} iterations, Max Budget: $${maxBudgetUsd}\n`);

    while (currentLoop <= options.maxLoops && !taskComplete) {
      console.log(`--- Iteration ${currentLoop}/${options.maxLoops} ---`);

      const config = {
        ...DEFAULT_SESSION_CONFIG,
        taskDescription: directive,
        repoPath: process.cwd(),
        model: resolveModel(options.model || directive),
        maxBudgetUsd: maxBudgetUsd - totalCost,
        maxTurns: options.maxTurns,
      };

      try {
        const result = await runSession(config, (event: SessionEvent) => {
          if (options.verbose) {
            const timestamp = new Date(event.timestamp).toLocaleTimeString();
            if (event.type === "session:start" || event.type === "session:result") {
              const data = event.data as { message: string };
              console.log(`[${timestamp}] ${data.message}`);
            }
          }
        });

        totalCost += result.costUsd;
        console.log(
          `Iteration ${currentLoop} cost: $${result.costUsd.toFixed(4)} (Total: $${totalCost.toFixed(4)})`
        );

        if (result.status === "succeeded") {
          if (
            result.resultText?.includes("<promise>COMPLETE</promise>") ||
            result.resultText?.includes("DONE")
          ) {
            console.log("\n✅ Task marked as complete by agent.");
            taskComplete = true;
          } else {
            console.log("Iteration finished but no completion token found. Continuing...");
          }
        } else {
          console.log(
            `Iteration failed with status: ${result.status}. Restarting with fresh context...`
          );
        }
      } catch (error) {
        console.error(
          `Error in iteration ${currentLoop}:`,
          error instanceof Error ? error.message : error
        );
      }

      if (totalCost >= maxBudgetUsd) {
        console.log("\n⚠️ Budget limit reached. Stopping loop.");
        break;
      }

      currentLoop++;
    }

    if (taskComplete) {
      console.log(`\n🎉 Successfully completed task in ${currentLoop - 1} iterations.`);
    } else if (currentLoop > options.maxLoops) {
      console.log(`\n❌ Reached maximum iterations (${options.maxLoops}) without completion.`);
    }

    console.log(
      `Final stats: Total iterations: ${currentLoop - 1}, Total cost: $${totalCost.toFixed(4)}`
    );
  });
