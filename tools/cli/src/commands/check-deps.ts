import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import { findMonorepoRoot } from "../monorepo-root.js";

// ── Helpers ───────────────────────────────────────────────────────────────

// Deliberate, documented exceptions to the "one version per dependency"
// rule, keyed as "packageName:depName". @mbe/mutation-testing pins vitest to
// 4.1.10 (not the workspace catalog's 5.x) because @stryker-mutator/vitest-runner
// only supports that major — see tools/mutation-testing/README.md and issue
// mattbutlerengineering/mattbutlerengineering#5614.
const INTENTIONAL_MISMATCHES = new Set<string>(["@mbe/mutation-testing:vitest"]);

// ── Command ───────────────────────────────────────────────────────────────

export const checkDepsCommand = new Command("check-deps")
  .description("Audit dependency version consistency across the monorepo")
  .action(async () => {
    const root = findMonorepoRoot(process.cwd());
    console.log("🔍 Auditing dependency integrity...");

    const packageFiles = await glob("**/package.json", {
      cwd: root,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/generated/**",
        "**/.claude/worktrees/**",
        "**/.agent-worktrees/**",
        "**/.worktrees/**",
        "**/fix-ci-and-merge-task/**",
      ],
    });

    const dependencyMap = new Map<string, Map<string, string>>();

    for (const file of packageFiles) {
      const pkg = JSON.parse(readFileSync(join(root, file), "utf8"));
      const pkgName = pkg.name || file;

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        // peerDependencies intentionally omitted: they express compatibility
        // ranges for consumers, not resolved versions, so they should not be
        // compared against other packages' pinned or catalog versions.
      };

      for (const [name, version] of Object.entries(allDeps as Record<string, string>)) {
        if (version.startsWith("workspace:") || version.startsWith("catalog:")) continue;

        if (INTENTIONAL_MISMATCHES.has(`${pkgName}:${name}`)) continue;

        if (!dependencyMap.has(name)) {
          dependencyMap.set(name, new Map());
        }
        dependencyMap.get(name)!.set(pkgName, version);
      }
    }

    let inconsistencies = 0;

    console.log("\nFound version mismatches:");
    console.log("=========================");

    for (const [name, versions] of dependencyMap.entries()) {
      const uniqueVersions = new Set(versions.values());
      if (uniqueVersions.size > 1) {
        inconsistencies++;
        console.warn(`📦 ${name}:`);
        for (const [pkg, ver] of versions.entries()) {
          console.warn(`   - ${ver} in ${pkg}`);
        }
        console.log("");
      }
    }

    if (inconsistencies === 0) {
      console.log("✅ All external dependencies are consistent across the monorepo.");
    } else {
      throw new Error(`Found ${inconsistencies} dependencies with version mismatches.`);
    }
  });
