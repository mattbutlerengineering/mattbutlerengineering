/**
 * Summary rows for the two sensors whose raw inputs never reach a scheduled
 * checkout (#7581). `.audit-state/inventory.json` and
 * `reports/mutation/mutation.json` are gitignored and exist only on the runner
 * that produced them, so `lighthouse` and `mutationScore` reported
 * "unavailable" in every cloud sensor run. The workflows now reduce their
 * reports to one row and commit it to `metrics/lighthouse.jsonl` /
 * `metrics/mutation-score.jsonl`; the sensors read those files.
 *
 * Both builders return `null` when the run measured nothing, so the caller
 * writes no row and `metrics-freshness` goes red instead of a hollow row
 * looking like a measurement.
 */
import { collectMutationScore } from "./collect-mutation-score.mjs";

const LIGHTHOUSE_CATEGORIES = {
  performance: "performance",
  a11y: "accessibility",
  "best-practices": "best-practices",
  seo: "seo",
};

function routePath(raw) {
  try {
    return new URL(raw).pathname;
  } catch {
    return raw ?? "unknown";
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Array<{ finalUrl?: string, requestedUrl?: string, categories?: Record<string, { score: number|null }> }>} lhrs
 *   Parsed Lighthouse reports; several runs of one URL are averaged.
 * @param {{ date: string, commit: string }} meta
 */
export function buildLighthouseRow(lhrs, { date, commit }) {
  const byUrl = new Map();
  for (const lhr of lhrs) {
    const cats = lhr?.categories ?? {};
    if (!Object.values(LIGHTHOUSE_CATEGORIES).some((c) => typeof cats[c]?.score === "number")) {
      continue;
    }
    // Key by path: LHCI serves staticDistDir on a random port, so the origin
    // differs every run and week-over-week comparison would never match.
    const url = routePath(lhr.finalUrl ?? lhr.requestedUrl);
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(cats);
  }
  if (byUrl.size === 0) return null;

  const routes = [...byUrl].map(([url, runs]) => {
    const route = { url };
    for (const [key, cat] of Object.entries(LIGHTHOUSE_CATEGORIES)) {
      const scores = runs.map((c) => c[cat]?.score).filter((s) => typeof s === "number");
      if (scores.length > 0) {
        route[key] = round2(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }
    return route;
  });
  return { date, commit, routes };
}

/**
 * @param {object|null|undefined} reportJson Parsed Stryker mutation.json.
 * @param {{ date: string, commit: string }} meta
 */
export function buildMutationRow(reportJson, { date, commit }) {
  const overall = collectMutationScore(reportJson);
  if (!overall.available) return null;

  const tally = {};
  for (const [file, result] of Object.entries(reportJson.files)) {
    const pkg = file.split("/").slice(0, 2).join("/");
    const t = (tally[pkg] ??= { killed: 0, graded: 0 });
    for (const m of result.mutants ?? []) {
      if (m.status === "Killed") t.killed++;
      if (m.status === "Killed" || m.status === "Survived" || m.status === "Timeout") t.graded++;
    }
  }
  const packages = {};
  for (const [pkg, t] of Object.entries(tally)) {
    if (t.graded > 0) packages[pkg] = round2((t.killed / t.graded) * 100);
  }

  const { available, state, last_run, ...score } = overall;
  void available;
  void state;
  void last_run;
  return { date, commit, ...score, packages };
}
