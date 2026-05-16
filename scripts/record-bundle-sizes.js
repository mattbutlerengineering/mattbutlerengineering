#!/usr/bin/env node

/**
 * Record bundle sizes for all frontend apps into a JSON snapshot.
 *
 * Usage:
 *   node scripts/record-bundle-sizes.js [--output path/to/file.json]
 *
 * Outputs a JSON object with per-app JS and CSS sizes (in bytes),
 * the git SHA, branch, and timestamp. This snapshot is uploaded as
 * a CI artifact and optionally stored in KV for long-term trending.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const APPS = [
  { name: "marketing", distDir: "apps/marketing/dist" },
  { name: "hospitality", distDir: "apps/hospitality/dist" },
  { name: "rialto-web", distDir: "apps/rialto-web/dist" },
  { name: "gen", distDir: "apps/gen/dist" },
];

const ROOT = resolve(import.meta.dirname, "..");

function sumFilesByExtension(dir, ext) {
  const assetsDir = join(dir, "assets");
  try {
    const files = readdirSync(assetsDir);
    return files
      .filter((f) => f.endsWith(ext) && !f.endsWith(".map"))
      .reduce((sum, f) => {
        const stat = statSync(join(assetsDir, f));
        return sum + stat.size;
      }, 0);
  } catch {
    return 0;
  }
}

function getGitInfo() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
  return { sha, branch };
}

function measure() {
  const git = getGitInfo();
  const timestamp = new Date().toISOString();

  const apps = APPS.reduce((acc, app) => {
    const distPath = join(ROOT, app.distDir);
    const jsBytes = sumFilesByExtension(distPath, ".js");
    const cssBytes = sumFilesByExtension(distPath, ".css");
    return {
      ...acc,
      [app.name]: { jsBytes, cssBytes, totalBytes: jsBytes + cssBytes },
    };
  }, {});

  return { timestamp, sha: git.sha, branch: git.branch, apps };
}

function main() {
  const outputIdx = process.argv.indexOf("--output");
  const outputPath =
    outputIdx !== -1
      ? resolve(process.argv[outputIdx + 1])
      : join(ROOT, "bundle-sizes.json");

  const snapshot = measure();

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + "\n");

  // Print summary to stdout for CI logs
  for (const [name, sizes] of Object.entries(snapshot.apps)) {
    const jsKB = (sizes.jsBytes / 1024).toFixed(1);
    const cssKB = (sizes.cssBytes / 1024).toFixed(1);
    const totalKB = (sizes.totalBytes / 1024).toFixed(1);
    console.log(
      `${name}: JS=${jsKB}kB  CSS=${cssKB}kB  total=${totalKB}kB`,
    );
  }
  console.log(`\nSnapshot written to ${outputPath}`);
}

main();
