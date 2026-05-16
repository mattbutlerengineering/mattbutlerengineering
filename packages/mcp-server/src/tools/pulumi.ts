import { execSync } from "node:child_process";

export async function pulumiStackOutputs(): Promise<string> {
  try {
    const output = execSync("pulumi stack output --json", {
      encoding: "utf-8",
      timeout: 30000,
    });
    return output;
  } catch (error) {
    return JSON.stringify({ error: "Failed to get Pulumi outputs", message: error instanceof Error ? error.message : String(error) });
  }
}
