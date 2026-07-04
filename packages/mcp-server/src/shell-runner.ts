import { execFileSync } from "node:child_process";

/** Signature-compatible with execFileSync for injection in tests. */
export type ShellRunner = (
  cmd: string,
  args: string[],
  opts: { encoding: "utf-8"; timeout: number }
) => string;

export interface ShellRunnerOptions {
  /** Injected runner — defaults to node's execFileSync. */
  runner?: ShellRunner;
  /** Timeout in milliseconds. Defaults to 15 000. */
  timeoutMs?: number;
  /** Label used in the error envelope's `error` field. Defaults to "Command failed". */
  errorLabel?: string;
}

/**
 * Creates a command runner with centralised timeout and error-envelope logic.
 * Invokes `cmd` with `args` via `execFileSync` — no shell is spawned, so argv
 * elements are never subject to shell parsing/interpolation. Returns the
 * trimmed stdout on success; returns a JSON error-envelope on failure.
 */
export function createShellRunner(opts: ShellRunnerOptions = {}) {
  const runner = opts.runner ?? (execFileSync as unknown as ShellRunner);
  const timeout = opts.timeoutMs ?? 15_000;
  const errorLabel = opts.errorLabel ?? "Command failed";

  return function run(cmd: string, args: string[] = []): string {
    try {
      return (runner(cmd, args, { encoding: "utf-8", timeout }) as string).trim();
    } catch (error) {
      return JSON.stringify({
        error: errorLabel,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
