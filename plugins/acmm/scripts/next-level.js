/**
 * Pure helpers shared by the console summary (audit.js) and the markdown
 * report (outputs/report.js) for next-level gaps vs unverifiable criteria.
 */

/**
 * Split the next-level gap list into criteria whose absence is confirmed and
 * criteria whose status this run could not establish.
 *
 * An `active`-type criterion whose workflow file is present but whose
 * `gh run list` call could not run is `unverifiable` (#2023): unknown, not
 * confirmed false. `--apply` has excluded those from the issues it files since
 * #3719; this is the same filter, so the console list and `--apply` cannot
 * drift apart.
 *
 * @param {Array<{ id: string, name: string }>} missingForNextLevel
 * @param {Set<string>} unverifiableIds
 * @returns {{ confirmed: Array<{ id: string, name: string }>, unverifiable: Array<{ id: string, name: string }> }}
 */
export function partitionMissingForNext(missingForNextLevel, unverifiableIds) {
  const confirmed = [];
  const unverifiable = [];
  for (const c of missingForNextLevel) {
    (unverifiableIds.has(c.id) ? unverifiable : confirmed).push(c);
  }
  return { confirmed, unverifiable };
}

/**
 * The detected-count delta for the "Since last run" line, attributed when a
 * drop coincides with criteria this run could not verify.
 *
 * `countDelta` is a true statement about `detected` counts, but on its own a
 * `-8` alongside "no criteria changed" reads as a regression when the cause is
 * that gh was unavailable here. The clause names that cause rather than
 * changing the number.
 *
 * @param {number} countDelta
 * @param {number} unverifiableCount
 * @returns {string}
 */
export function formatSinceLastRunCount(countDelta, unverifiableCount) {
  if (countDelta > 0) return `+${countDelta}`;
  if (countDelta === 0) return "\u00b10";
  const suffix =
    unverifiableCount > 0
      ? `, ${unverifiableCount} unverifiable this run \u2014 status unknown, not a confirmed regression`
      : "";
  return `${countDelta}${suffix}`;
}
