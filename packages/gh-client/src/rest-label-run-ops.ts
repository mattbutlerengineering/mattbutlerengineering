import type { ParsedArgs } from "./rest-args.js";
import { flag } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import { fetchAllPages } from "./rest-paginate.js";
import type { RawLabel, RawWorkflowRun } from "./rest-mappers.js";
import { mapLabel, mapWorkflowRun } from "./rest-mappers.js";

export function labelList(ctx: RestContext, parsed: ParsedArgs): unknown[] {
  const limit = Number(flag(parsed, "limit") ?? "30");
  const items = fetchAllPages(ctx, `/repos/${ctx.owner}/${ctx.repo}/labels`, limit);
  return (items as RawLabel[]).map(mapLabel);
}

/**
 * Backs `workflow.runs` (`gh run list`). `--workflow <name>` is filtered
 * client-side against each run's `name` field — REST's workflow-scoped runs
 * endpoint needs a numeric/filename workflow id, which `gh`'s display-name
 * argument doesn't give us without an extra lookup call this repo's actual
 * usage (`--workflow CI`) doesn't need.
 */
export function workflowRuns(ctx: RestContext, parsed: ParsedArgs): unknown[] {
  const limit = Number(flag(parsed, "limit") ?? "30");
  const params = new URLSearchParams();

  const branch = flag(parsed, "branch");
  if (branch) params.set("branch", branch);
  const commit = flag(parsed, "commit");
  if (commit) params.set("head_sha", commit);

  const query = params.toString();
  const path = `/repos/${ctx.owner}/${ctx.repo}/actions/runs${query ? `?${query}` : ""}`;
  const items = fetchAllPages(ctx, path, limit, "workflow_runs") as RawWorkflowRun[];

  const workflowName = flag(parsed, "workflow");
  const filtered = workflowName ? items.filter((run) => run.name === workflowName) : items;
  return filtered.map(mapWorkflowRun);
}
