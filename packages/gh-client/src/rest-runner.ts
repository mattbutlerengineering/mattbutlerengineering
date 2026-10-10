import { parseArgs, flag, resolveToken } from "./rest-args.js";
import type { ParsedArgs } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import { resolveRepoSlug } from "./repo-resolver.js";
import type { SyncHttp } from "./sync-http.js";
import { defaultSyncHttp } from "./sync-http.js";
import {
  issueList,
  issueView,
  issueCreate,
  issueComment,
  issueReopen,
  issueClose,
  issueEdit,
} from "./rest-issue-ops.js";
import { prList, prView, prCreate } from "./rest-pr-ops.js";
import { labelList, workflowRuns } from "./rest-label-run-ops.js";

export interface RestRunnerOptions {
  /** Defaults to `GITHUB_TOKEN ?? GH_TOKEN`. */
  token?: string;
  owner?: string;
  repoName?: string;
  /** Injected in tests — defaults to the real subprocess-fetch bridge. */
  http?: SyncHttp;
  /** Injected in tests for git-derived defaults (repo slug, PR head branch). */
  exec?: (cmd: string, args: string[]) => string;
  env?: NodeJS.ProcessEnv;
  /** Sink for unsupported-flag warnings — defaults to stderr. Injected in tests. */
  warn?: (message: string) => void;
}

/**
 * Every flag some REST op actually reads (via `flag`/`flagAll`/`wantsJsonField`).
 * Anything else is accepted by `parseArgs` but has no effect on the REST path,
 * so it is reported rather than dropped silently — a divergence from `gh` must
 * be visible (#6039).
 */
const EMULATED_FLAGS = new Set([
  "add-label",
  "base",
  "body",
  "branch",
  "comment",
  "commit",
  "head",
  "jq",
  "json",
  "label",
  "limit",
  "missing",
  "remove-label",
  "search",
  "state",
  "title",
  "workflow",
]);

function defaultWarn(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * REST fallback for `@mbe/gh-client`'s exec transport — see #3689. Mirrors
 * {@link createExecRunner}'s `(cmd, args) => string` signature exactly, so
 * `client.ts`'s facets don't need to know which transport is behind `run()`.
 * `args` is the same `["issue", "list", "--label", "ready", ...]` shape `gh`
 * itself takes; only the resource/action pairs `client.ts` actually emits are
 * supported.
 */
export function createRestRunner(
  opts: RestRunnerOptions = {}
): (cmd: string, args: string[]) => string {
  const warn = opts.warn ?? defaultWarn;
  const warned = new Set<string>();

  function warnUnemulated(parsed: ParsedArgs, command: string): void {
    for (const name of Object.keys(parsed.flags)) {
      if (EMULATED_FLAGS.has(name) || warned.has(name)) continue;
      warned.add(name);
      warn(`gh-client REST fallback: ignoring unsupported flag --${name} on "gh ${command}"`);
    }
  }

  return function run(_cmd: string, args: string[]): string {
    const env = opts.env ?? process.env;
    const token = opts.token ?? resolveToken(env);
    const { owner, repo } =
      opts.owner && opts.repoName
        ? { owner: opts.owner, repo: opts.repoName }
        : resolveRepoSlug({ env, exec: opts.exec });
    const http = opts.http ?? defaultSyncHttp;
    const ctx: RestContext = { token, owner, repo, http };

    const [resource, action, ...rest] = args;
    const parsed = parseArgs(rest);
    warnUnemulated(parsed, `${resource} ${action}`);
    const number = Number(parsed.positional[0]);

    switch (`${resource} ${action}`) {
      case "issue list":
        return JSON.stringify(issueList(ctx, parsed));
      case "issue view":
        return JSON.stringify(issueView(ctx, number, parsed));
      case "issue create":
        return issueCreate(ctx, parsed);
      case "issue comment":
        issueComment(ctx, number, flag(parsed, "body") ?? "");
        return "";
      case "issue reopen":
        issueReopen(ctx, number);
        return "";
      case "issue close":
        issueClose(ctx, number, parsed);
        return "";
      case "issue edit":
        issueEdit(ctx, number, parsed);
        return "";
      case "pr list":
        return JSON.stringify(prList(ctx, parsed));
      case "pr view":
        return JSON.stringify(prView(ctx, number, parsed));
      case "pr create":
        return prCreate(ctx, parsed, { exec: opts.exec });
      case "label list":
        return JSON.stringify(labelList(ctx, parsed));
      case "run list":
        return JSON.stringify(workflowRuns(ctx, parsed));
      default:
        throw new Error(`gh-client REST fallback: unsupported command "gh ${args.join(" ")}"`);
    }
  };
}
