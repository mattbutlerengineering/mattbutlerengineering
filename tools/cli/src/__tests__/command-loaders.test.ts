import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";

// If a lazily-loaded command reaches any of these, the test fails loudly -
// this simulates a fresh worktree whose workspace dist/ folders are absent.
vi.mock("@mbe/agent-core", () => {
  throw new Error("ERR_MODULE_NOT_FOUND: @mbe/agent-core must not be loaded");
});
vi.mock("@mbe/gh-client", () => {
  throw new Error("ERR_MODULE_NOT_FOUND: @mbe/gh-client must not be loaded");
});
vi.mock("@mbe/types", () => {
  throw new Error("ERR_MODULE_NOT_FOUND: @mbe/types must not be loaded");
});

import { COMMAND_NAMES, registerCommands } from "../command-loaders.js";

const registered = (program: Command) => program.commands.map((c) => c.name());

describe("registerCommands", () => {
  it.each(["pack", "pack-changed", "check-adr", "check-deps"])(
    "loads %s without touching workspace packages",
    async (name) => {
      const program = new Command();
      await registerCommands(program, [name, "--help"]);
      expect(registered(program)).toEqual([name]);
    }
  );

  it("knows every expected command", () => {
    expect([...COMMAND_NAMES].sort()).toEqual(
      [
        "login",
        "logout",
        "whoami",
        "users",
        "agent",
        "check-model",
        "loop",
        "pack",
        "pack-changed",
        "sync-rules",
        "check-adr",
        "check-deps",
        "issue",
      ].sort()
    );
  });

  it.each(["new", "generate", "up", "health"])("does not register retired command %s", (name) => {
    expect(COMMAND_NAMES).not.toContain(name);
  });

  it("loads every command when none is named (help, no args)", async () => {
    const program = new Command();
    // the all-load path reaches agent-core, which is mocked as missing here
    await expect(registerCommands(program, ["--help"])).rejects.toThrow();
  });

  it("falls back to loading everything for an unknown command name", async () => {
    const program = new Command();
    await expect(registerCommands(program, ["nope"])).rejects.toThrow();
  });
});
