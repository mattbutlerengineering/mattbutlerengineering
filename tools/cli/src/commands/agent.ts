import { Command } from "commander";
import { agentEvalCommand } from "./agent-eval.js";
import { frontmatterCommand } from "./agent-frontmatter.js";
import { runCommand } from "./agent/run.js";
import {
  startCommand,
  listCommand,
  statusCommand,
  logsCommand,
  cancelCommand,
  deleteCommand,
} from "./agent/session-api.js";
import { costCommand } from "./agent/cost.js";
import { orchestrateCommand } from "./agent/orchestrate.js";

export { checkModelCommand } from "./agent/check-model.js";

export const agentCommand = new Command("agent").description("Run autonomous coding agents");

// ── Local execution: mbe agent run ───────────────────────────────────────
agentCommand.addCommand(runCommand);

// ── API-backed commands ──────────────────────────────────────────────────
agentCommand.addCommand(startCommand);
agentCommand.addCommand(listCommand);
agentCommand.addCommand(statusCommand);
agentCommand.addCommand(logsCommand);
agentCommand.addCommand(cancelCommand);
agentCommand.addCommand(deleteCommand);

// ── Cost command ─────────────────────────────────────────────────────────
agentCommand.addCommand(costCommand);

// ── Orchestration command ─────────────────────────────────────────────────
agentCommand.addCommand(orchestrateCommand);

// ── Golden-task eval harness: mbe agent eval ─────────────────────────────
// Registered last so `agentCommand.commands[0]` remains the `run` command,
// which tests address positionally.
agentCommand.addCommand(agentEvalCommand);

// ── Issue frontmatter: mbe agent frontmatter (#2021) ─────────────────────
agentCommand.addCommand(frontmatterCommand);
