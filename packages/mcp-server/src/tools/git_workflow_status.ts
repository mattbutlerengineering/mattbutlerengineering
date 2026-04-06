import { execSync } from "node:child_process";

export async function gitWorkflowStatus(): Promise<string> {
  try {
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    const pendingChanges = status ? status.split("\n").length : 0;
    const hasChanges = pendingChanges > 0;

    let ciStatus = "unknown";
    try {
      const ciOutput = execSync(
        `gh run list --branch ${branch} --limit 1 --json status,conclusion`,
        { encoding: "utf-8", timeout: 10000 }
      );
      const ciData = JSON.parse(ciOutput);
      if (ciData.length > 0) {
        ciStatus = ciData[0].conclusion || ciData[0].status || "unknown";
      }
    } catch {
      // Ignore CI status errors
    }

    return JSON.stringify(
      {
        branch,
        hasPendingChanges: hasChanges,
        pendingChangesCount: pendingChanges,
        ciStatus,
      },
      null,
      2
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: "Failed to get git workflow status", details: message });
  }
}
