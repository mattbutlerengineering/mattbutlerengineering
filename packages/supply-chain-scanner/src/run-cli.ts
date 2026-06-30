import { scanPackage } from "./scan-package.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/**
 * Pure CLI core: scans the package at argv[2], writes JSON to stdout, and
 * returns the intended process exit code (1 on a `block` verdict, 2 on usage
 * error, 0 otherwise). IO is injected so it is testable without spawning.
 */
export function run(argv: readonly string[], io: CliIo): number {
  const target = argv[2];
  if (!target) {
    io.stderr("usage: mbe-scan <path-to-package>\n");
    return 2;
  }
  const result = scanPackage(target);
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return result.verdict === "block" ? 1 : 0;
}
