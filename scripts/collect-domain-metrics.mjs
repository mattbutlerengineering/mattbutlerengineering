#!/usr/bin/env node

/**
 * Booking-funnel telemetry collector (part 2/5, issue #3666).
 *
 * Calls #3665's counts-only aggregation route
 * (`GET /api/v1/reservations/metrics/daily`) and appends the result to the
 * domain-metrics metric via metrics-store.mjs, so it survives ephemeral
 * cloud checkouts the same way every other tracked metric does.
 *
 * Cloud egress to production services may be blocked (the same constraint
 * noted for the sentry sensor) — a network error or non-2xx response must
 * degrade gracefully, never throw. main() always exits 0.
 *
 * Usage:
 *   DOMAIN_METRICS_VENUE_ID=<venue-id> node scripts/collect-domain-metrics.mjs
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { append } from "./metrics-store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_BASE_URL = "https://api.mattbutlerengineering.com";

/**
 * Validate #3665's response envelope at the trust boundary and extract the
 * counts-only fields. Never trust the shape of an external HTTP response.
 *
 * @param {unknown} payload - Parsed JSON body from the daily-counts route.
 * @returns {{ date: string, venueId: string, reservations: object, deposits: object }}
 */
export function parseDailyMetricsPayload(payload) {
  const data = typeof payload === "object" && payload !== null ? payload.data : undefined;
  if (typeof data !== "object" || data === null) {
    throw new Error(`daily-metrics response missing "data": ${JSON.stringify(payload)}`);
  }
  const { date, venueId, reservations, deposits } = data;
  if (typeof date !== "string" || typeof venueId !== "string") {
    throw new Error(`daily-metrics response has invalid date/venueId: ${JSON.stringify(data)}`);
  }
  if (typeof reservations !== "object" || reservations === null) {
    throw new Error(`daily-metrics response missing reservations counts: ${JSON.stringify(data)}`);
  }
  if (typeof deposits !== "object" || deposits === null) {
    throw new Error(`daily-metrics response missing deposits counts: ${JSON.stringify(data)}`);
  }
  return { date, venueId, reservations, deposits };
}

/**
 * Fetch a day's booking-funnel counts. Never throws — network errors,
 * non-2xx responses, and malformed bodies all degrade to `{ ok: false }`.
 *
 * @param {object} params
 * @param {typeof fetch} params.fetchImpl - Injected in tests.
 * @param {string} [params.baseUrl]
 * @param {string} params.venueId
 * @param {string} [params.token] - Bearer token, if available.
 * @param {string} [params.date] - YYYY-MM-DD; omitted defaults to today server-side.
 * @returns {Promise<{ ok: true, data: object } | { ok: false, reason: string }>}
 */
export async function fetchDailyDomainMetrics({
  fetchImpl,
  baseUrl = DEFAULT_BASE_URL,
  venueId,
  token,
  date,
}) {
  try {
    const url = new URL(`${baseUrl}/api/v1/reservations/metrics/daily`);
    url.searchParams.set("venueId", venueId);
    if (date) url.searchParams.set("date", date);

    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await fetchImpl(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status} ${response.statusText}` };
    }
    return { ok: true, data: parseDailyMetricsPayload(await response.json()) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Thin CLI wrapper. Always resolves without throwing: a missing venue id, an
 * unreachable API, or a non-2xx response all degrade to a skipped run.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {object} [deps] - Dependency overrides for tests.
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {string} [deps.root]
 * @param {() => Date} [deps.now]
 * @returns {Promise<void>}
 */
export async function main(env, { fetchImpl = fetch, root = ROOT, now = () => new Date() } = {}) {
  const venueId = env.DOMAIN_METRICS_VENUE_ID;
  if (!venueId) {
    process.stdout.write("collect-domain-metrics: no DOMAIN_METRICS_VENUE_ID — skipping\n");
    return;
  }

  const result = await fetchDailyDomainMetrics({
    fetchImpl,
    baseUrl: env.DOMAIN_METRICS_API_BASE_URL || DEFAULT_BASE_URL,
    venueId,
    token: env.DOMAIN_METRICS_TOKEN,
  });

  if (!result.ok) {
    process.stdout.write(`collect-domain-metrics: unavailable (${result.reason}) — skipping\n`);
    return;
  }

  const entry = { collected_at: now().toISOString(), ...result.data };
  const filePath = append("domain-metrics", entry, { root });
  process.stdout.write(`collect-domain-metrics: appended row to ${filePath}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
