import { Command } from "commander";
import { spawn } from "node:child_process";
import { findMonorepoRoot } from "../monorepo-root.js";

// ── Helpers ───────────────────────────────────────────────────────────────

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
