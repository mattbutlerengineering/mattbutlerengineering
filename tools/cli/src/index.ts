#!/usr/bin/env node
import { Command } from "commander";
import { registerCommands } from "./command-loaders.js";

const program = new Command();

program.name("mbe").description("Matt Butler Engineering CLI").version("0.0.0");

async function main(): Promise<void> {
  await registerCommands(program, process.argv.slice(2));
  await program.parseAsync();
}

main().catch((err) => {
  if (err instanceof Error) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
  } else {
    console.error(`\x1b[31mError:\x1b[0m ${String(err)}`);
  }
  process.exit(1);
});
