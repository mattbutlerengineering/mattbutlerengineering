import metricsSnapshot from "../../public/metrics.json";

/**
 * The one date the site reports its measurements as taken on. It is the
 * `generatedAt` of `public/metrics.json` — the same file /metrics fetches and
 * prints as "Last updated" — so the homepage and /metrics cannot disagree.
 */
export const MEASUREMENT_DATE: string = metricsSnapshot.generatedAt;
