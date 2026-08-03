import { execFileSync } from "node:child_process";

/** The current local git branch — `gh pr create`'s implicit `--head` default. */
export function currentBranch(exec: (cmd: string, args: string[]) => string = defaultExec): string {
  return exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

function defaultExec(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", timeout: 5_000 });
}
