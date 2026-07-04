import { ghJson } from "../command-builder.js";

export async function ciRunStatus(run = ghJson): Promise<string> {
  const output = run([
    "run",
    "list",
    "--limit",
    "10",
    "--json",
    "name,status,conclusion,workflowName",
  ]);
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed, null, 2);
    }
    return output;
  } catch {
    return output;
  }
}
