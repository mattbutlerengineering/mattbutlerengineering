import { execSync } from "node:child_process";

export async function gitWorkflowStatus(): Promise<string> {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    const commits = execSync("git log --oneline -5", { encoding: "utf-8" }).trim();
    
    let ciStatus = "unknown";
    try {
      const run = execSync("gh run list --branch main --limit 1 --json conclusion", { encoding: "utf-8" });
      const result = JSON.parse(run);
      ciStatus = result[0]?.conclusion || "unknown";
    } catch {
      // gh CLI not available or failed - ciStatus remains "unknown"
    }

    return JSON.stringify({
      currentBranch: branch,
      hasUncommittedChanges: status.length > 0,
      pendingChanges: status.split("\n").filter(Boolean),
      recentCommits: commits.split("\n"),
      mainBranchCI: ciStatus,
    }, null, 2);
  } catch (error) {
    return JSON.stringify({ error: "Failed to get git status", message: error instanceof Error ? error.message : String(error) });
  }
}
