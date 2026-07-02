#!/usr/bin/env node

/**
 * Chaos Agent — Seeds detectable non-breaking bugs (#1191, #2927).
 *
 * This script injects synthetic bugs into the codebase to verify that
 * site-audit and lint loops are functioning correctly.
 *
 * The bug catalog (which types exist, and how each is injected) lives in
 * `@mbe/agent-core`'s `BUG_CATALOG`/`injectBug` (packages/agent-core/src/synthetic-bug-seeder.ts)
 * — this script is a thin I/O shell around that single source of truth:
 * 1. console-error: Adds a console.error in a useEffect (caught by site-audit Playwright)
 * 2. lighthouse-perf: Adds a large invisible image (caught by Lighthouse)
 * 3. accessibility: Removes an aria-label (caught by Lighthouse a11y)
 * 4. scout-todo: Adds a FIXME comment (caught by site-audit scout)
 *
 * Usage:
 *   node scripts/chaos-agent.mjs --type <type> [--file <path>]
 *   node scripts/chaos-agent.mjs --random
 *   node scripts/chaos-agent.mjs --type <type> --file <path> --dry-run  # no git/PR side effects
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";
import { BUG_CATALOG, injectBug } from "@mbe/agent-core";

// Re-exported for tests: proves this script delegates to the agent-core
// catalog rather than reimplementing its own (#2927).
export { BUG_CATALOG };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ghClient = createGhClient();

const TARGET_APPS = ["apps/marketing", "apps/hospitality", "apps/rialto-web"];

export function findTargetFile(type) {
  const app = TARGET_APPS[Math.floor(Math.random() * TARGET_APPS.length)];
  const files = execFileSync("find", [path.join(ROOT, app, "src"), "-name", "*.tsx"], {
    encoding: "utf-8",
  })
    .split("\n")
    .filter((f) => f && !f.includes(".test.") && !f.includes("layout.tsx"));

  return files[Math.floor(Math.random() * files.length)];
}

/**
 * Pure: builds the `gh pr create` args for a pushed chaos-bug PR. The `ready`
 * label is sourced from `@mbe/gh-client`'s coordination-label machine (#2933)
 * rather than a re-typed string literal, so it can never drift from the
 * canonical label name.
 */
export function buildChaosPrArgs(type, targetFile, relativePath) {
  const prBody = `## Chaos Agent Synthetic Bug Audit

      This PR contains a synthetic **${type}** bug injected by the Chaos Agent.

      **File:** ${relativePath}
      **Goal:** Verify that site-audit and lint loops detect this issue and file a corresponding GitHub issue.

      This PR is designed to be detectable but non-breaking for the build.

      Labels: \`chaos-audit\`, \`${COORDINATION_LABELS.READY}\`, \`audit\``;

  return [
    "--title",
    `chaos: synthetic ${type} bug in ${path.basename(targetFile)}`,
    "--body",
    prBody,
    "--label",
    "chaos-audit",
    "--label",
    COORDINATION_LABELS.READY,
    "--label",
    "audit",
  ];
}

/** Reads `filePath` and delegates to the pure `injectBug` catalog transform. */
function computeInjection(type, filePath) {
  return injectBug(type, fs.readFileSync(filePath, "utf-8"));
}

/**
 * Applies a catalog bug to the file at `filePath` (writes the transformed
 * content back). Returns whether an injection actually happened.
 */
export function injectBugIntoFile(type, filePath) {
  const result = computeInjection(type, filePath);

  if (!result.injected) {
    console.log(`No injection point found for ${type} in ${filePath}, skipping...`);
    return false;
  }

  fs.writeFileSync(filePath, result.content);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  let type = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;
  const randomMode = args.includes("--random");
  const dryRun = args.includes("--dry-run");

  if (randomMode) {
    const types = Object.keys(BUG_CATALOG);
    type = types[Math.floor(Math.random() * types.length)];
  }

  if (!type || !BUG_CATALOG[type]) {
    console.error(`Invalid bug type. Available: ${Object.keys(BUG_CATALOG).join(", ")}`);
    process.exit(1);
  }

  const fileIdx = args.indexOf("--file");
  const targetFile = fileIdx !== -1 ? args[fileIdx + 1] : findTargetFile(type);
  console.log(`Targeting file: ${targetFile} with bug type: ${type}${dryRun ? " (dry run)" : ""}`);

  if (dryRun) {
    const result = computeInjection(type, targetFile);
    console.log(
      result.injected
        ? `Dry run: would inject ${type} into ${targetFile} (no files or git state changed).`
        : `Dry run: no injection point found for ${type} in ${targetFile}.`
    );
    process.exit(result.injected ? 0 : 1);
  }

  if (injectBugIntoFile(type, targetFile)) {
    const relativePath = path.relative(ROOT, targetFile);
    const branchName = `chaos/synthetic-bug-${Date.now()}`;

    console.log(`Bug injected. Creating branch ${branchName}...`);

    execFileSync("git", ["checkout", "-b", branchName]);
    execFileSync("git", ["add", targetFile]);
    execFileSync("git", [
      "commit",
      "-m",
      `chore(chaos): seed synthetic ${type} in ${relativePath}`,
    ]);

    if (args.includes("--push")) {
      console.log("Pushing and creating PR...");
      execFileSync("git", ["push", "origin", branchName]);

      try {
        ghClient.pr.create(buildChaosPrArgs(type, targetFile, relativePath));
      } catch (e) {
        console.error(`gh command failed: ${e.message}`);
      }
    }
  } else {
    console.error("Failed to inject bug.");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
