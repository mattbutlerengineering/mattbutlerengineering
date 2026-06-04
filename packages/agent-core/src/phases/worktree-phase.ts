import { trace } from "@opentelemetry/api";
import { createWorktree } from "../worktree-manager.js";
import { buildSystemPrompt, loadSourceFiles, loadProjectContext } from "../prompt-builder.js";
import { loadMemory, queryPastFailures, buildFailureContext } from "../failure-memory.js";
import { withRetry } from "../retry.js";
import { emitEvent } from "../utils.js";
import { classifyTask } from "../task-signal-registry.js";
import type { PipelineContext, PipelinePhase, PhaseResult } from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export class WorktreePhase implements PipelinePhase {
  readonly name = "worktree" as const;

  async run(ctx: PipelineContext): Promise<{ result: PhaseResult; ctx: PipelineContext }> {
    const { config, onEvent } = ctx;

    // Classify the task once so downstream consumers reuse the result instead
    // of re-scanning the description.
    const taskSignals = classifyTask(config.taskDescription);

    emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

    const wtSpan = tracer.startSpan("agent_core.create_worktree");
    try {
      // 1. Create isolated worktree (with retry for transient git failures)
      const { value: worktree } = await withRetry(
        () => createWorktree(config.repoPath, config.baseBranch, config.taskDescription),
        { maxRetries: 2 }
      );
      wtSpan.setAttribute("worktree.branch", worktree.branchName);
      wtSpan.setAttribute("worktree.mode", worktree.mode);
      wtSpan.end();

      // 2. Build system prompt with failure context, source files, and PR examples
      const failureMemory = await loadMemory(config.repoPath);
      const pastFailures = queryPastFailures(failureMemory, config.taskDescription);
      const failureContext = buildFailureContext(pastFailures);

      // Auto-resolve source files from task description if none provided
      const resolvedSourcePaths =
        config.sourceFiles ??
        (async () => {
          const { resolveSourceFiles } = await import("../source-resolver.js");
          return resolveSourceFiles(config.taskDescription);
        })();

      const finalSourcePaths = await resolvedSourcePaths;

      const sourceFileEntries =
        finalSourcePaths.length > 0 ? await loadSourceFiles(finalSourcePaths) : undefined;

      // Fetch recent successful PRs as examples (non-blocking)
      const { fetchRecentPrExamples, formatPrExamples } = await import("../budget-calculator.js");
      const prExamples = await fetchRecentPrExamples(config.repoPath).catch(() => []);
      const prExamplesSection = formatPrExamples(prExamples);

      // Load project CLAUDE.md for coding conventions (non-blocking)
      const projectContext = await loadProjectContext(worktree.path).catch(() => null);
      const projectSection = projectContext
        ? `\n\n## Project Conventions (from CLAUDE.md)\n\n${projectContext}`
        : "";

      const systemPrompt =
        (await buildSystemPrompt(config.taskDescription, {
          sourceFileEntries,
          prExamplesSection,
          failureContext,
        })) + projectSection;

      emitEvent(onEvent, "session:start", {
        message: `Starting agent on branch ${worktree.branchName}`,
      });

      return {
        result: { phase: this.name, status: "success", errors: [] },
        ctx: { ...ctx, worktree, systemPrompt, taskSignals },
      };
    } catch (error) {
      wtSpan.end();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        result: { phase: this.name, status: "failed", errors: [errorMessage] },
        ctx: { ...ctx, errors: [...ctx.errors, errorMessage] },
      };
    }
  }
}
