import { createExecRunner } from "./exec-runner.js";
import type { ExecRunnerOptions } from "./exec-runner.js";
import { createRestRunner } from "./rest-runner.js";
import type { RestRunnerOptions } from "./rest-runner.js";
import { MissingGithubTokenError } from "./rest-args.js";
import type { GhProbe } from "./gh-probe.js";
import { probeGh } from "./gh-probe.js";

export interface TransportOptions extends ExecRunnerOptions, RestRunnerOptions {
  /** Injected in tests to force the exec or REST path — see #3689. */
  probe?: GhProbe;
}

type Run = (cmd: string, args: string[]) => string;

/**
 * Thrown when `gh` is present but its GraphQL backend is blocked (Claude Code
 * Remote sessions, #6039) AND the REST fallback has no token to run with.
 * Distinct from {@link MissingGithubTokenError} and from a rejected
 * credential: the environment forbids GraphQL, which is permanent, not
 * a token that needs refreshing.
 */
export class GhGraphqlUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "gh-client: `gh` is present but GitHub GraphQL is unavailable in this session, " +
        "and the REST fallback has no GITHUB_TOKEN/GH_TOKEN to use instead.",
      { cause }
    );
    this.name = "GhGraphqlUnavailableError";
  }
}

/**
 * True only for the exact shape `gh` prints when GitHub refuses GraphQL for
 * the whole session: an HTTP 403 from the GraphQL endpoint whose body points
 * at REST. A 401 (bad credentials), a scope-related 403, or any non-HTTP
 * failure does not match, so it surfaces unchanged instead of being retried.
 */
export function isGraphqlUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const stderr = (err as { stderr?: unknown }).stderr;
  const text = `${err.message}\n${typeof stderr === "string" ? stderr : ""}`;
  return (
    /HTTP 403/.test(text) &&
    /api\.github\.com\/graphql/i.test(text) &&
    /GraphQL is not available|use the REST API/i.test(text)
  );
}

/**
 * Picks the exec (`gh` binary) or REST transport and returns a `run` function
 * shaped exactly like {@link createExecRunner}'s — callers in `client.ts`
 * never see which one they got.
 *
 * `gh` absent → REST for every call (#3689). `gh` present → exec, so local/CI
 * behaviour with a working `gh` is byte-identical to before. If an exec call
 * fails because GraphQL is unavailable (#6039), that same call is retried
 * through REST and the transport latches to REST for the rest of this
 * runner's life: the condition is session-wide, so retrying exec would only
 * pay a failed subprocess per call. The latch is one-way, so it cannot flap.
 */
export function createTransportRunner(opts: TransportOptions = {}): Run {
  const probe = opts.probe ?? probeGh;
  if (!probe()) return createRestRunner(opts);

  const exec = createExecRunner(opts);
  const rest = createRestRunner(opts);
  let latchedRest = false;

  return function run(cmd: string, args: string[]): string {
    if (latchedRest) return rest(cmd, args);
    try {
      return exec(cmd, args);
    } catch (err) {
      if (!isGraphqlUnavailableError(err)) throw err;
      latchedRest = true;
      return runRestFallback(rest, cmd, args, err);
    }
  };
}

function runRestFallback(rest: Run, cmd: string, args: string[], execErr: unknown): string {
  try {
    return rest(cmd, args);
  } catch (err) {
    if (err instanceof MissingGithubTokenError) throw new GhGraphqlUnavailableError(execErr);
    throw err;
  }
}
