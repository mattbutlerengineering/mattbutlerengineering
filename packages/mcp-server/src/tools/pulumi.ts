import { createShellRunner } from "../shell-runner.js";

const defaultRun = createShellRunner({
  timeoutMs: 30_000,
  errorLabel: "Failed to get Pulumi outputs",
});

export async function pulumiStackOutputs(run = defaultRun): Promise<string> {
  return run("pulumi stack output --json");
}
