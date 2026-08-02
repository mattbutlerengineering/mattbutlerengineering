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

  if (!scoreResult?.available) {
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
