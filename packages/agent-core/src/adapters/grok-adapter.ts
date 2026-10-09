/**
 * GrokCliAdapter — spawns the Grok CLI in headless mode inside an isolated worktree.
 *
 * Explicitly selectable only (`--adapter grok`). Not part of the ADR-017 `auto`
 * cascade (claude → gemini → opencode), same rule as `ClaudeCliAdapter`:
 * inserting it would change what `auto` resolves to wherever `grok` is on PATH.
 * The caller creates the worktree, so this adapter must not pass `--worktree`.
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";
import { parseGrokUsage, extractGrokError, type CliUsage } from "./cli-usage-parser.js";

export class GrokCliAdapter extends CliAdapterBase {
  readonly name = "grok";
  readonly cliBinary = "grok";
  protected override get displayName(): string {
    return "Grok";
  }

  /**
   * Headless invocation: `-p <task> --output-format json --always-approve`.
   * `--max-turns` is forwarded when set. `--model` is forwarded only for a
   * `grok-…` id — the session router otherwise fills `model` with a Claude
   * id, and `grok -m claude-sonnet-5` rejects the run.
   */
  protected buildArgs(config: AdapterConfig): string[] {
    const args = ["-p", config.taskDescription, "--output-format", "json", "--always-approve"];
    if (config.maxTurns) {
      args.push("--max-turns", String(config.maxTurns));
    }
    if (config.model?.startsWith("grok-")) {
      args.push("-m", config.model);
    }
    return args;
  }

  protected override parseUsage(stdout: string): CliUsage {
    return parseGrokUsage(stdout);
  }

  protected override parseErrorFromStdout(stdout: string): string | undefined {
    return extractGrokError(stdout);
  }
}
