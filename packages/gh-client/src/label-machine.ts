/** Canonical coordination labels used by the ship-loop state machine. */
export const COORDINATION_LABELS = {
  READY: "ready",
  IN_PROGRESS: "in-progress",
  HAS_PR: "has-pr",
  AGENT_FAILED: "agent-failed",
  AGENT_SKIP: "agent-skip",
} as const;

export type CoordinationLabel = (typeof COORDINATION_LABELS)[keyof typeof COORDINATION_LABELS];

/** Represents a label transition: labels to add and labels to remove. */
export interface LabelTransition {
  issueNumber: number;
  add: string[];
  remove: string[];
}

/** ready → in-progress */
export function markInProgress(issueNumber: number): LabelTransition {
  return {
    issueNumber,
    add: [COORDINATION_LABELS.IN_PROGRESS],
    remove: [COORDINATION_LABELS.READY],
  };
}

/** in-progress → has-pr */
export function markHasPr(issueNumber: number): LabelTransition {
  return {
    issueNumber,
    add: [COORDINATION_LABELS.HAS_PR],
    remove: [COORDINATION_LABELS.IN_PROGRESS, COORDINATION_LABELS.READY],
  };
}

/** in-progress → agent-failed */
export function markFailed(issueNumber: number): LabelTransition {
  return {
    issueNumber,
    add: [COORDINATION_LABELS.AGENT_FAILED],
    remove: [COORDINATION_LABELS.IN_PROGRESS, COORDINATION_LABELS.READY],
  };
}

/** agent-failed → agent-skip (exhausted retries) */
export function markSkip(issueNumber: number): LabelTransition {
  return {
    issueNumber,
    add: [COORDINATION_LABELS.AGENT_SKIP],
    remove: [
      COORDINATION_LABELS.IN_PROGRESS,
      COORDINATION_LABELS.READY,
      COORDINATION_LABELS.AGENT_FAILED,
    ],
  };
}

/** has-pr/agent-failed → ready (re-queue) */
export function markReady(issueNumber: number): LabelTransition {
  return {
    issueNumber,
    add: [COORDINATION_LABELS.READY],
    remove: [
      COORDINATION_LABELS.HAS_PR,
      COORDINATION_LABELS.IN_PROGRESS,
      COORDINATION_LABELS.AGENT_FAILED,
    ],
  };
}
