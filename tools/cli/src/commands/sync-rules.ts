import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findMonorepoRoot } from "../monorepo-root.js";
import { defineCommand, runCommand } from "../command-seam.js";
import type { CommandResult } from "../command-seam.js";

// ── Helpers ───────────────────────────────────────────────────────────────

const MANAGED_HEADER = "<!-- @mbe-managed - DO NOT EDIT MANUALLY -->\n";

// ── Pure run function (returns CommandResult, no console/process.exit) ────

export const syncRulesRun = defineCommand({
  requiresAuth: false,
  async run(): Promise<CommandResult> {
    const root = findMonorepoRoot(process.cwd());
    const agentsPath = join(root, "AGENTS.md");

    if (!existsSync(agentsPath)) {
      return {
        kind: "error",
        message: `AGENTS.md not found at ${agentsPath}`,
        exitCode: 1,
      };
    }

    const agentsContent = readFileSync(agentsPath, "utf8");
    const updated: string[] = [];

    // 1. Update .cursorrules
    const cursorRulesPath = join(root, ".cursorrules");
    const cursorRulesContent = `${MANAGED_HEADER}# Cursor Rules - mattbutlerengineering\n\n${agentsContent}`;
    writeFileSync(cursorRulesPath, cursorRulesContent);
    updated.push(".cursorrules");

    // 2. Update GEMINI.md (inject an AGENTS.md reference if missing)
    const geminiPath = join(root, "GEMINI.md");
    if (existsSync(geminiPath)) {
      const geminiContent = readFileSync(geminiPath, "utf8");
      if (!geminiContent.includes("AGENTS.md")) {
        const newGeminiContent = `${MANAGED_HEADER}${geminiContent}\n\n## Core Reference\n- [AGENTS.md](./AGENTS.md)`;
        writeFileSync(geminiPath, newGeminiContent);
        updated.push("GEMINI.md");
      }
    }

    return {
      kind: "rows",
      rows: updated.map((file) => ({ file, status: "updated" })),
    };
  },
});

// ── Commander wiring ────────────────────────────────────────────────────────

export const syncRulesCommand = new Command("sync-rules")
  .description("Synchronize agent rules from AGENTS.md to tool-specific files")
  .action(async () => {
    const result = await syncRulesRun({});
    await runCommand(result, {});
  });
