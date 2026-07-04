import { createShellRunner } from "./shell-runner.js";

const TRAVERSAL_PATTERN = /\.\./;

function assertNoTraversal(value: string, label: string): void {
  if (TRAVERSAL_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: must not contain a path-traversal sequence ("..")`);
  }
}

const defaultPsqlRun = createShellRunner({ errorLabel: "Failed to run psql query" });

/**
 * Runs a psql query via argv (no shell). `dbUrl` and `sql` are passed as
 * distinct argv elements to `execFileSync`, so neither is ever concatenated
 * into a shell-interpreted string.
 */
export function psqlQuery(
  dbUrl: string,
  sql: string,
  run: (cmd: string, args: string[]) => string = defaultPsqlRun
): string {
  assertNoTraversal(dbUrl, "database URL");
  assertNoTraversal(sql, "SQL statement");
  return run("psql", [dbUrl, "-t", "-c", sql]);
}

const defaultGhRun = createShellRunner({ errorLabel: "Failed to run gh command" });

/** Runs the GitHub CLI (`gh`) with structured argv — caller supplies the full args array. */
export function ghJson(
  args: string[],
  run: (cmd: string, args: string[]) => string = defaultGhRun
): string {
  return run("gh", args);
}

const defaultDoctlRun = createShellRunner({ errorLabel: "Failed to run doctl command" });

/** Runs the DigitalOcean CLI (`doctl`) with structured argv. */
export function doctlJson(
  args: string[],
  run: (cmd: string, args: string[]) => string = defaultDoctlRun
): string {
  return run("doctl", args);
}

const defaultPulumiRun = createShellRunner({
  timeoutMs: 30_000,
  errorLabel: "Failed to run pulumi command",
});

/** Runs the Pulumi CLI with structured argv. */
export function pulumiJson(
  args: string[],
  run: (cmd: string, args: string[]) => string = defaultPulumiRun
): string {
  return run("pulumi", args);
}
