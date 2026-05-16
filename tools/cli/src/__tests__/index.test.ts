import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all command modules to avoid side effects during import
vi.mock("../commands/login.js", () => ({ loginCommand: { _name: "login" } }));
vi.mock("../commands/logout.js", () => ({ logoutCommand: { _name: "logout" } }));
vi.mock("../commands/whoami.js", () => ({ whoamiCommand: { _name: "whoami" } }));
vi.mock("../commands/users.js", () => ({ usersCommand: { _name: "users" } }));
vi.mock("../commands/agent.js", () => ({
  agentCommand: { _name: "agent" },
  checkModelCommand: { _name: "check-model" },
}));
vi.mock("../commands/new.js", () => ({ newCommand: { _name: "new" } }));
vi.mock("../commands/pack.js", () => ({
  packCommand: { _name: "pack" },
  packChangedCommand: { _name: "pack-changed" },
}));
vi.mock("../commands/stats.js", () => ({
  statsCommand: { _name: "stats" },
  logSessionCommand: { _name: "log-session" },
  auditPerfCommand: { _name: "audit-perf" },
}));
vi.mock("../commands/sync-rules.js", () => ({ syncRulesCommand: { _name: "sync-rules" } }));
vi.mock("../commands/loop.js", () => ({ loopCommand: { _name: "loop" } }));
vi.mock("../commands/adr.js", () => ({ checkAdrCommand: { _name: "check-adr" } }));
vi.mock("../commands/up.js", () => ({ upCommand: { _name: "up" } }));
vi.mock("../commands/wave.js", () => ({ waveCommand: { _name: "wave" } }));
vi.mock("../commands/generate.js", () => ({ generateCommand: { _name: "generate" } }));
vi.mock("../commands/visual.js", () => ({ visualCommand: { _name: "visual" } }));
vi.mock("../commands/prime.js", () => ({ primeCommand: { _name: "prime" } }));
vi.mock("../commands/check-deps.js", () => ({ checkDepsCommand: { _name: "check-deps" } }));
vi.mock("../commands/cleanup-worktrees.js", () => ({
  cleanupWorktreesCommand: { _name: "cleanup-worktrees" },
}));
vi.mock("../commands/health.js", () => ({ healthCommand: { _name: "health" } }));
vi.mock("../commands/mcp.js", () => ({ mcpCommand: { _name: "mcp" } }));

// Track addCommand calls
const addedCommands: string[] = [];

vi.mock("commander", () => {
  return {
    Command: class MockCommand {
      _name: string = "";
      constructor(name?: string) {
        this._name = name || "";
      }
      name(n: string) {
        this._name = n;
        return this;
      }
      description() {
        return this;
      }
      version() {
        return this;
      }
      option() {
        return this;
      }
      action() {
        return this;
      }
      command() {
        return this;
      }
      addCommand(cmd: { _name: string }) {
        addedCommands.push(cmd._name);
        return this;
      }
      parse() {}
      parseAsync() {
        return Promise.resolve();
      }
    },
  };
});

describe("CLI entry point", () => {
  beforeEach(() => {
    addedCommands.length = 0;
    vi.resetModules();
  });

  it("registers all expected commands", async () => {
    await import("../index.js");

    const expectedCommands = [
      "login",
      "logout",
      "whoami",
      "users",
      "agent",
      "check-model",
      "loop",
      "wave",
      "new",
      "up",
      "generate",
      "pack",
      "pack-changed",
      "sync-rules",
      "prime",
      "stats",
      "log-session",
      "audit-perf",
      "check-adr",
      "check-deps",
      "cleanup-worktrees",
      "health",
      "mcp",
      "visual",
    ];

    for (const cmd of expectedCommands) {
      expect(addedCommands).toContain(cmd);
    }
  });

  it("registers the correct number of commands", async () => {
    await import("../index.js");
    expect(addedCommands.length).toBe(24);
  });
});
