import { doctlJson } from "../command-builder.js";

export async function deployStatus(run: (args: string[]) => string = doctlJson): Promise<string> {
  const output = run([
    "apps",
    "list",
    "--format",
    "ID,Spec.Name,ActiveDeployment.Phase,InProgressDeployment.Phase",
    "--no-header",
  ]);
  try {
    const asJson = JSON.parse(output) as { error?: string };
    if (asJson.error !== undefined) {
      return output;
    }
  } catch {
    // not JSON — treat as doctl tabular output
  }
  const lines = output.trim().split("\n").filter(Boolean);
  const apps = lines.map((line) => {
    const parts = line.trim().split(/\s{2,}/);
    return {
      id: parts[0],
      name: parts[1],
      activePhase: parts[2] ?? "unknown",
      inProgressPhase: parts[3] ?? "none",
    };
  });
  return JSON.stringify({ apps }, null, 2);
}
