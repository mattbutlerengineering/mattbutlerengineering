import { Command } from "commander";
import {
  createGhClient,
  markInProgress,
  markHasPr,
  markFailed,
  markSkip,
  markReady,
} from "@mbe/gh-client";
import type { GhClient, LabelTransition } from "@mbe/gh-client";

// ── Types ────────────────────────────────────────────────────────────────

type TransitionState = "ready" | "in-progress" | "has-pr" | "agent-failed" | "agent-skip";

/**
 * Maps the CLI's `--to` string onto the label-machine transition function
 * that owns the add/remove label set for that edge. Edge rules live entirely
 * in @mbe/gh-client's label-machine — this map is the only translation layer.
 */
const TRANSITIONS: Record<TransitionState, (issueNumber: number) => LabelTransition> = {
  ready: markReady,
  "in-progress": markInProgress,
  "has-pr": markHasPr,
  "agent-failed": markFailed,
  "agent-skip": markSkip,
};

export const VALID_TRANSITION_STATES = Object.keys(TRANSITIONS) as TransitionState[];

export function isValidTransitionState(value: string): value is TransitionState {
  return (VALID_TRANSITION_STATES as string[]).includes(value);
}

/** Applies the label-machine transition for `toState` on `issueNumber`. */
export function transitionIssue(
  issueNumber: number,
  toState: TransitionState,
  client: GhClient
): void {
  client.label.apply(TRANSITIONS[toState](issueNumber));
}

// ── Command ──────────────────────────────────────────────────────────────

export const issueCommand = new Command("issue").description("GitHub issue coordination commands");

issueCommand
  .command("transition <number>")
  .description(
    "Apply a label-machine state transition to a GitHub issue (wraps @mbe/gh-client's label-machine)"
  )
  .requiredOption("--to <state>", `Target state (${VALID_TRANSITION_STATES.join("|")})`)
  .action((numberArg: string, options: { to: string }) => {
    const issueNumber = Number(numberArg);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      console.error(`issue transition: invalid issue number "${numberArg}"`);
      process.exitCode = 1;
      return;
    }

    if (!isValidTransitionState(options.to)) {
      console.error(
        `issue transition: unknown state "${options.to}" (expected one of: ${VALID_TRANSITION_STATES.join(", ")})`
      );
      process.exitCode = 1;
      return;
    }

    try {
      transitionIssue(issueNumber, options.to, createGhClient());
      console.log(`issue transition: #${issueNumber} → ${options.to}`);
    } catch (err) {
      console.error(
        `issue transition: failed to update #${issueNumber}: ${(err as Error).message}`
      );
      process.exitCode = 1;
    }
  });
