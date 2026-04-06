import { execSync } from "node:child_process";

export async function pulumiStackOutputs(): Promise<string> {
  try {
    const output = execSync("pulumi stack output --json", {
      cwd: process.cwd() + "/infrastructure/pulumi",
      encoding: "utf-8",
      timeout: 30000,
    });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no stack selected")) {
      return JSON.stringify({ error: "No Pulumi stack selected. Run 'pulumi stack select prod' first." });
    }
    return JSON.stringify({ error: "Failed to get Pulumi stack outputs", details: message });
  }
}
