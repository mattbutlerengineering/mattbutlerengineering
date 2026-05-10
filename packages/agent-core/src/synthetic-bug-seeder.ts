import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type BugType = "lint-violation" | "dead-link" | "a11y-issue";

export interface SyntheticBugConfig {
  type: BugType;
  repoPath: string;
  filePath: string;
  fileContent: string;
  commitMessage: string;
  branchName: string;
}

export interface BugSeedResult {
  success: boolean;
  branchName: string;
  commitSha?: string;
  filePath: string;
  error?: string;
}

/**
 * Seeds a non-breaking but detectable bug for testing audit loops.
 * Creates a branch with the synthetic bug and pushes it.
 */
export async function seedSyntheticBug(config: SyntheticBugConfig): Promise<BugSeedResult> {
  try {
    // Create branch
    await execFileAsync("git", ["checkout", "-b", config.branchName], { cwd: config.repoPath });

    // Create directory if needed
    const dir = join(config.repoPath, config.filePath, "..");
    await mkdir(dir, { recursive: true });

    // Write file
    const fullPath = join(config.repoPath, config.filePath);
    await writeFile(fullPath, config.fileContent, "utf-8");

    // Stage and commit
    await execFileAsync("git", ["add", config.filePath], { cwd: config.repoPath });
    const { stdout: commitSha } = await execFileAsync(
      "git",
      ["commit", "-m", config.commitMessage],
      { cwd: config.repoPath }
    );

    // Extract SHA from output
    const sha = commitSha.match(/\[.*?(\w{7})\]/)?.[1] || "unknown";

    // Push to remote
    await execFileAsync("git", ["push", "origin", config.branchName], { cwd: config.repoPath });

    return {
      success: true,
      branchName: config.branchName,
      commitSha: sha,
      filePath: config.filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      branchName: config.branchName,
      filePath: config.filePath,
      error: message,
    };
  }
}

/**
 * Creates a lint violation for testing (unused variable).
 */
export function createLintViolationBug(repoPath: string): SyntheticBugConfig {
  const timestamp = Date.now();
  const branchName = `chaos/lint-violation-${timestamp}`;

  return {
    type: "lint-violation",
    repoPath,
    branchName,
    filePath: "apps/marketing/src/utils/chaos-test-lint.ts",
    fileContent: `// Synthetic lint violation for audit loop testing
// This file intentionally contains an ESLint no-unused-vars violation
const unusedVariable = "This variable is never used and triggers ESLint";

export function testFunction(): void {
  console.log("Function that should trigger audit loop");
}
`,
    commitMessage: "test(chaos): seed synthetic lint violation for audit verification",
  };
}

/**
 * Creates a dead link for testing (Playwright link check).
 */
export function createDeadLinkBug(repoPath: string): SyntheticBugConfig {
  const timestamp = Date.now();
  const branchName = `chaos/dead-link-${timestamp}`;

  return {
    type: "dead-link",
    repoPath,
    branchName,
    filePath: "apps/marketing/src/pages/chaos-test.mdx",
    fileContent: `# Chaos Test Page

This page contains a dead link for testing the site audit's link checker.

[This link points to a non-existent page](https://mattbutlerengineering.com/chaos/nonexistent-page-${Date.now()})

## Purpose

This synthetic bug verifies that the autonomous audit loop can detect broken links.
`,
    commitMessage: "test(chaos): seed synthetic dead link for audit verification",
  };
}

/**
 * Creates an accessibility issue for testing (missing alt text).
 */
export function createA11yBug(repoPath: string): SyntheticBugConfig {
  const timestamp = Date.now();
  const branchName = `chaos/a11y-issue-${timestamp}`;

  return {
    type: "a11y-issue",
    repoPath,
    branchName,
    filePath: "apps/rialto-web/src/pages/chaos-test.tsx",
    fileContent: `import React from "react";

/**
 * Chaos test page with accessibility violation (missing alt text).
 * This page intentionally has an accessibility issue for testing audit loops.
 */
export default function ChaosTestPage(): JSX.Element {
  return (
    <div>
      <h1>Chaos Test Page</h1>
      <p>This page contains an accessibility violation.</p>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src="/test-image.png" />
      <p>The image above is missing alt text, which should trigger Lighthouse a11y audit.</p>
    </div>
  );
}
`,
    commitMessage: "test(chaos): seed synthetic a11y issue for audit verification",
  };
}

/**
 * Cleans up a branch created by seedSyntheticBug.
 */
export async function cleanupSyntheticBugBranch(
  repoPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Switch back to main
    await execFileAsync("git", ["checkout", "main"], { cwd: repoPath });

    // Delete local branch
    await execFileAsync("git", ["branch", "-D", branchName], { cwd: repoPath });

    // Delete remote branch
    await execFileAsync("git", ["push", "origin", "--delete", branchName], {
      cwd: repoPath,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
