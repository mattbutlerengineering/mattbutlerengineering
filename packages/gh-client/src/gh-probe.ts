import { execFileSync } from "node:child_process";

export type GhProbe = () => boolean;

/** Runs `gh --version`; throws if the binary is missing or unusable. */
function defaultProbeExec(): void {
  execFileSync("gh", ["--version"], {
    encoding: "utf-8",
    timeout: 5_000,
    stdio: ["ignore", "ignore", "ignore"],
  });
}

/**
 * Builds a memoized `gh`-availability prober: the injected `probeExec` runs
 * at most once per prober instance, and every subsequent call returns the
 * cached result. This is the "detect once" seam #3689 asks for — callers pay
 * the exec cost a single time per process, not once per gh-client operation.
 */
export function createGhProbe(probeExec: () => void = defaultProbeExec): GhProbe {
  let cached: boolean | undefined;
  return () => {
    if (cached === undefined) {
      cached = isProbeSuccessful(probeExec);
    }
    return cached;
  };
}

function isProbeSuccessful(probeExec: () => void): boolean {
  try {
    probeExec();
    return true;
  } catch {
    return false;
  }
}

/** Process-lifetime singleton probe — what `createGhClient` uses by default. */
export const probeGh: GhProbe = createGhProbe();
