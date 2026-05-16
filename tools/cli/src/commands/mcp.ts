import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Helpers ───────────────────────────────────────────────────────────────

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

// ── Command ───────────────────────────────────────────────────────────────

export const mcpCommand = new Command("mcp").description(
  "Model Context Protocol (MCP) server management"
);

mcpCommand
  .command("start")
  .description("Start the infrastructure MCP server")
  .action(async () => {
    const root = findMonorepoRoot(process.cwd());
    const mcpDir = join(root, "packages/mcp-server");

    if (!existsSync(mcpDir)) {
      console.error(`Error: MCP server package not found at ${mcpDir}`);
      process.exit(1);
    }

    console.log("🚀 Starting MBE Infra MCP Server...");

    const server = spawn("pnpm", ["start"], {
      cwd: mcpDir,
      stdio: "inherit",
    });

    server.on("close", (code) => {
      console.log(`\n👋 MCP Server exited with code ${code}`);
      process.exit(code || 0);
    });
  });
