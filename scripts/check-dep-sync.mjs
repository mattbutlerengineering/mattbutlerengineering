#!/usr/bin/env node

/**
 * Dependency Sync Audit (Robust Version)
 */

import { spawnSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(process.cwd());
const DIRS = ["apps", "packages", "services", "tools"];

console.log("🔍 Starting Dependency Sync Audit...");

let totalGaps = 0;

for (const dir of DIRS) {
  const dirPath = join(ROOT, dir);
  if (!existsSync(dirPath)) continue;

  const members = readdirSync(dirPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const name of members) {
    const pkgPath = join(dirPath, name);
    const jsonPath = join(pkgPath, "package.json");

    if (!existsSync(jsonPath)) continue;

    console.log(`\n📦 Auditing ${dir}/${name}...`);

    const child = spawnSync("npx", ["depcheck", pkgPath, "--json"], {
      encoding: "utf8",
      shell: true,
    });

    try {
      // depcheck with --json outputs the result to stdout even on failure (missing deps)
      const result = JSON.parse(child.stdout);
      const missing = Object.keys(result.missing || {});

      if (missing.length > 0) {
        console.error(`❌ ERROR: Missing dependencies in ${dir}/${name}/package.json:`);
        missing.forEach((dep) => console.error(`   - ${dep}`));
        totalGaps += missing.length;
      } else {
        console.log(`   ✅ All imports matched in package.json`);
      }
    } catch (err) {
      console.error(`   ⚠️  Audit failed for ${dir}/${name}: Could not parse JSON output.`);
      if (child.stderr) console.error(`   Stderr: ${child.stderr.trim()}`);
      if (child.stdout) console.error(`   Stdout: ${child.stdout.trim()}`);
    }
  }
}

console.log("\n--- Audit Results ---");
if (totalGaps > 0) {
  console.error(`❌ Total dependency gaps found: ${totalGaps}`);
  process.exit(1);
} else {
  console.log("✅ Workspace dependency sync verified.");
  process.exit(0);
}
