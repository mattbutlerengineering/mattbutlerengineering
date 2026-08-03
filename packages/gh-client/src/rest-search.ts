import type { ParsedArgs } from "./rest-args.js";
import { flag, flagAll } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";

/**
 * Builds a GitHub Search API query string equivalent to `gh issue/pr list
 * --search <term>` — the only search shape used across `scripts/*.mjs`
 * (a free-text term plus optional `--state`/`--label`).
 */
export function buildSearchQuery(
  ctx: RestContext,
  kind: "issue" | "pr",
  parsed: ParsedArgs,
  search: string
): string {
  const parts = [`repo:${ctx.owner}/${ctx.repo}`, kind === "pr" ? "is:pr" : "is:issue"];

  const state = flag(parsed, "state");
  if (state && state !== "all") parts.push(`state:${state}`);

  for (const label of flagAll(parsed, "label")) {
    parts.push(`label:${label}`);
  }

  parts.push(search);
  return parts.join(" ");
}
