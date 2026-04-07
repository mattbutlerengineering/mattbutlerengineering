import { Command } from "commander";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { glob } from "glob";

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

interface ADRFrontmatter {
  id: string;
  title: string;
  status: string;
  prohibited_patterns?: string[];
}

function parseADR(filePath: string): ADRFrontmatter | null {
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---([\s\S]*?)---/);
  if (!match) return null;

  try {
    return yaml.load(match[1]) as ADRFrontmatter;
  } catch (e) {
    console.error(`Error parsing ADR at ${filePath}:`, e);
    return null;
  }
}

// ── Command ───────────────────────────────────────────────────────────────

export const checkAdrCommand = new Command("check-adr")
  .description("Validate codebase against active Architecture Decision Records (ADRs)")
  .option("--path <string>", "Path to scan", ".")
  .option("--staged", "Only check staged files", false)
  .action(async (options) => {
    const root = findMonorepoRoot(process.cwd());
    const adrDir = join(root, "docs/adr");

    if (!existsSync(adrDir)) {
      console.log("No ADRs found in docs/adr/. Skipping check.");
      return;
    }

    const adrFiles = readdirSync(adrDir).filter(f => f.endsWith(".md"));
    const activeADRs: ADRFrontmatter[] = [];

    for (const file of adrFiles) {
      const adr = parseADR(join(adrDir, file));
      if (adr && adr.status === "active" && adr.prohibited_patterns) {
        activeADRs.push(adr);
      }
    }

    if (activeADRs.length === 0) {
      console.log("No active ADRs with prohibited patterns found.");
      return;
    }

    console.log(`Checking codebase against ${activeADRs.length} active ADRs...`);

    const scanPath = resolve(root, options.path);

    let files: string[];

    if (options.staged) {
      const { execSync } = await import("node:child_process");
      try {
        const stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACM", {
          cwd: root,
          encoding: "utf-8",
        });
        files = stagedFiles
          .split("\n")
          .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
          .filter((f) => !f.includes("node_modules") && !f.includes("dist") && !f.includes("generated"));
      } catch {
        files = [];
      }
    } else {
      const globResult = await glob("**/*.{ts,tsx}", {
        cwd: scanPath,
        ignore: ["**/node_modules/**", "**/dist/**", "**/generated/**"],
      });
      files = globResult;
    }

    let totalViolations = 0;

    for (const file of files) {
      const fullPath = join(scanPath, file);
      const content = readFileSync(fullPath, "utf8");

      for (const adr of activeADRs) {
        for (const pattern of adr.prohibited_patterns!) {
          const regex = new RegExp(pattern, "g");
          const matches = content.match(regex);
          
          if (matches) {
            totalViolations += matches.length;
            console.error(`❌ Violation in ${file}:`);
            console.error(`   ADR:      ${adr.id} - ${adr.title}`);
            console.error(`   Pattern:  ${pattern}`);
            console.error(`   Count:    ${matches.length}`);
            console.error("");
          }
        }
      }
    }

    if (totalViolations > 0) {
      console.error(`Found ${totalViolations} architectural violations.`);
      process.exit(1);
    } else {
      console.log("✅ No architectural violations detected.");
    }
  });
