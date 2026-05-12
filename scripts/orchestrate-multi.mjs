#!/usr/bin/env node

import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync, execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const opts = { repo: "", task: "", branch: "", script: "", dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--repo":
        opts.repo = args[++i] ?? "";
        break;
      case "--task":
        opts.task = args[++i] ?? "";
        break;
      case "--branch":
        opts.branch = args[++i] ?? "";
        break;
      case "--script":
        opts.script = args[++i] ?? "";
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!opts.repo) {
    console.error("Error: --repo is required");
    process.exit(1);
  }

  if (!opts.task) {
    console.error("Error: --task is required");
    process.exit(1);
  }

  if (!opts.branch) {
    opts.branch = `orchestrate-${Date.now()}`;
  }

  return opts;
}

function printUsage() {
  console.log(`Usage: node scripts/orchestrate-multi.mjs --repo <url> --task "<description>" [options]

Orchestrate a change across a downstream repository.

Required:
  --repo <url>         GitHub repository URL (e.g. https://github.com/org/repo)
  --task "<desc>"      PR title and commit message describing the change

Options:
  --branch <name>      Feature branch name (default: orchestrate-<timestamp>)
  --script <path>      Path to a script to run inside the cloned repo to apply changes
  --dry-run            Print what would be done without making any changes
  --help, -h           Show this help message

Examples:
  node scripts/orchestrate-multi.mjs --repo https://github.com/example/repo --task "Bump @mbe/rialto to v2.0.0" --branch chore/rialto-v2
  node scripts/orchestrate-multi.mjs --repo https://github.com/example/repo --task "Update config" --script ./scripts/update-config.sh
  node scripts/orchestrate-multi.mjs --dry-run --repo https://github.com/example/repo --task "Bump dependency"
`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: opts.silent ? "pipe" : "inherit",
    cwd: opts.cwd,
    encoding: "utf-8",
    ...opts.spawn,
  });

  if (result.error) {
    throw new Error(`Failed to run ${cmd}: ${result.error.message}`);
  }

  if (result.status !== 0 && !opts.allowFailure) {
    throw new Error(`Command exited with code ${result.status}: ${cmd} ${args.join(" ")}`);
  }

  return result;
}

function capture(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: opts.cwd,
    encoding: "utf-8",
  });
  return result.stdout?.trim() ?? "";
}

function checkGhAuth() {
  const result = spawnSync("gh", ["auth", "status"], {
    stdio: ["inherit", "inherit", "pipe"],
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const msg = result.stderr?.includes("not logged in")
      ? "gh CLI is not authenticated. Run `gh auth login` first."
      : `gh CLI check failed: ${result.stderr?.trim() ?? "unknown error"}`;
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

async function orchestrate(opts) {
  if (opts.dryRun) {
    console.log(`[DRY-RUN] Would orchestrate change across repositories:
  Target repo: ${opts.repo}
  Branch:      ${opts.branch}
  Task:        ${opts.task}
  Script:      ${opts.script || "(none)"}

Steps:
  1. Clone ${opts.repo}
  2. Create branch ${opts.branch}
  3. Apply changes${opts.script ? ` (via ${opts.script})` : ""}
  4. Commit with message: "${opts.task}"
  5. Push branch ${opts.branch}
  6. Create PR with title: "${opts.task}"
  7. Report PR URL
`);
    return;
  }

  console.log(`\n=== Multi-Repo Orchestrator ===`);
  console.log(`  Repo:   ${opts.repo}`);
  console.log(`  Branch: ${opts.branch}`);
  console.log(`  Task:   ${opts.task}\n`);

  const tmpDir = mkdtempSync(join(tmpdir(), "multi-orech-"));
  const cloneDir = join(tmpDir, "target");

  try {
    console.log("1. Cloning target repository...");
    run("gh", ["repo", "clone", opts.repo, cloneDir], { silent: false });
    console.log("   Done.\n");

    const repoName = capture("basename", [opts.repo.replace(/\.git$/, "")]);
    const remoteUrl = capture("git", ["remote", "get-url", "origin"], { cwd: cloneDir });

    console.log("2. Creating feature branch...");
    run("git", ["checkout", "-b", opts.branch], { cwd: cloneDir });
    console.log("   Done.\n");

    if (opts.script) {
      console.log("3. Applying changes via script...");
      const scriptPath = join(process.cwd(), opts.script);
      run("bash", [scriptPath], { cwd: cloneDir });
      console.log("   Done.\n");
    }

    console.log("4. Staging and committing changes...");
    const statusResult = capture("git", ["status", "--porcelain"], { cwd: cloneDir });
    if (!statusResult) {
      console.log("   No changes to commit. Skipping commit and push.");
      console.log("   PR cannot be created without changes.\n");
      return;
    }
    run("git", ["add", "-A"], { cwd: cloneDir });
    run("git", ["commit", "-m", opts.task], { cwd: cloneDir });
    console.log("   Done.\n");

    console.log("5. Pushing branch...");
    run("git", ["push", "-u", "origin", opts.branch], { cwd: cloneDir });
    console.log("   Done.\n");

    console.log("6. Creating pull request...");
    const prUrl = capture("gh", ["pr", "create", "--fill", "--repo", opts.repo], { cwd: cloneDir });
    if (prUrl) {
      console.log(`   PR created: ${prUrl}\n`);
    } else {
      console.log("   PR creation may have failed (no URL returned).\n");
    }

    console.log("=== Done ===");
  } finally {
    console.log("\nCleaning up...");
    await rm(tmpDir, { recursive: true, force: true });
    console.log("Done.");
  }
}

const opts = parseArgs();
checkGhAuth();
orchestrate(opts).catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
