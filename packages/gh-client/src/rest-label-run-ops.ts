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

interface RawWorkflow {
  id: number;
  name?: string;
  path?: string;
}

/**
 * Resolves a `--workflow` argument (display name, file name or path) to a
 * numeric workflow id. Returns undefined when nothing matches.
 */
function resolveWorkflowId(ctx: RestContext, workflow: string): number | undefined {
  const workflows = fetchAllPages(
    ctx,
    `/repos/${ctx.owner}/${ctx.repo}/actions/workflows`,
    500,
    "workflows"
  ) as RawWorkflow[];
  const match = workflows.find(
    (w) =>
      w.name === workflow ||
      w.path === workflow ||
      (w.path !== undefined && w.path.split("/").pop() === workflow)
  );
  return match?.id;
}

/**
 * Backs `workflow.runs` (`gh run list`). `--workflow <name>` is resolved to a
 * workflow id and queried via the workflow-scoped runs endpoint, so a workflow
 * that rarely runs (e.g. "E2E Tests") is not crowded out of the repo-wide
 * newest-N page (#9173). If no workflow matches, falls back to filtering the
 * repo-wide runs client-side by `run.name`.
 */
export function workflowRuns(ctx: RestContext, parsed: ParsedArgs): unknown[] {
  const limit = Number(flag(parsed, "limit") ?? "30");
  const params = new URLSearchParams();

  const branch = flag(parsed, "branch");
  if (branch) params.set("branch", branch);
  const commit = flag(parsed, "commit");
  if (commit) params.set("head_sha", commit);

  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  const workflowName = flag(parsed, "workflow");
  const workflowId = workflowName ? resolveWorkflowId(ctx, workflowName) : undefined;

  if (workflowId !== undefined) {
    const scoped = `/repos/${ctx.owner}/${ctx.repo}/actions/workflows/${workflowId}/runs${suffix}`;
    const items = fetchAllPages(ctx, scoped, limit, "workflow_runs") as RawWorkflowRun[];
    return items.map(mapWorkflowRun);
  }

  const path = `/repos/${ctx.owner}/${ctx.repo}/actions/runs${suffix}`;
  const items = fetchAllPages(ctx, path, limit, "workflow_runs") as RawWorkflowRun[];
  const filtered = workflowName ? items.filter((run) => run.name === workflowName) : items;
  return filtered.map(mapWorkflowRun);
}
