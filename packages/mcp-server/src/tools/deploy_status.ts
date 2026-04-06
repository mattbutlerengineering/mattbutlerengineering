import { execSync } from "node:child_process";

export async function deployStatus(): Promise<string> {
  try {
    const output = execSync("doctl apps list --format ID,Spec.Name,Phase,Updated_At --no-header", {
      encoding: "utf-8",
      timeout: 30000,
    });
    const lines = output.trim().split("\n").filter(Boolean);
    const apps = lines.map((line: string) => {
      const [id, name, phase, updatedAt] = line.split(/\s{2,}/);
      return { id, name, phase, updatedAt };
    });
    return JSON.stringify(apps, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: "Failed to get deploy status", details: message });
  }
}
