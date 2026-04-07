import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

const MANAGED_HEADER = "<!-- @mbe-managed - DO NOT EDIT MANUALLY -->\n";

// ── Command ───────────────────────────────────────────────────────────────

export const syncRulesCommand = new Command("sync-rules")
  .description("Synchronize agent rules from AGENTS.md to tool-specific files")
  .action(async () => {
    const root = findMonorepoRoot(process.cwd());
    const agentsPath = join(root, "AGENTS.md");

    if (!existsSync(agentsPath)) {
      console.error(`Error: AGENTS.md not found at ${agentsPath}`);
      process.exit(1);
    }

    console.log("Syncing agent rules...");

    const agentsContent = readFileSync(agentsPath, "utf8");

    // 1. Update .cursorrules
    const cursorRulesPath = join(root, ".cursorrules");
    const cursorRulesContent = `${MANAGED_HEADER}# Cursor Rules - mattbutlerengineering\n\n${agentsContent}`;
    writeFileSync(cursorRulesPath, cursorRulesContent);
    console.log("✅ Updated .cursorrules");

    // 2. Update GEMINI.md (Injecting core content into specialized mandates)
    const geminiPath = join(root, "GEMINI.md");
    if (existsSync(geminiPath)) {
        let geminiContent = readFileSync(geminiPath, "utf8");
        // We want to keep the "Gemini-Specific Mandates" but sync the rest or reference it
        // For simplicity in this first version, we'll ensure AGENTS.md is referenced
        if (!geminiContent.includes("AGENTS.md")) {
            geminiContent = `${MANAGED_HEADER}${geminiContent}\n\n## Core Reference\n- [AGENTS.md](./AGENTS.md)`;
            writeFileSync(geminiPath, geminiContent);
        }
        console.log("✅ Verified GEMINI.md reference");
    }

    console.log("Successfully synchronized all agent rules.");
  });
