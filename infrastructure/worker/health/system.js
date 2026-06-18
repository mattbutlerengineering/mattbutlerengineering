/**
 * Health system handler — aggregates all subsystem health.
 *
 * Extracted from edge-router.js. Uses the shared readKvJson helper
 * and topology from routes-config.json.
 */

import { STALENESS_THRESHOLD_MS, interpretDeployHealth } from "../deploy-health.js";
import topologyConfig from "../routes-config.json";
import { readKvJson } from "./kv-access.js";

const HEALTH_TIMEOUT_MS = 5_000;

// ── Topology derived from routes-config.json ─────────────────────────

const SERVICE_ENDPOINTS = Object.fromEntries(
  topologyConfig.services.map((s) => [s.name, s.healthPath])
);

const STATIC_SITE_BINDINGS = topologyConfig.staticRoutes.map((r) => r.binding);

const KV_KEYS = {
  ...topologyConfig.kvKeys,
  ...Object.fromEntries(
    topologyConfig.services.map((s) => [
      `migrate${s.name.charAt(0).toUpperCase()}${s.name.slice(1)}`,
      s.kvMigrateKey,
    ])
  ),
};

// ── CORS helpers ──────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://mattbutlerengineering.com",
  "https://hospitality.mattbutlerengineering.com",
  "https://gen.mattbutlerengineering.com",
]);

function corsOriginFor(request) {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

// ── Probe helpers ─────────────────────────────────────────────────────

/**
 * Fetch a service health endpoint with a timeout.
 * Returns { status, latency, version?, checks? }.
 */
async function checkService(apiOrigin, path) {
  const start = Date.now();
  try {
    const response = await fetch(`${apiOrigin}${path}`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    if (!response.ok) {
      return { status: "error", latency };
    }
    const body = await response.json();
    return {
      status: body.status === "error" ? "error" : "ok",
      latency,
      version: body.version,
      checks: body.checks,
    };
  } catch {
    return { status: "timeout", latency: Date.now() - start };
  }
}

/**
 * Probe a static site via Service Binding HEAD request.
 * Returns { status, latency }.
 */
async function checkStaticSite(binding) {
  const start = Date.now();
  try {
    const response = await binding.fetch(new Request("https://dummy/", { method: "HEAD" }), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    return { status: response.ok ? "ok" : "error", latency };
  } catch {
    return { status: "timeout", latency: Date.now() - start };
  }
}

// ── Aggregation helpers (pure) ────────────────────────────────────────

/**
 * Determine subsystem status from an array of individual check statuses.
 */
function subsystemStatus(checks) {
  const statuses = Object.values(checks).map((c) => c.status);
  const errorCount = statuses.filter((s) => s !== "ok").length;
  if (errorCount === 0) return "healthy";
  if (errorCount >= 2) return "unhealthy";
  return "degraded";
}

/**
 * Determine CI health from KV data.
 */
function ciStatus(kvData, now) {
  if (!kvData) return { status: "stale", last_run: null };
  const age = now - new Date(kvData.updated_at).getTime();
  if (age > STALENESS_THRESHOLD_MS) {
    return { status: "stale", last_run: kvData };
  }
  return {
    status: kvData.conclusion === "success" ? "healthy" : "unhealthy",
    last_run: kvData,
  };
}

/**
 * Determine deploy health from KV data for all three pipelines.
 */
function deployStatus(pipelines, now) {
  let errorCount = 0;
  let staleCount = 0;
  for (const [, data] of Object.entries(pipelines)) {
    const { status } = interpretDeployHealth(data, now);
    if (status === "stale") staleCount++;
    else if (status === "unhealthy") errorCount++;
  }
  const status = errorCount > 0 ? "unhealthy" : staleCount > 0 ? "degraded" : "healthy";
  return { status, pipelines };
}

/**
 * Determine per-service migration health from KV data.
 */
function migrationStatus(services, now) {
  const checks = {};
  let errorCount = 0;
  let staleCount = 0;
  for (const [name, data] of Object.entries(services)) {
    if (!data) {
      checks[name] = { status: "unknown" };
      staleCount++;
    } else {
      const age = now - new Date(data.updated_at).getTime();
      if (age > STALENESS_THRESHOLD_MS) {
        checks[name] = { status: "stale", last_run: data };
        staleCount++;
      } else if (data.conclusion !== "success") {
        checks[name] = { status: "error", last_run: data };
        errorCount++;
      } else {
        checks[name] = { status: "ok", last_run: data };
      }
    }
  }
  const status = errorCount > 0 ? "unhealthy" : staleCount > 0 ? "degraded" : "healthy";
  return { status, checks };
}

/**
 * Compute the top-level system status from subsystem statuses.
 */
function computeSystemStatus(services, staticSites, ci, deploys) {
  if (services.status === "unhealthy") return "unhealthy";
  if (staticSites.status === "unhealthy") return "unhealthy";
  if (deploys.status === "unhealthy") return "unhealthy";

  const anyDegraded =
    services.status === "degraded" ||
    staticSites.status === "degraded" ||
    ci.status === "stale" ||
    ci.status === "unhealthy" ||
    deploys.status === "degraded";

  return anyDegraded ? "degraded" : "healthy";
}

/**
 * Check whether the request carries a valid health token.
 */
function isHealthAuthorized(request, env) {
  if (!env.HEALTH_TOKEN) return false;
  return request.headers.get("Authorization") === `Bearer ${env.HEALTH_TOKEN}`;
}

/**
 * Return a coarse health response with per-subsystem STATUS rollup only.
 */
function coarseHealthResponse(status, timestamp, requestId, request, subsystemStatuses) {
  const corsOrigin = corsOriginFor(request);
  const body = { status, timestamp, requestId };
  if (subsystemStatuses) {
    body.subsystems = {
      services: { status: subsystemStatuses.services },
      static_sites: { status: subsystemStatuses.static_sites },
      ci: { status: subsystemStatuses.ci },
      deploys: { status: subsystemStatuses.deploys },
    };
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    },
  });
}

// ── Main handler ──────────────────────────────────────────────────────

/**
 * Handle GET /health/system — aggregate all subsystem health.
 *
 * Unauthenticated requests receive a coarse { status, subsystems.*.status }
 * response. Detailed data requires a valid Bearer token matching HEALTH_TOKEN.
 */
async function handleHealthSystem(request, env, requestId) {
  const now = Date.now();

  const [serviceResults, staticResults, kvResults] = await Promise.all([
    Promise.all(
      Object.entries(SERVICE_ENDPOINTS).map(async ([name, path]) => {
        const check = await checkService(env.API_ORIGIN, path);
        return [name, check];
      })
    ),
    Promise.all(
      STATIC_SITE_BINDINGS.map(async (bindingName) => {
        const check = await checkStaticSite(env[bindingName]);
        return [bindingName.toLowerCase(), check];
      })
    ),
    Promise.all([
      readKvJson(env.HEALTH_STATE, KV_KEYS.ci),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployStatic),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployServices),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployInfrastructure),
      ...topologyConfig.services.map((s) =>
        readKvJson(
          env.HEALTH_STATE,
          KV_KEYS[`migrate${s.name.charAt(0).toUpperCase()}${s.name.slice(1)}`]
        )
      ),
    ]),
  ]);

  const serviceChecks = Object.fromEntries(serviceResults);
  const staticChecks = Object.fromEntries(staticResults);

  const services = { status: subsystemStatus(serviceChecks), checks: serviceChecks };
  const staticSites = { status: subsystemStatus(staticChecks), checks: staticChecks };
  const ci = ciStatus(kvResults[0], now);
  const deploys = deployStatus(
    { static: kvResults[1], services: kvResults[2], infrastructure: kvResults[3] },
    now
  );

  // Build migrations map from services array (after the 4 fixed KV keys)
  const migrationData = Object.fromEntries(
    topologyConfig.services.map((s, i) => [s.name, kvResults[4 + i]])
  );
  const migrations = migrationStatus(migrationData, now);

  const status = computeSystemStatus(services, staticSites, ci, deploys);
  const timestamp = new Date(now).toISOString();

  if (!isHealthAuthorized(request, env)) {
    return coarseHealthResponse(status, timestamp, requestId, request, {
      services: services.status,
      static_sites: staticSites.status,
      ci: ci.status,
      deploys: deploys.status,
    });
  }

  const corsOrigin = corsOriginFor(request);
  return new Response(
    JSON.stringify({
      status,
      timestamp,
      requestId,
      subsystems: { services, static_sites: staticSites, ci, deploys, migrations },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
      },
    }
  );
}

export {
  SERVICE_ENDPOINTS,
  STATIC_SITE_BINDINGS,
  KV_KEYS,
  subsystemStatus,
  ciStatus,
  deployStatus,
  migrationStatus,
  computeSystemStatus,
  isHealthAuthorized,
  handleHealthSystem,
};
