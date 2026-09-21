/**
 * Formats a mutation-testing run as GitHub Actions job-summary markdown:
 * score, threshold, status, and the top surviving mutants (the actionable
 * list — a survived mutant means a real behavior change no test caught).
 *
 * Pure formatter — no filesystem or network access — so it is unit
 * testable without a real Stryker report.
 *
 * @param {object} params
 * @param {ReturnType<typeof import("./collect-mutation-score.mjs").collectMutationScore>} params.scoreResult
 * @param {Array<{file: string, line: number, mutator: string}>} [params.survivedMutants]
 * @param {string} [params.runUrl] - link to the Actions run, for the report artifact link
 * @returns {string} Markdown for $GITHUB_STEP_SUMMARY
 */
export function formatMutationSummary({ scoreResult, survivedMutants = [], runUrl }) {
  const lines = ["## Mutation Testing Results", ""];

  if (scoreResult?.state === "harness-broken") {
    // Deliberately prints no percentage and no surviving-mutant list. Both
    // exist in the underlying report and both are lies here: the mutants
    // "survived" only because no test was executed against them (#5614).
    lines.push("**Status:** ❌ Harness ran no tests — this is not a mutation score");
    lines.push("");
    lines.push(
      "Every gradeable mutant reported `testsCompleted: 0`, so nothing could be killed.",
      "The mutation harness is broken; the test suite has not been measured.",
      "Do NOT add tests for the mutants in this report — fix the runner first."
    );
  } else if (!scoreResult?.available) {
    lines.push("**Status:** ❌ No report produced");
  } else {
    const status = scoreResult.passes_threshold ? "✅ PASS" : "⚠️ BELOW TARGET";
    lines.push(`**Mutation Score:** ${scoreResult.mutation_score}%`);
    lines.push(`**Target:** > ${scoreResult.threshold}%`);
    lines.push(`**Status:** ${status}`);
    lines.push(`**Mutants killed:** ${scoreResult.killed}/${scoreResult.total_mutants}`);

    if (survivedMutants.length > 0) {
      lines.push("", "### Top Surviving Mutants", "");
      for (const mutant of survivedMutants) {
        lines.push(`- \`${mutant.file}:${mutant.line}\` — ${mutant.mutator}`);
      }
    }
  }

  if (runUrl) {
    lines.push("", `Full report available in [Artifacts](${runUrl})`);
  }

  return lines.join("\n") + "\n";
}
