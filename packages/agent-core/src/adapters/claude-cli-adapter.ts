/**
 * ClaudeCliAdapter — spawns the `claude` CLI as a subprocess in an isolated
 * worktree, authenticating against a Claude subscription instead of
 * `ANTHROPIC_API_KEY` (#3585, Option A).
 *
 * Distinct from `ClaudeAdapter` (`name: "claude"`), which drives the Claude
 * Agent SDK directly and requires `ANTHROPIC_API_KEY`. This adapter is
 * explicitly selectable only (`--adapter claude-cli`) — it is NOT part of
 * the `auto` failover cascade (ADR-017: claude → gemini → opencode), so
 * enabling it never changes what `auto` resolves to in an environment that
 * already works. See adapter-resolution.ts for the cascade definition.
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";
import { parseClaudeCliUsage, extractClaudeCliError, type CliUsage } from "./cli-usage-parser.js";

export class ClaudeCliAdapter extends CliAdapterBase {
  readonly name = "claude-cli";
  readonly cliBinary = "claude";
  protected override get displayName(): string {
    return "Claude";
  }

  /**
   * Headless invocation: `-p <task> --output-format json`, plus
   * `--permission-mode bypassPermissions` so the CLI never blocks on an
   * interactive tool-permission prompt (mirrors Gemini's `--yolo` — the
   * worktree is already the isolation boundary, per ADR-005). `--model`
   * and `--max-turns` are forwarded only when the caller sets them.
   */
  protected buildArgs(config: AdapterConfig): string[] {
    const args = [
      "-p",
      config.taskDescription,
      "--output-format",
      "json",
      "--permission-mode",
      "bypassPermissions",
    ];
    if (config.model) {
      args.push("--model", config.model);
    }
    if (config.maxTurns) {
      args.push("--max-turns", String(config.maxTurns));
    }
    return args;
  }

  /**
   * Parses real cost/tokenUsage/numTurns from the `--output-format json`
   * result object requested by buildArgs (#3585).
   */
  protected override parseUsage(stdout: string): CliUsage {
    return parseClaudeCliUsage(stdout);
  }

  /**
   * Recovers Claude CLI's `is_error`/`result`/`subtype` failure message from
   * the same JSON stdout blob, falling back to raw stderr in
   * CliAdapterBase.run() when stdout isn't JSON (ADR-017 failure-PR-body
   * contract, mirrors gemini-adapter.ts / opencode-adapter.ts).
   */
  protected override parseErrorFromStdout(stdout: string): string | undefined {
    return extractClaudeCliError(stdout);
  }
}
