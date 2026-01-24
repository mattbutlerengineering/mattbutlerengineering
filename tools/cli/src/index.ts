#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { usersCommand } from "./commands/users.js";

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

program.parse();
