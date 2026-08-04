import { createExecRunner } from "./exec-runner.js";
import type { ExecRunnerOptions } from "./exec-runner.js";
import { createRestRunner } from "./rest-runner.js";
import type { RestRunnerOptions } from "./rest-runner.js";
import type { GhProbe } from "./gh-probe.js";
import { probeGh } from "./gh-probe.js";

export interface TransportOptions extends ExecRunnerOptions, RestRunnerOptions {
  /** Injected in tests to force the exec or REST path — see #3689. */
  probe?: GhProbe;
}

/**
 * Picks the exec (`gh` binary) or REST transport once per client and returns
 * a `run` function shaped exactly like {@link createExecRunner}'s — callers
 * in `client.ts` never see which one they got. `gh` present is checked
 * first and, when true, delegates to the untouched exec path so local/CI
 * behaviour with `gh` installed is byte-identical to before #3689.
 */
export function createTransportRunner(
  opts: TransportOptions = {}
): (cmd: string, args: string[]) => string {
  const probe = opts.probe ?? probeGh;
  return probe() ? createExecRunner(opts) : createRestRunner(opts);
}
