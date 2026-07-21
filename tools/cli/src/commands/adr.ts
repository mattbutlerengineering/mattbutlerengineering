import { Command } from "commander";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { glob } from "glob";
import { findMonorepoRoot } from "../monorepo-root.js";
import { validateAdrStructure, type StructuralViolation } from "./adr-structural.js";

// ── Helpers ───────────────────────────────────────────────────────────────

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
    return load(match[1]) as ADRFrontmatter;
  } catch (e) {
    console.error(`Error parsing ADR at ${filePath}:`, e);
    return null;
  }
}

function reportStructuralViolations(violations: StructuralViolation[]): void {
  for (const v of violations) {
    console.error(`❌ Structural violation in ${v.file}:`);
    console.error(`   Rule:    ${v.rule}`);
    console.error(`   Remedy:  ${v.remedy}`);
    console.error("");
  }
}

function buildFailureMessage(structuralCount: number, patternCount: number): string {
  const parts: string[] = [];
  if (structuralCount > 0) parts.push(`${structuralCount} ADR structural violations`);
  if (patternCount > 0) parts.push(`${patternCount} architectural violations`);
  return `Found ${parts.join(" and ")}.`;
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

    const structuralViolations = validateAdrStructure(adrDir);
    reportStructuralViolations(structuralViolations);

    const adrFiles = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    const activeADRs: ADRFrontmatter[] = [];

    for (const file of adrFiles) {
      const adr = parseADR(join(adrDir, file));
      if (adr && adr.status === "active" && adr.prohibited_patterns) {
        activeADRs.push(adr);
      }
    }

    let totalViolations = 0;

    if (activeADRs.length === 0) {
      console.log("No active ADRs with prohibited patterns found.");
    } else {
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
            .filter(
              (f) => !f.includes("node_modules") && !f.includes("dist") && !f.includes("generated")
            );
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

      for (const file of files) {
        const fullPath = join(scanPath, file);
        const content = readFileSync(fullPath, "utf8");

        for (const adr of activeADRs) {
          for (const pattern of adr.prohibited_patterns!) {
            let regex: RegExp;
            try {
              // `pattern` comes from this ADR's own `prohibited_patterns` frontmatter
              // (repo-controlled markdown, changed only via reviewed PRs), not
              // external/user input — same trust boundary as any local lint-config
              // pattern. Structural validation (`adr-structural.ts`) already confirms
              // the pattern compiles before this command runs (issue #3410 triage).
              // eslint-disable-next-line security/detect-non-literal-regexp
              regex = new RegExp(pattern, "g");
            } catch {
              // Already reported as a structural "regex-uncompilable" violation.
              continue;
            }
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
    }

    if (structuralViolations.length > 0 || totalViolations > 0) {
      throw new Error(buildFailureMessage(structuralViolations.length, totalViolations));
    } else {
      console.log("✅ No architectural violations detected.");
    }
  });
