import { execFileSync } from "node:child_process";

/** Signature-compatible with execFileSync for injection in tests. */
export type ExecRunner = (
  cmd: string,
  args: string[],
  opts: { encoding: "utf-8"; timeout: number }
) => string;

export interface ExecRunnerOptions {
  /** Injected runner — defaults to node's execFileSync. */
  runner?: ExecRunner;
  /** Timeout in milliseconds. Defaults to 15 000. */
  timeoutMs?: number;
}

/**
 * Creates a gh exec wrapper with centralized timeout and error handling.
 * Returns the trimmed stdout string on success; throws on failure.
 */
export function createExecRunner(opts: ExecRunnerOptions = {}) {
  const runner = opts.runner ?? (execFileSync as ExecRunner);
  const timeout = opts.timeoutMs ?? 15_000;

  return function run(cmd: string, args: string[]): string {
    return (runner(cmd, args, { encoding: "utf-8", timeout }) as string).trim();
  };
}
