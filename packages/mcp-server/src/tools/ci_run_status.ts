import { execSync } from "node:child_process";

export async function ciRunStatus(): Promise<string> {
  try {
    const output = execSync(
      "gh run list --limit 10 --json name,status,conclusion,headBranch,updatedAt",
      { encoding: "utf-8", timeout: 30000 }
    );
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no runs")) {
      return JSON.stringify({ error: "No recent workflow runs found" });
    }
    return JSON.stringify({ error: "Failed to get CI run status", details: message });
  }
}
