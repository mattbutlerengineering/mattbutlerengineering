#!/usr/bin/env node

/**
 * Revert RCA Trigger — Handles reflection on AI PR reversions (#1191).
 *
 * This script is triggered when a PR is reverted. It creates a new issue
 * tasked for an agent to perform a Root Cause Analysis (RCA) and update
 * project guidelines (gotchas.md) to prevent future occurrences.
 *
 * Usage:
 *   node scripts/revert-rca.mjs --pr <number> --revert-sha <sha>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ghClient = createGhClient();

/**
 * Pure: builds the `gh issue create` args for an RCA issue. The `ready`
 * label is sourced from `@mbe/gh-client`'s coordination-label machine
 * (#2933) rather than a re-typed string literal, so it can never drift from
 * the canonical label name.
 */
export function buildRcaCreateArgs(title, body) {
  return [
    "--title",
    title,
    "--body",
    body,
    "--label",
    "meta-improvement",
    "--label",
    COORDINATION_LABELS.READY,
    "--label",
    "critical",
  ];
}

function main() {
  const args = process.argv.slice(2);
  const prIdx = args.indexOf("--pr");
  const shaIdx = args.indexOf("--revert-sha");

  if (prIdx === -1 || !args[prIdx + 1]) {
    console.error("Missing --pr <number>");
    process.exit(1);
  }

  const prNumber = args[prIdx + 1];
  const revertSha = shaIdx !== -1 ? args[shaIdx + 1] : "HEAD";

  console.log(`Triggering RCA for reverted PR #${prNumber}...`);

  // Fetch original PR details
  let pr;
  try {
    pr = ghClient.pr.view(Number(prNumber), ["--json", "title,body,author,headRefName,labels"]);
  } catch (e) {
    console.error(`Could not find PR #${prNumber}: ${e.message}`);
    process.exit(1);
  }

  // Check if it's an agent PR (based on labels or author)
  const isAgent =
    pr.labels.some((l) => l.name === "has-pr") ||
    pr.author.login.includes("bot") ||
    pr.headRefName.startsWith("agent-") ||
    pr.headRefName.startsWith("worktree-agent-");

  if (!isAgent) {
    console.log(`PR #${prNumber} is not an agent PR, skipping automatic RCA trigger.`);
    // We might still want to do it for humans, but the request specifically mentioned "AI PR reversion"
    // process.exit(0);
  }

  const rcaTitle = `[RCA] Reflection: Reverted PR #${prNumber} — ${pr.title}`;
  const rcaBody = `## Root Cause Analysis Request

The AI-generated PR #${prNumber} was reverted in commit ${revertSha}.

### Original PR Details
- **Title:** ${pr.title}
- **Author:** ${pr.author.login}
- **Branch:** ${pr.headRefName}

### Task for Agent
1. **Analyze:** Examine the diff of #${prNumber} and the reasons for its revert (check CI logs, PR comments, or broken main alerts).
2. **Identify:** What was the root cause? (e.g., missing edge case, flaky test, bad import, logic error).
3. **Prevent:** 
   - Add a new entry to \`.claude/rules/gotchas.md\` or \`AGENTS.md\` to prevent this specific failure mode.
   - Propose a fix that addresses the original issue without the bug.
4. **Document:** Write the RCA findings to \`.claude/reflections/RCA-PR-${prNumber}.md\`.

Labels: \`meta-improvement\`, \`${COORDINATION_LABELS.READY}\`, \`critical\``;

  let newIssue;
  try {
    newIssue = ghClient.issue.create(buildRcaCreateArgs(rcaTitle, rcaBody));
  } catch (e) {
    console.error(`gh command failed: ${e.message}`);
  }

  if (newIssue) {
    console.log(`Created RCA issue: ${newIssue}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
