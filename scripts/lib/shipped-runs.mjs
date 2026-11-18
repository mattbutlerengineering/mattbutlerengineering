/**
 * Shipped pipeline-run detection, shared by `audit-markdown.mjs` and
 * `check-prettier.mjs` (#9078).
 *
 * `docs/features/<slug>/` and `docs/fixes/<slug>/` hold ~75% of the repo's
 * markdown lines, and a run's artifacts are a frozen record. A run is shipped
 * once the operate stage wrote its `retro.md` (the stage that completes a
 * run); a run without one is live and stays checked.
 */

const RUN_DIR = /^(docs\/(?:features|fixes)\/[^/]+)\//;
const RUN_MARKER = /^(docs\/(?:features|fixes)\/[^/]+)\/retro\.md$/;

/**
 * @param {string[]} files - repo-relative posix paths
 * @returns {string[]} run directories (no trailing slash) that have a retro.md
 */
export function shippedRunDirs(files) {
  return files.flatMap((file) => {
    const marker = file.match(RUN_MARKER);
    return marker ? [marker[1]] : [];
  });
}

/**
 * @param {string[]} files - repo-relative posix paths
 * @returns {string[]}
 */
export function excludeShippedRuns(files) {
  const shipped = new Set(shippedRunDirs(files));
  return files.filter((file) => {
    const run = file.match(RUN_DIR);
    return !(run && shipped.has(run[1]));
  });
}
