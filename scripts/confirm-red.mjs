#!/usr/bin/env node
/**
 * Confirms that a red CI run on main reproduces before revert-watchdog.yml
 * blames a commit for it.
 *
 * The watchdog used to act on the first failed run. A flaky test or a runner
 * outage then filed a `priority:critical` broken-main issue and proposed a
 * revert of an innocent PR (#8678: runner DNS outage; #8729: flaky test,
 * #8723). A first-attempt failure now gets one rerun of its failed jobs. The
 * rerun completes as attempt 2 and fires `workflow_run` again: a pass ends
 * the matter, a second failure goes on to the baseline check.
 *
 * A rerun on main can also be cancelled before it finishes: it queues behind
 * the in-progress main run and the next push cancels it (CI run 43135240654:
 * attempt 1 failed, attempt 2 was cancelled 51 s after it queued). Nothing
 * else will ever report that run, so a cancelled rerun of a failed attempt
 * counts as confirmed red.
 *
 * This file imports nothing from the workspace, so the confirm-red job needs
 * a checkout and Node only: no install and no build.
 */
import { fileURLToPath } from "node:url";

/** How many reruns a red run gets before it counts as a real failure. */
export const MAX_CONFIRMATION_RERUNS = 1;

/** `"null"` is what `gh api --jq .conclusion` prints for a JSON null. */
const isBlank = (value) =>
  value === null || value === undefined || value === "" || value === "null";

/**
 * The completed-run conclusions GitHub reports. Anything else read for the
 * earlier attempt counts as unreadable: on an HTTP error `gh api` prints the
 * JSON error body on stdout and skips `--jq`, so a 403, 404 or 5xx arrives
 * here as `{"message":...}`, not as a blank.
 */
const KNOWN_CONCLUSIONS = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "neutral",
  "action_required",
]);

/** The attempt as a positive integer, or NaN when the caller could not tell. */
function parseAttempt(runAttempt) {
  const attempt = isBlank(runAttempt) ? NaN : Number(runAttempt);
  return Number.isInteger(attempt) && attempt >= 1 ? attempt : NaN;
}

/** Pure: a failed run is rerun once, then acted on. */
function decideFailed(runAttempt) {
  const attempt = parseAttempt(runAttempt);

  if (Number.isNaN(attempt)) {
    return {
      action: "proceed",
      reason: `run attempt '${runAttempt}' is not a positive integer; acting on the failure unconfirmed`,
    };
  }

  if (attempt <= MAX_CONFIRMATION_RERUNS) {
    return {
      action: "rerun",
      reason: `attempt ${attempt} failed; rerunning the failed jobs once to rule out a flake or a runner outage`,
    };
  }

  return {
    action: "proceed",
    reason: `attempt ${attempt} failed again after a rerun; the failure reproduces`,
  };
}

/**
 * Pure: a cancelled run counts only when it is a rerun of an attempt that
 * failed. A cancelled first attempt is a superseded run, which the watchdog
 * has never acted on, and so is a cancelled rerun of one.
 */
function decideCancelled(runAttempt, previousConclusion) {
  const attempt = parseAttempt(runAttempt);

  if (Number.isNaN(attempt) || attempt === 1) {
    return {
      action: "ignore",
      reason: `attempt '${runAttempt}' was cancelled and is not known to be a rerun; a cancelled run is not a failure`,
    };
  }

  if (!KNOWN_CONCLUSIONS.has(previousConclusion)) {
    return {
      action: "proceed",
      reason: `attempt ${attempt} was cancelled and attempt ${attempt - 1} could not be read; treating the run as a confirmed failure`,
    };
  }

  if (previousConclusion === "failure") {
    return {
      action: "proceed",
      reason: `attempt ${attempt - 1} failed and its rerun (attempt ${attempt}) was cancelled before it finished; nothing else will report this run`,
    };
  }

  return {
    action: "ignore",
    reason: `attempt ${attempt} was cancelled and attempt ${attempt - 1} was '${previousConclusion}', not a failure`,
  };
}

/**
 * Pure: decides whether a completed run should be rerun, acted on or ignored.
 *
 * Anything the caller could not determine (a missing conclusion, an attempt
 * that is not a positive integer, an unreadable earlier attempt) proceeds,
 * because a missed real break costs more than one unconfirmed alarm. The one
 * exception is a cancelled run with an unknown attempt: see decideCancelled.
 *
 * @param {{
 *   conclusion: string|null|undefined,
 *   runAttempt: number|string|null|undefined,
 *   previousConclusion?: string|null,
 * }} args `previousConclusion` is the conclusion of attempt `runAttempt - 1`;
 *   it is read only for a cancelled run.
 * @returns {{action: "rerun"|"proceed"|"ignore", reason: string}}
 */
export function decideRedConfirmation({ conclusion, runAttempt, previousConclusion }) {
  if (isBlank(conclusion)) {
    return {
      action: "proceed",
      reason: "the run's conclusion is unknown; acting on it as a failure unconfirmed",
    };
  }

  if (conclusion === "failure") return decideFailed(runAttempt);
  if (conclusion === "cancelled") return decideCancelled(runAttempt, previousConclusion);

  return {
    action: "ignore",
    reason: `conclusion '${conclusion}' is not a failure; nothing to confirm`,
  };
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Prints the decision as one JSON line for the workflow to parse with `jq`. */
export function main(args = process.argv.slice(2), stdout = process.stdout) {
  const decision = decideRedConfirmation({
    conclusion: readFlag(args, "--conclusion"),
    runAttempt: readFlag(args, "--run-attempt"),
    previousConclusion: readFlag(args, "--previous-conclusion"),
  });
  stdout.write(`${JSON.stringify(decision)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
