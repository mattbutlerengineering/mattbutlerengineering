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

export const visualCommand = new Command("visual")
  .description("Run visual regression tests via Playwright")
  .argument("[filter]", "Filter tests by component ID (e.g., button)")
  .option("-u, --update", "Update visual baselines", false)
  .action(async (filter: string | undefined, options) => {
    const root = findMonorepoRoot(process.cwd());
    console.log(`🚀 Running visual regression tests${filter ? ` for: "${filter}"` : ""}...`);

    const args = ["playwright", "test", "e2e/visual.spec.ts"];
    if (filter) {
      args.push("-g", filter);
    }
    if (options.update) {
      args.push("--update-snapshots");
    }

    const testProcess = spawn("pnpm", ["--filter", "@mbe/rialto-web", "exec", ...args], {
      cwd: root,
      stdio: "inherit",
    });

    testProcess.on("close", (code) => {
      if (code === 0) {
        console.log("\n✅ Visual tests passed.");
      } else {
        console.error(`\n❌ Visual tests failed with code ${code}.`);
      }
      process.exit(code || 0);
    });
  });
