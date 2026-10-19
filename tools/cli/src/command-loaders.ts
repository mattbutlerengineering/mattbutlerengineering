import type { Command } from "commander";

type CommandLoader = () => Promise<Command>;

// Each command module is imported only when it is needed, so commands such as
// pack / check-adr / check-deps run without the dist/ of workspace packages
// (@mbe/agent-core, @mbe/gh-client, ...) that other commands import.
// Registration order matches the order shown in `mbe --help`.
const LOADERS: ReadonlyArray<readonly [string, CommandLoader]> = [
  ["login", async () => (await import("./commands/login.js")).loginCommand],
  ["logout", async () => (await import("./commands/logout.js")).logoutCommand],
  ["whoami", async () => (await import("./commands/whoami.js")).whoamiCommand],
  ["users", async () => (await import("./commands/users.js")).usersCommand],
  ["agent", async () => (await import("./commands/agent.js")).agentCommand],
  ["check-model", async () => (await import("./commands/agent.js")).checkModelCommand],
  ["loop", async () => (await import("./commands/loop.js")).loopCommand],
  ["pack", async () => (await import("./commands/pack.js")).packCommand],
  ["pack-changed", async () => (await import("./commands/pack.js")).packChangedCommand],
  ["sync-rules", async () => (await import("./commands/sync-rules.js")).syncRulesCommand],
  ["check-adr", async () => (await import("./commands/adr.js")).checkAdrCommand],
  ["check-deps", async () => (await import("./commands/check-deps.js")).checkDepsCommand],
  ["issue", async () => (await import("./commands/issue.js")).issueCommand],
];

export const COMMAND_NAMES: readonly string[] = LOADERS.map(([name]) => name);

/**
 * Register commands on `program`. When argv names a known command, only that
 * command's module is imported. Otherwise (no command, `--help`, unknown name)
 * every command is loaded so help output and error messages are unchanged.
 */
export async function registerCommands(program: Command, argv: readonly string[]): Promise<void> {
  const requested = argv.find((arg) => !arg.startsWith("-"));
  const selected = LOADERS.filter(([name]) => name === requested);
  const toLoad = selected.length > 0 ? selected : LOADERS;
  // Sequential load keeps registration order (and any load error) deterministic.
  for (const [, load] of toLoad) {
    program.addCommand(await load());
  }
}
