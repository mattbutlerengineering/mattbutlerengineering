#!/usr/bin/env node
/**
 * scripts/check-api-surface-invariants.mjs
 *
 * Post-deploy probe for guards that are only observable on the deployed
 * service. Distinct from scripts/check-endpoint.mjs, which asks "is it up"
 * and classifies any 4xx as a problem. Here a 4xx IS the expected answer:
 * the question is whether the protection *around* a working route is still
 * attached.
 *
 * Why this exists: #4492 moved `POST /api/v1/venues`'s rate limiter to
 * `hook: "preHandler"`, which (correctly) let it key on the verified `sub`
 * and (invisibly) opted the route out of the service-wide `onRequest`
 * limiter. Body validation's 400 and requireAuth's 401 both answer upstream
 * of a preHandler, so a publicly reachable POST carried no rate limit at all.
 * The route still behaved perfectly. Lint, typecheck, 1312 unit tests, CI,
 * review and a closed retro all passed over it, because an absent limiter and
 * a present one are indistinguishable to every one of them. The only signal
 * that ever existed was a response header that was not there -- `GET
 * /api/v1/venues` answered 401 carrying `x-ratelimit-limit: 100` while the
 * `POST` on the same path carried none. Fixed in #4499; this is the gate that
 * would have caught it.
 *
 * This is detection, not a merge gate: it runs after deploy, so it reports a
 * regression that is already live. That is the trade -- these invariants have
 * no meaning anywhere except against the real edge and the real config.
 *
 * Usage:
 *   node scripts/check-api-surface-invariants.mjs [--base <url>] [--timeout <ms>]
 *                                                 [--retries <n>] [--retry-delay <ms>]
 *
 * Prints one JSON line per probe, then a summary. Exits 1 if any probe failed.
 */

import { fileURLToPath } from "node:url";

/** @typedef {"ok"|"unreachable"|"status-mismatch"|"guard-missing"} ProbeState */

export const PROBE_STATES = /** @type {const} */ ([
  "ok",
  "unreachable",
  "status-mismatch",
  "guard-missing",
]);

const DEFAULT_BASE = "https://api.mattbutlerengineering.com";
const DEFAULT_TIMEOUT_MS = 15000;
// Covers a container still cycling behind a deploy that already reported success.
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 10000;

/**
 * A body that satisfies createVenueBodyJsonSchema's required fields, so the
 * request reaches requireAuth instead of stopping at validation. It is never
 * sent with credentials, so it cannot create anything.
 */
const VALID_VENUE_BODY = {
  name: "surface-probe",
  slug: "surface-probe",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
};

/**
 * Every probe is unauthenticated by construction. Nothing here may carry a
 * token or expect a 2xx: a probe that mutates production is not a probe.
 */
export const API_SURFACE_PROBES = [
  {
    name: "venue-create:validation-stage",
    method: "POST",
    path: "/api/v1/venues",
    body: { nope: true },
    // Schema validation runs before every preHandler, so this is the cheapest
    // way to reach the service anonymously and the stage that was ungoverned.
    expectStatus: 400,
    requireHeaders: ["x-ratelimit-limit"],
  },
  {
    name: "venue-create:auth-stage",
    method: "POST",
    path: "/api/v1/venues",
    body: VALID_VENUE_BODY,
    expectStatus: 401,
    requireHeaders: ["x-ratelimit-limit"],
  },
  {
    name: "venue-list:auth-stage",
    method: "GET",
    path: "/api/v1/venues",
    // The sibling that stayed correct throughout the regression, and the
    // control that made the POST's missing header legible as a defect.
    expectStatus: 401,
    requireHeaders: ["x-ratelimit-limit"],
  },
  {
    name: "tables-list:auth-stage",
    method: "GET",
    path: "/api/v1/tables",
    expectStatus: 401,
    requireHeaders: ["x-ratelimit-limit"],
  },
  {
    name: "guests-list:validation-stage",
    method: "GET",
    path: "/api/v1/guests",
    // 400, not 401: this route validates its required `venueId` query param
    // before requireAuth runs, so anonymous callers stop at validation. That
    // is precisely the stage that lost its bound on the venue route, which
    // makes it worth covering on a third path.
    expectStatus: 400,
    requireHeaders: ["x-ratelimit-limit"],
  },
];

/**
 * Pure classification of one probe outcome.
 *
 * Order matters: an unreachable host must never be reported as a missing
 * guard. "The service is down" and "the service dropped its rate limit" call
 * for opposite responses, and conflating them would make an outage look like
 * a security regression.
 *
 * An empty header value counts as absent. A header that exists but says
 * nothing bounds nothing, and treating it as present is the same trap as
 * `gh secret set` silently storing "".
 *
 * @param {{ expectStatus: number, requireHeaders: string[] }} probe
 * @param {{ httpCode: number, headers: Record<string, string> }} observed
 * @returns {ProbeState}
 */
export function classifyProbe(probe, observed) {
  if (observed.httpCode === 0) return "unreachable";
  if (observed.httpCode !== probe.expectStatus) return "status-mismatch";

  const present = new Map(
    Object.entries(observed.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const required of probe.requireHeaders) {
    const value = present.get(required.toLowerCase());
    if (value === undefined || String(value).trim() === "") return "guard-missing";
  }
  return "ok";
}

/**
 * Whether a probe outcome is worth retrying.
 *
 * Only `unreachable`. This job runs 30s after a deploy reports success, and DO
 * App Platform can still be cycling a container at that point -- a gate that
 * files a spurious issue on every slow deploy gets muted, which is the same
 * end state as having no gate.
 *
 * `guard-missing` and `status-mismatch` are deterministic properties of the
 * running config, so retrying them could only mask a real regression. That
 * asymmetry is the whole point: retry the flaky state, never the meaningful
 * ones.
 *
 * @param {ProbeState} state
 * @returns {boolean}
 */
export function isRetryable(state) {
  return state === "unreachable";
}

/**
 * @param {{ base: string, timeoutMs: number, probe: (typeof API_SURFACE_PROBES)[number] }} args
 * @returns {Promise<{ httpCode: number, headers: Record<string, string> }>}
 */
async function runProbe({ base, timeoutMs, probe }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${probe.path}`, {
      method: probe.method,
      headers: probe.body ? { "Content-Type": "application/json" } : undefined,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: controller.signal,
    });
    return { httpCode: response.status, headers: Object.fromEntries(response.headers) };
  } catch {
    // Any failure to complete the request -- DNS, refused, timeout, abort.
    return { httpCode: 0, headers: {} };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The observed value of each header a probe requires, for the log line.
 *
 * @param {{ requireHeaders: string[] }} probe
 * @param {{ headers: Record<string, string> }} observed
 * @returns {Record<string, string | null>}
 */
function guardValues(probe, observed) {
  const present = new Map(
    Object.entries(observed.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return Object.fromEntries(
    probe.requireHeaders.map((h) => [h, present.get(h.toLowerCase()) ?? null])
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function numericFlag(argv, flag, fallback) {
  const raw = argv.includes(flag) ? Number(argv[argv.indexOf(flag) + 1]) : NaN;
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function parseArgs(argv) {
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : DEFAULT_BASE;
  return {
    base: (base ?? DEFAULT_BASE).replace(/\/$/, ""),
    timeoutMs: numericFlag(argv, "--timeout", DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    retries: numericFlag(argv, "--retries", DEFAULT_RETRIES),
    retryDelayMs: numericFlag(argv, "--retry-delay", DEFAULT_RETRY_DELAY_MS),
  };
}

async function main() {
  const { base, timeoutMs, retries, retryDelayMs } = parseArgs(process.argv.slice(2));
  const failures = [];

  for (const probe of API_SURFACE_PROBES) {
    let observed = await runProbe({ base, timeoutMs, probe });
    let state = classifyProbe(probe, observed);

    for (let attempt = 1; attempt <= retries && isRetryable(state); attempt += 1) {
      await sleep(retryDelayMs);
      observed = await runProbe({ base, timeoutMs, probe });
      state = classifyProbe(probe, observed);
    }
    console.log(
      JSON.stringify({
        name: probe.name,
        request: `${probe.method} ${probe.path}`,
        expectStatus: probe.expectStatus,
        httpCode: observed.httpCode,
        // Report whatever this probe actually requires, matched the same
        // case-insensitive way classifyProbe matches it. Naming one header
        // here would quietly log `null` for a probe that required a different
        // one, while classifyProbe called it `ok`.
        guards: guardValues(probe, observed),
        state,
      })
    );
    if (state !== "ok") failures.push({ probe, observed, state });
  }

  if (failures.length === 0) {
    console.log(`\nAll ${API_SURFACE_PROBES.length} API surface invariants hold against ${base}.`);
    return;
  }

  console.error(`\n${failures.length} of ${API_SURFACE_PROBES.length} probes failed:`);
  for (const { probe, observed, state } of failures) {
    console.error(`  ${state}\t${probe.name}\t${probe.method} ${probe.path}`);
    if (state === "status-mismatch") {
      console.error(`          expected HTTP ${probe.expectStatus}, got ${observed.httpCode}`);
    } else if (state === "unreachable") {
      console.error(`          the request did not complete — the service may be down`);
    } else {
      // guard-missing: the status was right, so this is not an outage. Say so,
      // because the two call for opposite responses.
      console.error(
        `          answered ${observed.httpCode} as expected, but without ` +
          `${probe.requireHeaders.join(", ")} — the route works and its guard is gone. ` +
          `See .claude/rules/gotchas.md § Fastify / rate limiting.`
      );
    }
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
