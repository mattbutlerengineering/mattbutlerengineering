import { Command } from "commander";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

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

export const primeCommand = new Command("prime")
  .description("Just-In-Time context priming: Pack relevant directories for a task")
  .argument("<directive>", "The task description to identify relevant context")
  .action(async (directive: string) => {
    const root = findMonorepoRoot(process.cwd());
    console.log(`🎯 Priming context for: "${directive}"`);

    const packages = new Set<string>();
    
    // Simple keyword-based detection for now
    // Future: Use LLM or dependency graph
    const lower = directive.toLowerCase();
    
    if (lower.includes("user")) packages.add("services/users");
    if (lower.includes("reservation") || lower.includes("table") || lower.includes("venue")) packages.add("services/reservations");
    if (lower.includes("agent") || lower.includes("session")) packages.add("services/agent");
    if (lower.includes("rialto") || lower.includes("ui") || lower.includes("component")) packages.add("packages/rialto");
    if (lower.includes("auth")) packages.add("packages/auth");
    if (lower.includes("api") || lower.includes("client")) packages.add("packages/api-client");
    
    // If no specific package found, pack everything in services/ (conservative default)
    if (packages.size === 0) {
        console.log("No specific packages identified. Priming all core services...");
        packages.add("services/users");
        packages.add("services/agent");
        packages.add("services/reservations");
    }

    console.log(`Refreshing context for ${packages.size} packages...`);
    
    for (const pkg of packages) {
        try {
            console.log(`   Packing ${pkg}...`);
            execSync(`pnpm --filter @mbe/cli start pack ${pkg}`, { cwd: root, stdio: "inherit" });
        } catch (e) {
            console.error(`❌ Failed to pack ${pkg}`);
        }
    }

    console.log("\n✅ Context primed. You are ready to work with fresh semantic skeletons.");
  });
