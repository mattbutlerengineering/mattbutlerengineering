/**
 * Pure collector for per-category PR acceptance metrics.
 *
 * Extracted as a pure function so it can be unit-tested against fixture data
 * without live gh/git calls. The caller (sensor-report.mjs) is responsible
 * for fetching PR data from the GitHub API and passing it as an array.
 *
 * Each PR is classified by its first non-coordination label (i.e. labels
 * other than `has-pr`, `in-progress`, `ready`). PRs with no category label
 * fall into the `unlabeled` bucket.
 *
 * Signal-validation note: this metric only becomes informative when
 * closed-without-merge PRs exist. If all AI PRs are fix-forwarded rather
 * than rejected outright, the per-category breakdown is vacuous (100%
 * everywhere). When no rejections are detected the output includes a
 * `signal_note` field flagging the limitation.
 *
 * Input shape:
 *   Array<{
 *     number: number,
 *     state: string,           // "MERGED" | "CLOSED" | "OPEN"
 *     headRefName: string,
 *     mergedAt: string | null, // ISO timestamp or null
 *     closedAt: string | null,
 *     labels: Array<{ name: string }>
 *   }>
 */

/** Coordination labels that are NOT domain categories. */
const COORDINATION_LABELS = new Set([
  "has-pr",
  "in-progress",
  "ready",
  "agent-failed",
  "agent-skip",
]);

/**
 * Pick the first domain category label from a PR's label list.
 * Falls back to "unlabeled" when none is found.
 *
 * @param {Array<{ name: string }>} labels
 * @returns {string}
 */
function categoryOf(labels) {
  const domainLabel = (labels ?? []).find((l) => !COORDINATION_LABELS.has(l.name));
  return domainLabel ? domainLabel.name : "unlabeled";
}

/**
 * Compute per-category merged-vs-closed breakdown from an array of PR objects.
 *
 * @param {Array<{
 *   number: number,
 *   state: string,
 *   headRefName: string,
 *   mergedAt: string | null,
 *   closedAt: string | null,
 *   labels: Array<{ name: string }>
 * }>} prs
 * @returns {{
 *   available: boolean,
 *   total_prs?: number,
 *   total_merged?: number,
 *   total_closed_without_merge?: number,
 *   by_category?: Record<string, { merged: number, closed_without_merge: number, acceptance_rate: number }>,
 *   signal_note?: string,
 * }}
 */
export function computePrCategoryMetrics(prs) {
  if (!prs || prs.length === 0) {
    return { available: false };
  }

  /** @type {Record<string, { merged: number, closed_without_merge: number }>} */
  const buckets = {};

  for (const pr of prs) {
    const isMerged = pr.mergedAt !== null && pr.mergedAt !== undefined;
    const isClosedWithoutMerge =
      pr.state === "CLOSED" && (pr.mergedAt === null || pr.mergedAt === undefined);

    // Only count decided PRs (merged or closed-without-merge); skip open.
    if (!isMerged && !isClosedWithoutMerge) continue;

    const category = categoryOf(pr.labels);
    if (!buckets[category]) {
      buckets[category] = { merged: 0, closed_without_merge: 0 };
    }

    if (isMerged) {
      buckets[category] = { ...buckets[category], merged: buckets[category].merged + 1 };
    } else {
      buckets[category] = {
        ...buckets[category],
        closed_without_merge: buckets[category].closed_without_merge + 1,
      };
    }
  }

  // Compute acceptance_rate per category (immutably).
  /** @type {Record<string, { merged: number, closed_without_merge: number, acceptance_rate: number }>} */
  const byCategory = Object.fromEntries(
    Object.entries(buckets).map(([cat, counts]) => {
      const total = counts.merged + counts.closed_without_merge;
      const acceptanceRate = total > 0 ? Math.round((counts.merged / total) * 100) / 100 : null;
      return [cat, { ...counts, acceptance_rate: acceptanceRate }];
    })
  );

  const totalMerged = Object.values(buckets).reduce((sum, c) => sum + c.merged, 0);
  const totalClosed = Object.values(buckets).reduce((sum, c) => sum + c.closed_without_merge, 0);
  const totalPrs = totalMerged + totalClosed;

  const result = {
    available: true,
    total_prs: totalPrs,
    total_merged: totalMerged,
    total_closed_without_merge: totalClosed,
    by_category: byCategory,
  };

  // Signal-validation: if no PRs were closed without merging, the per-category
  // split is uninformative — bad PRs are fix-forwarded (amended + force-pushed)
  // rather than rejected. Flag this in-output so consumers don't mistake a
  // vanity 100% for a real signal.
  if (totalClosed === 0) {
    return {
      ...result,
      signal_note:
        "Per-category acceptance split is currently uninformative: 0 PRs were closed-without-merge. " +
        "Bad PRs appear to be fix-forwarded (pushed-over) rather than rejected outright. " +
        "The metric will become meaningful once closed-without-merge events are observed.",
    };
  }

  return result;
}
