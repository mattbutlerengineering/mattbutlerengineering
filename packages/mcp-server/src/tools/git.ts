import { createShellRunner } from "../shell-runner.js";

const defaultRun = createShellRunner({ errorLabel: "Failed to get git status" });

function isErrorEnvelope(output: string): boolean {
  try {
    const parsed = JSON.parse(output) as { error?: unknown };
    return parsed.error !== undefined;
  } catch {
    return false;
  }
}

export async function gitWorkflowStatus(run = defaultRun): Promise<string> {
  const branch = run("git rev-parse --abbrev-ref HEAD");
  if (isErrorEnvelope(branch)) {
    return branch;
  }

  const status = run("git status --porcelain");
  if (isErrorEnvelope(status)) {
    return status;
  }

  const commits = run("git log --oneline -5");
  if (isErrorEnvelope(commits)) {
    return commits;
  }

  let ciStatus = "unknown";
  const ciOutput = run("gh run list --branch main --limit 1 --json conclusion");
  if (!isErrorEnvelope(ciOutput)) {
    try {
      const result = JSON.parse(ciOutput) as Array<{ conclusion?: string }>;
      ciStatus = result[0]?.conclusion ?? "unknown";
    } catch {
      // malformed output — ciStatus remains "unknown"
    }
  }

  return JSON.stringify(
    {
      currentBranch: branch,
      hasUncommittedChanges: status.length > 0,
      pendingChanges: status.split("\n").filter(Boolean),
      recentCommits: commits.split("\n"),
      mainBranchCI: ciStatus,
    },
    null,
    2
  );
}
