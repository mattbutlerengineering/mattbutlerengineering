/**
 * GeminiCliAdapter — spawns the Gemini CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude is rate-limited.
 * The adapter does NOT create worktrees — the router/caller handles that.
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";
import { parseGeminiUsage, type CliUsage } from "./cli-usage-parser.js";

export class GeminiCliAdapter extends CliAdapterBase {
  readonly name = "gemini";
  readonly cliBinary = "gemini";
  protected override get displayName(): string {
    return "Gemini";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["-p", config.taskDescription, "--yolo"];
  }

  /**
   * Gemini CLI's default text output carries no usage data — this only
   * yields real tokenUsage if stdout happens to be the `--output-format
   * json` blob (not currently requested by buildArgs; see cli-usage-parser.ts).
   */
  protected override parseUsage(stdout: string): CliUsage {
    return parseGeminiUsage(stdout);
  }
}
