#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { usersCommand } from "./commands/users.js";
import { agentCommand, checkModelCommand } from "./commands/agent.js";
import { newCommand } from "./commands/new.js";
import { packCommand, packChangedCommand } from "./commands/pack.js";
import { statsCommand, logSessionCommand, auditPerfCommand } from "./commands/stats.js";
import { syncRulesCommand } from "./commands/sync-rules.js";
import { loopCommand } from "./commands/loop.js";
import { checkAdrCommand } from "./commands/adr.js";
import { upCommand } from "./commands/up.js";
import { waveCommand } from "./commands/wave.js";
import { generateCommand } from "./commands/generate.js";
import { visualCommand } from "./commands/visual.js";
import { primeCommand } from "./commands/prime.js";
import { checkDepsCommand } from "./commands/check-deps.js";
import { cleanupWorktreesCommand } from "./commands/cleanup-worktrees.js";
import { healthCommand } from "./commands/health.js";
import { mcpCommand } from "./commands/mcp.js";

const program = new Command();

program
  .name("mbe")
  .description("Matt Butler Engineering CLI")
  .version("0.0.0");

// Auth commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);

// API commands
program.addCommand(usersCommand);

// Agent commands
program.addCommand(agentCommand);
program.addCommand(checkModelCommand);
program.addCommand(loopCommand);
program.addCommand(waveCommand);

// Scaffold commands
program.addCommand(newCommand);
program.addCommand(upCommand);
program.addCommand(generateCommand);

// Context commands
program.addCommand(packCommand);
program.addCommand(packChangedCommand);
program.addCommand(syncRulesCommand);
program.addCommand(primeCommand);

// Observability commands
program.addCommand(statsCommand);
program.addCommand(logSessionCommand);
program.addCommand(auditPerfCommand);

// Architecture commands
program.addCommand(checkAdrCommand);
program.addCommand(checkDepsCommand);

// Infrastructure commands
program.addCommand(cleanupWorktreesCommand);
program.addCommand(healthCommand);
program.addCommand(mcpCommand);

// UI commands
program.addCommand(visualCommand);

program.parseAsync().catch((err) => {
  if (err instanceof Error) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
  } else {
    console.error(`\x1b[31mError:\x1b[0m ${String(err)}`);
  }
  process.exit(1);
});
