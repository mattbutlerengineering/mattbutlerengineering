import { Command } from "commander";
import { resolve, dirname, join } from "node:path";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import type { SessionConfig, SessionEvent, AdapterType } from "@mbe/agent-core";
import {
  runAgentSession,
  resolveSessionAdapter,
  DEFAULT_SESSION_CONFIG,
  DEFAULT_FEEDBACK_LOOP_CONFIG,
  resolveBudget,
  resolveModel,
  AllAdaptersUnavailableError,
} from "@mbe/agent-core";
import { formatDuration, formatCost, formatStatus } from "./shared.js";

/** Absolute path to the canonical agent spend log. */
const SPEND_LOG_PATH = join(
  dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "..",
  "..",
  "..",
  ".claude",
  "agent-spend.jsonl"
);

interface SpendRecord {
  date: string;
  timestamp: string;
  costUsd: number;
  issueNumber: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
}

/**
 * Append one spend record to .claude/agent-spend.jsonl.
 * Scoped to `mbe agent run` (claude adapter) completions only.
 * Never throws — logging failure must not crash the CLI.
 */
function logSpend(record: SpendRecord): void {
  try {
    const logDir = dirname(SPEND_LOG_PATH);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    appendFileSync(SPEND_LOG_PATH, JSON.stringify(record) + "\n");
  } catch {
    // Silently swallow — spend logging is best-effort
  }
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

const VALID_ADAPTERS: readonly AdapterType[] = ["auto", "claude", "gemini", "opencode"];

function isAdapterType(value: string): value is AdapterType {
  return (VALID_ADAPTERS as readonly string[]).includes(value);
}

export const runCommand = new Command("run")
  .argument("<task>")
  .description("Run an agent session locally (no API server required)")
  .option("-m, --model <model>", "Claude model to use", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--max-budget <usd>",
    "Maximum budget in USD",
    String(DEFAULT_SESSION_CONFIG.maxBudgetUsd)
  )
  .option("--max-turns <n>", "Maximum conversation turns", String(DEFAULT_SESSION_CONFIG.maxTurns))
  .option(
    "--base-branch <branch>",
    "Base branch for the worktree",
    DEFAULT_SESSION_CONFIG.baseBranch
  )
  .option("--adapter <type>", "Agent adapter: auto, claude, gemini, opencode", "claude")
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
        adapter: string;
        pr: boolean;
        verbose: boolean;
      },
      command: Command
    ) => {
      const repoPath = resolve(process.cwd());

      if (!isAdapterType(options.adapter)) {
        console.error(
          `Invalid adapter: "${options.adapter}". Must be one of: ${VALID_ADAPTERS.join(", ")}`
        );
        process.exit(1);
        return;
      }
      const adapterType = options.adapter;

      // Use task intelligence for smart defaults when user doesn't override
      const smartBudget = resolveBudget(task);
      const smartModel = resolveModel(task);

      // Detect overrides by option SOURCE, not value-equality with defaults:
      // an explicit --model equal to the default (e.g. from issue frontmatter,
      // #2021) must pin the model instead of falling through to the router.
      const isDefaultModel = command.getOptionValueSource("model") !== "cli";
      const isDefaultBudget = command.getOptionValueSource("maxBudget") !== "cli";
      const isDefaultTurns = command.getOptionValueSource("maxTurns") !== "cli";

      const resolvedModel = isDefaultModel ? smartModel : options.model;
      const resolvedMaxTurns = isDefaultTurns
        ? smartBudget.maxTurns
        : parseInt(options.maxTurns, 10);
      const resolvedMaxBudgetUsd = isDefaultBudget
        ? smartBudget.budgetUsd
        : parseFloat(options.maxBudget);

      // Single entry point for every adapter (#2973): the failover cascade
      // and the full gate/publish pipeline live in agent-core, behind
      // runAgentSession(). The CLI just resolves the adapter string and
      // prints the result.
      const config: SessionConfig = {
        taskDescription: task,
        repoPath,
        baseBranch: options.baseBranch,
        model: resolvedModel,
        maxTurns: resolvedMaxTurns,
        maxBudgetUsd: resolvedMaxBudgetUsd,
        allowedTools: [...DEFAULT_SESSION_CONFIG.allowedTools],
        createPr: options.pr,
        feedbackLoop: DEFAULT_FEEDBACK_LOOP_CONFIG,
      };

      console.log("Agent Session (local)");
      console.log("─────────────────────");
      console.log(`Task:       ${task}`);
      console.log(`Adapter:    ${adapterType}`);
      console.log(`Model:      ${config.model}`);
      console.log(`Budget:     ${formatCost(config.maxBudgetUsd)}`);
      console.log(`Max turns:  ${config.maxTurns}`);
      console.log(`Create PR:  ${config.createPr ? "yes" : "no"}`);
      console.log("");

      try {
        const adapter = resolveSessionAdapter(adapterType);
        const result = await runAgentSession(config, {
          adapter,
          onEvent: (event) => handleEvent(event, options.verbose),
        });

        // Log spend telemetry to .claude/agent-spend.jsonl (best-effort).
        logSpend({
          date: new Date().toISOString().slice(0, 10),
          timestamp: new Date().toISOString(),
          costUsd: result.costUsd,
          issueNumber: null,
          model: config.model,
          inputTokens: result.tokenUsage.inputTokens,
          outputTokens: result.tokenUsage.outputTokens,
          numTurns: result.numTurns,
        });

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
        if (error instanceof AllAdaptersUnavailableError) {
          console.error("\nAll agent adapters are rate-limited or unavailable.");
          if (error.cooldowns.size > 0) {
            console.error("Cooldown times:");
            for (const [adapterName, until] of error.cooldowns) {
              const remainingMs = Math.max(0, until - Date.now());
              const remainingSec = Math.ceil(remainingMs / 1000);
              console.error(`  ${adapterName}: ${remainingSec}s remaining`);
            }
          }
          process.exit(1);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\nFatal error: ${message}`);
        process.exit(1);
      }
    }
  );
