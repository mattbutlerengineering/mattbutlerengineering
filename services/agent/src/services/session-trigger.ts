import type { AgentSession } from "@mbe/types";
import { sessionService } from "./session.js";
import { executeSession } from "./session-executor.js";
import { defaultConcurrency } from "./session-concurrency.js";
import { getServiceLogger } from "./logger.js";

export interface TriggerSessionOptions {
  taskDescription: string;
  baseBranch?: string;
  userId?: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  createPr?: boolean;
  parentId?: string;
  onSettled?: (success: boolean) => void | Promise<void>;
}

export interface TriggerSessionResult {
  session: AgentSession | null;
  accepted: boolean;
}

/**
 * Trigger policy for routes and webhooks: admit through the concurrency gate,
 * persist the session, then dispatch execution fire-and-forget. Lives beside
 * the executor — not in the storage module — because it embeds dispatch
 * policy, not persistence; keeping it here lets it import the executor
 * statically instead of dodging an import cycle with a dynamic import.
 */
export async function triggerSession(opts: TriggerSessionOptions): Promise<TriggerSessionResult> {
  // Early-reject through the single concurrency gate so we never create a DB
  // row for a session that can't start. The executor performs the atomic
  // acquire(); this check just avoids the wasted write on an obvious reject.
  if (!defaultConcurrency.canStart()) {
    return { session: null, accepted: false };
  }

  const wrappedTask = `<task>\n${opts.taskDescription}\n</task>`;

  const session = await sessionService.create({
    taskDescription: wrappedTask,
    baseBranch: opts.baseBranch,
    userId: opts.userId,
    model: opts.model,
    maxTurns: opts.maxTurns,
    maxBudgetUsd: opts.maxBudgetUsd,
    createPr: opts.createPr,
    parentId: opts.parentId,
  });

  executeSession(session)
    .then(() => opts.onSettled?.(true))
    .catch((err) => {
      void opts.onSettled?.(false);
      getServiceLogger().error({ sessionId: session.id, err }, "triggerSession execution failed");
    });

  return { session, accepted: true };
}
