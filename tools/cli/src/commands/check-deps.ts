import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
