/**
 * Builds the tracking issue the mutation-testing workflow files when a
 * scheduled run fails — title, body, dedupe key, and the recurrence comment —
 * from the run's classified state rather than from a score alone.
 *
 * This exists because the workflow used to build that text with an inline
 * `printf` block that interpolated a single `${MUTATION_SCORE}` for every
 * failure mode. When the harness broke, `formatMutationOutputs()` handed it a
 * placeholder `0` and it filed:
 *
 *     Mutation testing below target
 *     **Score:** 0%
 *     3. Add tests to kill surviving mutants
 *
 * — for a run in which zero tests had executed (#5614). Every word of that is
 * wrong, and it is wrong in the expensive direction: it reads as a real,
 * catastrophic quality finding and directs the reader to write tests for
 * mutants their suite already kills. The dedupe key made it worse, folding a
 * broken harness into the same issue a genuine low score would open, so the
 * two can never be told apart in the issue list.
 *
 * Pure — no filesystem, no network, no `gh` — so the text is unit testable.
 * `print-mutation-issue.mjs` is the thin CLI the workflow calls.
 */

/** Per-state issue identity. `scored` keeps the original title and key. */
const ISSUE_BY_STATE = {
  scored: {
    title: "Mutation testing below target",
    dedupeKey: "mutation-testing-below-target",
  },
  "harness-broken": {
    title: "Mutation testing harness ran no tests",
    dedupeKey: "mutation-testing-harness-broken",
  },
  "report-missing": {
    title: "Mutation testing produced no report",
    dedupeKey: "mutation-testing-no-report",
  },
  "report-empty": {
    title: "Mutation testing produced no report",
    dedupeKey: "mutation-testing-no-report",
  },
};

function scoredBody({ score, threshold, today, runUrl }) {
  return [
    "The scheduled mutation-testing workflow ran on " + today + " and the score",
    `is below the ${threshold}% target.`,
    "",
    `**Score:** ${score}%`,
    `**Run:** ${runUrl} (see the job summary for the top surviving mutants)`,
    "",
    "### Next steps",
    "1. Open the run's job summary and the mutation-report artifact",
    "2. Identify weakly-tested files from the mutation report",
    "3. Add tests to kill surviving mutants",
  ];
}

function harnessBrokenBody({ today, runUrl }) {
  return [
    `The scheduled mutation-testing run on ${today} produced a report in which`,
    "every gradeable mutant reported `testsCompleted: 0` — the runner executed",
    "no tests against any mutant, so nothing could be killed.",
    "",
    "**This is not a mutation score. The test suite was not measured.**",
    "",
    `**Run:** ${runUrl}`,
    "",
    "### Next steps",
    "1. Check whether the Stryker test-runner plugin still supports the",
    "   installed test-framework version (a major bump is the usual cause)",
    "2. Reproduce with a single file:",
    "   `pnpm exec stryker run --mutate <one-source-file> --reporters json`",
    "3. Confirm the fix by checking `testsCompleted` is non-zero in",
    "   `reports/mutation/mutation.json`",
    "",
    "Do NOT add tests for the mutants listed in this run's report — they are",
    "reported as surviving only because no test was run against them.",
  ];
}

function noReportBody({ today, runUrl }) {
  return [
    `The scheduled mutation-testing run on ${today} did not produce a usable`,
    "report — it is missing, unparseable, or contains no gradeable mutants.",
    "",
    "**No score was computed.**",
    "",
    `**Run:** ${runUrl}`,
    "",
    "### Next steps",
    "1. Check the run log for a Stryker crash before the reporter step",
    "2. Confirm `reports/mutation/mutation.json` was uploaded as an artifact",
  ];
}

const DEDUPE_FOOTER = [
  "",
  "This issue is de-duplicated by title — future failing scheduled",
  "runs will comment here instead of filing a new issue.",
];

/**
 * @param {object} params
 * @param {import("./classify-mutation-run.mjs").MutationRunState} params.state
 * @param {number|"n/a"} params.score - Score, or "n/a" when nothing was measured.
 * @param {number} params.threshold
 * @param {string} params.runUrl
 * @param {string} params.today - ISO date (YYYY-MM-DD).
 * @returns {{title: string, dedupeKey: string, body: string, comment: string}}
 */
export function formatMutationIssue({ state, score, threshold, runUrl, today }) {
  const identity = ISSUE_BY_STATE[state] ?? ISSUE_BY_STATE["report-missing"];

  let bodyLines;
  let comment;
  if (state === "scored") {
    bodyLines = scoredBody({ score, threshold, today, runUrl });
    comment = `Still below target as of ${today}: score ${score}% (threshold ${threshold}%). Run: ${runUrl}`;
  } else if (state === "harness-broken") {
    bodyLines = harnessBrokenBody({ today, runUrl });
    comment = `Harness still ran no tests as of ${today} — no score was measured. Run: ${runUrl}`;
  } else {
    bodyLines = noReportBody({ today, runUrl });
    comment = `Still no usable report as of ${today} — no score was measured. Run: ${runUrl}`;
  }

  return {
    title: identity.title,
    dedupeKey: identity.dedupeKey,
    body: [`## ${identity.title}`, "", ...bodyLines, ...DEDUPE_FOOTER].join("\n") + "\n",
    comment,
  };
}
