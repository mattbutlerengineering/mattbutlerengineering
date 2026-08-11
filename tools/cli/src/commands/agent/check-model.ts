import { Command } from "commander";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type { TelemetryRow } from "@mbe/agent-core";
import { routeModelWithReason, estimateIssueTokens } from "@mbe/agent-core";
import { createGhClient } from "@mbe/gh-client";
import type { GhClient } from "@mbe/gh-client";
import { resolveIssueModel } from "../../resolve-issue-model.js";

/** Absolute path to the per-issue queue telemetry log (JSONL). */
const QUEUE_TELEMETRY_PATH = join(
  dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "..",
  "..",
  "..",
  "metrics",
  "queue-telemetry.jsonl"
);

/**
 * Read historical queue telemetry rows for token estimation. Fail-soft: a
 * missing/unreadable file or malformed lines yield an empty (or partial) list
 * rather than an error — check-model must never crash on telemetry problems.
 */
function loadTelemetryHistory(): TelemetryRow[] {
  let content: string;
  try {
    content = readFileSync(QUEUE_TELEMETRY_PATH, "utf8");
  } catch {
    return [];
  }
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TelemetryRow];
      } catch {
        return [];
      }
    });
}

interface FetchedIssue {
  title: string;
  body: string;
  labels: string[];
}

/**
 * Fetch an issue's routing-relevant fields via `@mbe/gh-client` — the same
 * exec→REST fallback `issue.ts`'s `transitionIssue` already uses (#3689),
 * instead of shelling to `gh` directly and hitting a raw `spawn gh ENOENT`
 * in `gh`-less sessions.
 */
export function fetchIssueForRouting(issueNumber: string, client: GhClient): FetchedIssue {
  const raw = client.issue.view(Number(issueNumber), ["--json", "title,body,labels"]) as {
    title: string;
    body: string | null;
    labels: { name: string }[];
  };
  return {
    title: raw.title,
    body: raw.body ?? "",
    labels: raw.labels.map((l) => l.name),
  };
}

export const checkModelCommand = new Command("check-model")
  .description("Resolve model selection for a directive (dry-run) or a GitHub issue (--issue)")
  .argument("[directive]", "The task description (omit when using --issue)")
  .option(
    "--issue <number>",
    "Resolve the model for a GitHub issue (fetched via gh), honoring its agent frontmatter; prints the model ID to stdout"
  )
  .action((directive: string | undefined, options: { issue?: string }) => {
    // Issue mode: machine-readable. Tier on stdout, context on stderr, so the
    // implement-queue skill can capture stdout directly into Agent(model:).
    // The Agent/Task tool's `model` parameter is a tier-only enum
    // (sonnet|opus|haiku|fable) — emit the tier, not the full model ID, which
    // would be out-of-enum and rejected by the dispatch.
    if (options.issue) {
      let issue: FetchedIssue;
      try {
        issue = fetchIssueForRouting(options.issue, createGhClient());
      } catch (err) {
        console.error(
          `check-model: cannot fetch issue #${options.issue}: ${(err as Error).message}`
        );
        process.exitCode = 1;
        return;
      }
      const result = resolveIssueModel(issue);
      console.error(
        `check-model: #${options.issue} → ${result.tier} (${result.source}, ${result.modelId}): ${result.reason}`
      );

      // Token-usage estimate from historical telemetry (stderr only — stdout
      // stays the tier-only contract the implement-queue skill parses).
      const estimate = estimateIssueTokens(issue, loadTelemetryHistory());
      console.error(
        `check-model: #${options.issue} estimate → ~${estimate.estimatedTokens} tokens ` +
          `(~$${estimate.estimatedCostUsd.toFixed(2)}, ${estimate.confidence} confidence): ${estimate.basis}`
      );

      console.log(result.tier);
      return;
    }

    if (!directive) {
      console.error("check-model: provide a <directive> or --issue <number>");
      process.exitCode = 1;
      return;
    }

    // Directive mode: human dry-run (no labels/body available).
    const result = routeModelWithReason({
      title: directive,
      labels: [],
      body: "",
    });

    console.log("\n🤖 Model Selection Dry-Run");
    console.log("==========================");
    console.log(`Directive:  "${directive}"`);
    console.log(`Tier:       ${result.tier.toUpperCase()}`);
    console.log(`Model ID:   ${result.modelId}`);
    console.log(`Reason:     ${result.reason}`);
    console.log("");
  });
