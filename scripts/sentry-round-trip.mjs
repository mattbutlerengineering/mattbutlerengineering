#!/usr/bin/env node

/**
 * sentry-round-trip.mjs — prove that an error raised inside a DEPLOYED service
 * actually arrives in Sentry.
 *
 * Written for the maintenance:backend-observability-blackout run. The blackout
 * was not a broken integration: the code was correct, `initSentry` was called on
 * every boot, and it returned early and silently because `SENTRY_DSN` was never
 * in the app spec. Nothing observable distinguished that from a healthy service
 * that had not errored yet. This script is the observation that does.
 *
 * The load-bearing design choice is that the error must originate INSIDE the
 * service. Posting an event straight to a DSN would prove the DSN is valid and
 * nothing else — precisely the confusion that let the blackout run for five
 * months. See `docs/fixes/backend-observability-blackout/architecture.md` for
 * why a debug endpoint was rejected and why a deliberate 429 is what is left:
 * `sentryFastifyPlugin` captures only 5xx and NOTABLE_4XX (409, 422, 429), and
 * every authenticated route answers 401 — which is explicitly not captured —
 * before its handler runs. The global 100/min limiter is the one captured path
 * reachable without credentials, and its window self-heals in a minute.
 *
 * The marker rides on the request rather than the payload:
 * `createRequestIdMiddleware` adopts a caller-supplied `x-request-id`, and
 * `setSentryContext` tags every captured event with `requestId`. The URL is
 * tagged too, so the marker is carried twice independently.
 *
 * `--project` is a parameter rather than a constant on purpose: the run has an
 * open question about whether the three services share one Sentry project or
 * use the three per-service projects that already exist in the org. This script
 * is correct under either answer.
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=... node scripts/sentry-round-trip.mjs \
 *     --base-url https://api.mattbutlerengineering.com \
 *     --org mattbutlerengineering --project users-api
 *
 * Exit code: 0 only when the event came back. A service with no DSN captures
 * nothing, so the poll times out and the exit code is non-zero.
 */

import { fileURLToPath } from "node:url";

/** Prefix every marker carries, so this traffic is obvious in Sentry and in logs. */
const MARKER_PREFIX = "mbe-round-trip";

/** Longest a single poll ever waits, so a long window still checks regularly. */
const MAX_POLL_DELAY_MS = 10_000;

/**
 * Build the per-run marker. Unique per run so an event left behind by an
 * earlier check can never satisfy a later one — a stale pass would be exactly
 * the false "everything is fine" this whole run exists to remove.
 *
 * @param {string} nowIso ISO timestamp, e.g. new Date().toISOString()
 * @param {string} nonce Random suffix
 * @returns {string} URL- and header-safe marker
 */
export function buildRoundTripMarker(nowIso, nonce) {
  const compact = nowIso.replace(/[:.-]/g, "");
  return `${MARKER_PREFIX}-${compact}-${nonce}`;
}

/**
 * Does this Sentry event belong to this run?
 *
 * Checks both tags the plugin sets. `requestId` is the intended carrier; `url`
 * is an independent second one, so a regression in `x-request-id` propagation
 * degrades this check's precision instead of silently breaking it.
 *
 * @param {{ tags?: Array<{ key?: string, value?: string }> }} event
 * @param {string} marker
 * @returns {boolean}
 */
export function eventMatchesMarker(event, marker) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  return tags.some(
    (tag) =>
      (tag?.key === "requestId" && tag?.value === marker) ||
      (tag?.key === "url" && typeof tag?.value === "string" && tag.value.includes(marker))
  );
}

/**
 * Map an outcome to a process exit code.
 *
 * Only `confirmed` is success. Everything else — including an outcome this
 * function does not recognise — is a failure, because the failure mode being
 * guarded against is silence being read as health.
 *
 * @param {string | undefined} outcome
 * @returns {number}
 */
export function roundTripExitCode(outcome) {
  if (outcome === "confirmed") return 0;
  if (outcome === "not-found") return 1;
  return 2;
}

/**
 * @param {{ elapsedMs: number, timeoutMs: number }} args
 * @returns {boolean}
 */
export function shouldKeepPolling({ elapsedMs, timeoutMs }) {
  return elapsedMs < timeoutMs;
}

/**
 * Exponential backoff, capped. Sentry's ingest pipeline is not instant, so the
 * first polls are cheap and close together and later ones spread out.
 *
 * @param {number} attempt 1-based
 * @returns {number} milliseconds
 */
export function nextPollDelayMs(attempt) {
  return Math.min(1_000 * 2 ** (attempt - 1), MAX_POLL_DELAY_MS);
}

/** @param {string[]} argv @param {string} flag */
function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send requests until the global limiter answers 429, which is the captured
 * status. Every request carries the marker in both the header and the URL.
 */
async function provokeCapturedError(baseUrl, path, marker, maxRequests) {
  const url = `${baseUrl}${path}?rt=${marker}`;
  for (let sent = 1; sent <= maxRequests; sent += 1) {
    const response = await fetch(url, { headers: { "x-request-id": marker } });
    if (response.status === 429) return { provoked: true, sent };
  }
  return { provoked: false, sent: maxRequests };
}

/** Ask Sentry whether an event carrying the marker has landed yet. */
async function findMarkedEvent(org, project, marker, token) {
  const response = await fetch(
    `https://sentry.io/api/0/projects/${org}/${project}/events/?query=${encodeURIComponent(marker)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw new Error(`Sentry API returned ${response.status} ${response.statusText}`);
  }
  const events = await response.json();
  return (Array.isArray(events) ? events : []).find((event) => eventMatchesMarker(event, marker));
}

/* c8 ignore start -- CLI entrypoint: it provokes a real error inside a DEPLOYED service and polls Sentry, so it is exercised at Verify against production, never by unit tests. The decision logic it calls (buildRoundTripMarker, eventMatchesMarker, roundTripExitCode, shouldKeepPolling, nextPollDelayMs) is unit-tested above. */
async function main() {
  const argv = process.argv.slice(2);
  const baseUrl = readFlag(argv, "--base-url");
  const org = readFlag(argv, "--org") ?? process.env.SENTRY_ORG;
  const project = readFlag(argv, "--project") ?? process.env.SENTRY_PROJECT;
  const path = readFlag(argv, "--path") ?? "/api/v1/users/health";
  const timeoutMs = Number(readFlag(argv, "--timeout-ms") ?? 120_000);
  const token = process.env.SENTRY_AUTH_TOKEN;

  if (!baseUrl || !org || !project || !token) {
    console.error(
      "Usage: SENTRY_AUTH_TOKEN=... sentry-round-trip.mjs --base-url <url> --org <slug> --project <slug>"
    );
    process.exit(roundTripExitCode("error"));
  }

  console.log(`Round trip against ${baseUrl}${path} -> sentry:${org}/${project}`);
  const marker = buildRoundTripMarker(
    new Date().toISOString(),
    Math.random().toString(36).slice(2)
  );
  console.log(`Marker: ${marker}`);

  const { provoked, sent } = await provokeCapturedError(baseUrl, path, marker, 150);
  if (!provoked) {
    console.error(
      `::error::Sent ${sent} requests without provoking a 429. The rate limiter did not ` +
        `engage, so nothing was captured and this check cannot conclude anything.`
    );
    process.exit(roundTripExitCode("error"));
  }
  console.log(`Provoked HTTP 429 after ${sent} requests. Polling Sentry...`);

  const startedAt = Date.now();
  for (
    let attempt = 1;
    shouldKeepPolling({ elapsedMs: Date.now() - startedAt, timeoutMs });
    attempt += 1
  ) {
    await sleep(nextPollDelayMs(attempt));
    const found = await findMarkedEvent(org, project, marker, token);
    if (found) {
      console.log(`Event ${found.id ?? "(no id)"} came back carrying the marker.`);
      process.exit(roundTripExitCode("confirmed"));
    }
  }

  console.error(
    `::error::No event carrying ${marker} arrived within ${timeoutMs}ms. Either the service ` +
      `has no SENTRY_DSN, or it is not the DSN for ${org}/${project}.`
  );
  process.exit(roundTripExitCode("not-found"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A transport failure must report `error`, not crash. An unhandled rejection
  // exits 1 -- the same code as "the event never arrived" -- which would blur
  // the one distinction this check exists to make.
  try {
    await main();
  } catch (error) {
    console.error(
      `::error::Round-trip check failed: ${error instanceof Error ? error.message : error}`
    );
    process.exit(roundTripExitCode("error"));
  }
}

/* c8 ignore stop */
