import { Command } from "commander";
import { execSync, spawn } from "node:child_process";
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

function run(command: string, cwd: string) {
  console.log(`\n🏃 Running: ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

// ── Command ───────────────────────────────────────────────────────────────

export const upCommand = new Command("up")
  .description("Launch the entire development environment (Docker, DB, Turbo)")
  .option("--skip-infra", "Skip Docker infrastructure setup", false)
  .option("--skip-db", "Skip database push/seed", false)
  .action(async (options) => {
    const root = findMonorepoRoot(process.cwd());

    console.log("🚀 Starting MBE Development Stack...");

    try {
      // 1. Pre-flight checks
      try {
        execSync("docker --version", { stdio: "ignore" });
      } catch {
        console.error("❌ Error: Docker is not installed or not in PATH.");
        process.exit(1);
      }

      // 2. Infrastructure
      if (!options.skipInfra) {
        console.log("\n📦 Setting up infrastructure...");
        run("docker compose -f infrastructure/docker-compose.yml up postgres -d --wait", root);
      }

      // 3. Database & Environment
      if (!options.skipDb) {
        console.log("\n💾 Initializing environment and database...");
        run("pnpm env:init", root);
        run("pnpm db:push", root);
        // Check for seed script
        const hasSeed =
          existsSync(join(root, "scripts/seed.js")) ||
          existsSync(join(root, "packages/api-client/scripts/seed.ts"));
        if (hasSeed) {
          // If there's a seed script in package.json, run it
          try {
            run("pnpm db:seed", root);
          } catch {
            console.log("⚠️ No db:seed script found or it failed. Skipping seeding.");
          }
        }
      }

      // 4. Turbo Dev
      console.log("\n📡 Launching dev servers via Turbo...");
      const turbo = spawn("pnpm", ["dev"], { cwd: root, stdio: "inherit" });

      turbo.on("close", (code) => {
        console.log(`\n👋 Turbo exited with code ${code}`);
        process.exit(code || 0);
      });
    } catch (error) {
      console.error("\n❌ Bootstrapping failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
