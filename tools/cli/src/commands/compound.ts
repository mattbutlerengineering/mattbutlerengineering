import { Command } from "commander";
import { execSync } from "node:child_process";
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

export const compoundCommand = new Command("compound")
  .description("Perform the final Compounding phase: Identify and codify task learnings")
  .action(async () => {
    const root = findMonorepoRoot(process.cwd());
    console.log("🧠 Starting Compounding Phase...");

    try {
      // Get the staged changes or last commit
      const diff = execSync("git diff HEAD", { cwd: root, encoding: "utf8" });

      if (!diff) {
        console.log("No changes detected since last commit. Have you committed your work yet?");
        console.log("If so, try checking the last commit: git show HEAD");
      }

      console.log("\nAnalyzing changes for compoundable knowledge...");

      const suggestions: string[] = [];

      // 1. Check for new packages or structural changes
      if (
        diff.includes("package.json") &&
        (diff.includes('+  "name":') || diff.includes('+    "@mbe/'))
      ) {
        suggestions.push(
          "New internal package detected. ACTION: Add its core purpose to AGENTS.md #Project Structure."
        );
      }

      // 2. Check for API changes
      if (diff.includes("services/") && diff.includes("routes/") && diff.includes("+  fastify.")) {
        suggestions.push(
          "New API endpoints detected. ACTION: Run 'mbe pack' on the service to update llms.txt."
        );
      }

      // 3. Check for pattern establishing (ADRs)
      if (diff.includes("ADR-") && diff.includes("+status: active")) {
        suggestions.push(
          "New architectural decision established. ACTION: Run 'mbe sync-rules' to propagate to all AI tools."
        );
      }

      // 4. Check for UI patterns
      if (diff.includes("packages/rialto") && diff.includes("+export function")) {
        suggestions.push(
          "New design system component detected. ACTION: Update packages/rialto/CLAUDE.md with the new component spec."
        );
      }

      if (suggestions.length === 0) {
        console.log(
          "✅ No obvious compounding tasks found. Consider if any tribal knowledge should be moved to AGENTS.md."
        );
      } else {
        console.log("\nCompounding Recommendations:");
        suggestions.forEach((s, i) => console.log(`${i + 1}. ${s}`));
      }

      console.log("\nRemember: A task is not done until the knowledge gained has been codified.");
    } catch (error) {
      console.error(
        "Error during compounding analysis:",
        error instanceof Error ? error.message : String(error)
      );
    }
  });
