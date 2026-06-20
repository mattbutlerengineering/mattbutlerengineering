import { execSync } from "node:child_process";

/** Signature-compatible with execSync for injection in tests. */
export type ShellRunner = (cmd: string, opts: { encoding: "utf-8"; timeout: number }) => string;

export interface ShellRunnerOptions {
  /** Injected runner — defaults to node's execSync. */
  runner?: ShellRunner;
  /** Timeout in milliseconds. Defaults to 15 000. */
  timeoutMs?: number;
  /** Label used in the error envelope's `error` field. Defaults to "Command failed". */
  errorLabel?: string;
}

/**
 * Creates a shell command runner with centralised timeout and error-envelope logic.
 * Returns the trimmed stdout on success; returns JSON error-envelope on failure.
 */
export function createShellRunner(opts: ShellRunnerOptions = {}) {
  const runner = opts.runner ?? (execSync as unknown as ShellRunner);
  const timeout = opts.timeoutMs ?? 15_000;
  const errorLabel = opts.errorLabel ?? "Command failed";

  return function run(cmd: string): string {
    try {
      return (runner(cmd, { encoding: "utf-8", timeout }) as string).trim();
    } catch (error) {
      return JSON.stringify({
        error: errorLabel,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
