import { execSync } from "node:child_process";

export async function deployStatus(): Promise<string> {
  try {
    const output = execSync(`doctl apps list --format ID,Spec.Name,ActiveDeployment.Phase,InProgressDeployment.Phase --no-header`, {
      encoding: "utf-8",
    });
    const lines = output.trim().split("\n").filter(Boolean);
    const apps = lines.map((line) => {
      const parts = line.trim().split(/\s{2,}/);
      return {
        id: parts[0],
        name: parts[1],
        activePhase: parts[2] || "unknown",
        inProgressPhase: parts[3] || "none",
      };
    });
    return JSON.stringify({ apps }, null, 2);
  } catch (error) {
    return JSON.stringify({
      error: "Failed to get deploy status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
