import { execSync } from "node:child_process";

const WORKFLOWS = ["CI", "Deploy Services", "Deploy Static", "Secret Scan"];

export async function ciRunStatus(): Promise<string> {
  try {
    const output = execSync(`gh run list --limit 10 --json name,status,conclusion,workflowName`, {
      encoding: "utf-8",
    });
    const runs = JSON.parse(output);
    return JSON.stringify(runs, null, 2);
  } catch (error) {
    return JSON.stringify({ error: "Failed to get CI status", message: error instanceof Error ? error.message : String(error) });
  }
}
