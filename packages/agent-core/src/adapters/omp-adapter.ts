/**
 * OmpCliAdapter — spawns Oh My Pi (`omp`) in headless JSON mode inside an
 * isolated worktree.
 *
 * Explicitly selectable only (`--adapter omp`). Not part of the ADR-017
 * `auto` cascade (claude → opencode): inserting it would change what `auto`
 * resolves to wherever `omp` is on PATH. The caller creates the worktree,
 * so this adapter must not pass `--worktree` or `--cwd` (`spawnCli` already
 * sets cwd).
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";
import { parseOmpUsage, extractOmpError, type CliUsage } from "./cli-usage-parser.js";

/**
 * The session router fills `model` with a Claude id (`claude-sonnet-5`).
 * `omp --model` fuzzy-matches its own catalog and would override the user's
 * configured default with that id. Forward a provider/model id
 * (`anthropic/claude-opus-4-8`) or a non-Claude fuzzy name (`gpt-5.2`).
 */
export function ompModelToForward(model: string | undefined): string | undefined {
  if (!model || model.startsWith("claude-")) return undefined;
  return model;
}

export class OmpCliAdapter extends CliAdapterBase {
  readonly name = "omp";
  readonly cliBinary = "omp";
  protected override get displayName(): string {
    return "omp";
  }

  /**
   * Headless invocation: `-p --mode json --auto-approve --no-session -- <task>`.
   * `--` keeps a task that starts with `-` from being parsed as a flag.
   * `--no-session` keeps automated runs out of the interactive session store.
   */
  protected buildArgs(config: AdapterConfig): string[] {
    const args = ["-p", "--mode", "json", "--auto-approve", "--no-session"];
    const model = ompModelToForward(config.model);
    if (model) {
      args.push("--model", model);
    }
    args.push("--", config.taskDescription);
    return args;
  }

  protected override parseUsage(stdout: string): CliUsage {
    return parseOmpUsage(stdout);
  }

  protected override parseErrorFromStdout(stdout: string): string | undefined {
    return extractOmpError(stdout);
  }
}
