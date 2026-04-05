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

// Context commands
program.addCommand(packCommand);
program.addCommand(packChangedCommand);
program.addCommand(syncRulesCommand);

// Observability commands
program.addCommand(statsCommand);
program.addCommand(logSessionCommand);
program.addCommand(auditPerfCommand);

// Architecture commands
program.addCommand(checkAdrCommand);

program.parse();
