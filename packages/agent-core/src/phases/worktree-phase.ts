import { trace } from "@opentelemetry/api";
import { withRetry } from "../retry.js";
import { emitEvent } from "../utils.js";
import { classifyTask } from "../task-signal-registry.js";
import type {
  Phase,
  PhaseDeps,
  PhaseExecution,
  WorktreePhaseInput,
  WorktreePhaseOutput,
} from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export class WorktreePhase implements Phase<WorktreePhaseInput, WorktreePhaseOutput> {
  readonly name = "worktree" as const;

  async run(
    input: WorktreePhaseInput,
    deps: PhaseDeps
  ): Promise<PhaseExecution<WorktreePhaseOutput>> {
    const { config, onEvent } = input;
    const { worktreeManager, promptBuilder, failureMemory } = deps;

    // Classify the task once so downstream consumers reuse the result instead
    // of re-scanning the description.
    const taskSignals = classifyTask(config.taskDescription);

    emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

    const wtSpan = tracer.startSpan("agent_core.create_worktree");
    try {
      // 1. Create isolated worktree (with retry for transient git failures)
      const { value: worktree } = await withRetry(
        () =>
          worktreeManager.createWorktree(
            config.repoPath,
            config.baseBranch,
            config.taskDescription
          ),
        { maxRetries: 2 }
      );
      wtSpan.setAttribute("worktree.branch", worktree.branchName);
      wtSpan.setAttribute("worktree.mode", worktree.mode);
      wtSpan.end();

      // 2. Build system prompt with failure context, source files, and PR examples
      const memory = await failureMemory.loadMemory(config.repoPath);
      const pastFailures = failureMemory.queryPastFailures(memory, config.taskDescription);
      const failureContext = failureMemory.buildFailureContext(pastFailures);

      // Auto-resolve source files from task description if none provided
      const resolvedSourcePaths =
        config.sourceFiles ??
        (async () => {
          const { resolveSourceFiles } = await import("../source-resolver.js");
          return resolveSourceFiles(config.taskDescription);
        })();
      const finalSourcePaths = await resolvedSourcePaths;

      const sourceFileEntries =
        finalSourcePaths.length > 0
          ? await promptBuilder.loadSourceFiles(finalSourcePaths)
          : undefined;

      // Fetch recent successful PRs as examples (non-blocking)
      const { fetchRecentPrExamples, formatPrExamples } = await import("../budget-calculator.js");
      const prExamples = await fetchRecentPrExamples(config.repoPath).catch(() => []);
      const prExamplesSection = formatPrExamples(prExamples);

      // Load project CLAUDE.md for coding conventions (non-blocking)
      const projectContext = await promptBuilder
        .loadProjectContext(worktree.path)
        .catch(() => null);
      const projectSection = projectContext
        ? `\n\n## Project Conventions (from CLAUDE.md)\n\n${projectContext}`
        : "";

      const systemPrompt =
        (await promptBuilder.buildSystemPrompt(config.taskDescription, {
          sourceFileEntries,
          prExamplesSection,
          failureContext,
        })) + projectSection;

      emitEvent(onEvent, "session:start", {
        message: `Starting agent on branch ${worktree.branchName}`,
      });

      return {
        result: { phase: this.name, status: "success", errors: [] },
        output: { worktree, systemPrompt, taskSignals },
      };
    } catch (error) {
      wtSpan.end();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        result: { phase: this.name, status: "failed", errors: [errorMessage] },
        output: null,
      };
    }
  }
}
