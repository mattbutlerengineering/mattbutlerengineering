import { createShellRunner } from "../shell-runner.js";

const defaultRun = createShellRunner({ errorLabel: "Failed to get CI status" });

export async function ciRunStatus(run = defaultRun): Promise<string> {
  const output = run(`gh run list --limit 10 --json name,status,conclusion,workflowName`);
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
