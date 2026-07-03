/**
 * GeminiCliAdapter — spawns the Gemini CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude is rate-limited.
 * The adapter does NOT create worktrees — the router/caller handles that.
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";
import { parseGeminiUsage, extractGeminiError, type CliUsage } from "./cli-usage-parser.js";

export class GeminiCliAdapter extends CliAdapterBase {
  readonly name = "gemini";
  readonly cliBinary = "gemini";
  protected override get displayName(): string {
    return "Gemini";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["-p", config.taskDescription, "--yolo", "--output-format", "json"];
  }

  /**
   * Parses real cost/tokenUsage from the `--output-format json` blob
   * requested by buildArgs (#3019).
   */
  protected override parseUsage(stdout: string): CliUsage {
    return parseGeminiUsage(stdout);
  }

  /**
   * Recovers Gemini's structured error message from the same JSON stdout
   * blob on failure, falling back to raw stderr in CliAdapterBase.run()
   * when stdout isn't JSON (ADR-017 failure-PR-body contract, #3019).
   */
  protected override parseErrorFromStdout(stdout: string): string | undefined {
    return extractGeminiError(stdout);
  }
}
