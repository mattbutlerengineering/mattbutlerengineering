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
 * This file imports nothing from the workspace, so the confirm-red job needs
 * a checkout and Node only: no install and no build.
 */
import { fileURLToPath } from "node:url";

/** How many reruns a red run gets before it counts as a real failure. */
export const MAX_CONFIRMATION_RERUNS = 1;

/**
 * Pure: decides whether a failed run should be rerun or acted on.
 *
 * An attempt that is not a positive integer means the caller could not tell
 * which attempt failed. That proceeds, because a missed real break costs more
 * than one unconfirmed alarm.
 *
 * @param {{runAttempt: number|string|null|undefined}} args
 * @returns {{action: "rerun"|"proceed", reason: string}}
 */
export function decideRedConfirmation({ runAttempt }) {
  const isBlank = runAttempt === null || runAttempt === undefined || runAttempt === "";
  const attempt = isBlank ? NaN : Number(runAttempt);

  if (!Number.isInteger(attempt) || attempt < 1) {
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

function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--run-attempt");
  const runAttempt = flagIndex === -1 ? undefined : args[flagIndex + 1];
  process.stdout.write(`${JSON.stringify(decideRedConfirmation({ runAttempt }))}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
