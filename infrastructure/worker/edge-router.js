/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*                   → DO App Platform (HTTP subrequest)
 *   /canary/marketing/*      → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /canary/hospitality/*    → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /canary/rialto/*         → Canary Workers Static Assets (Service Binding, CDN-free)
 *   /gen/*                   → Workers Static Assets (Service Binding, CDN-free)
 *   /hospitality/*           → Workers Static Assets (Service Binding, CDN-free)
 *   /rialto/*                → Workers Static Assets (Service Binding, CDN-free)
 *   /*                       → Workers Static Assets (Service Binding, CDN-free)
 *
 * Static site Workers are called via Service Bindings (env.BINDING.fetch()),
 * which bypass the CDN entirely — eliminating stale HTML after deploys.
 *
 * Canary routes expose freshly-deployed canary Workers for pre-promotion
 * verification. They are stripped of the /canary/<app> prefix before
 * forwarding so the app Worker receives the same paths as production.
 */
import {
  getCircuitState,
  saveCircuitState,
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
} from "./circuit-breaker.js";
import { checkRateLimit, rateLimitResponse } from "./rate-limiter.js";
import depGraph from "./dep-graph.json";

// ── Audit Token Verification ─────────────────────────────────────────
// Automated audits (Lighthouse, Playwright, curl) from the CI/cloud
// environment are blocked by Cloudflare Bot Fight Mode. Requests that
// carry a valid X-Audit-Token header bypass rate limiting at this Worker
// layer. To also bypass Bot Fight Mode, a Cloudflare WAF custom rule
// must be configured separately (see infrastructure/AUDIT_BYPASS.md).

/**
 * Check whether the request carries a valid audit token.
 * Returns true only when AUDIT_TOKEN is configured and the request
 * includes a matching `X-Audit-Token` header.
 */
function isAuditRequest(request, env) {
  if (!env.AUDIT_TOKEN) return false;
  const token = request.headers.get("X-Audit-Token");
  return token !== null && token === env.AUDIT_TOKEN;
}

// ── CORS Origin Allowlist ──────────────────────────────────────────────
// Only these production origins may receive Access-Control-Allow-Origin.
// If a request's Origin header does not match, the header is omitted entirely.
const ALLOWED_ORIGINS = new Set([
  "https://mattbutlerengineering.com",
  "https://hospitality.mattbutlerengineering.com",
  "https://gen.mattbutlerengineering.com",
]);

/**
 * Return the request's Origin if it is in the allowlist, or null otherwise.
 */
function corsOriginFor(request) {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

/**
 * Build security headers with a per-request nonce for CSP script-src.
 * The nonce replaces 'unsafe-inline', preventing injected scripts from
 * executing while allowing our own <script nonce="..."> tags to run.
 */
function buildSecurityHeaders(nonce) {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' 'self'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://dev-ytbgmz5ls3wh4xdx.us.auth0.com https://api.mattbutlerengineering.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
}

/**
 * Determine the correct Cache-Control header based on the request path.
 *
 * Hashed assets (Vite outputs under /assets/ with content hashes) are
 * immutable by definition — cache them for one year.  HTML documents
 * must always revalidate so deploys take effect immediately.
 */
function cacheControlFor(pathname) {
  if (pathname.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  // HTML and other types are handled in addHeaders where Content-Type is available
  return null;
}

/**
 * Generate a cryptographically random nonce for CSP.
 * Uses crypto.randomUUID() and strips hyphens for a compact base16 string.
 */
function generateNonce() {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Clone a response, append security headers, set cache headers,
 * and inject nonce into <script> tags for HTML responses.
 * Used for static site responses only (not API proxy).
 */
function addHeaders(response, pathname, nonce) {
  const securityHeaders = buildSecurityHeaders(nonce);
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  // Cache policy: hashed assets get immutable; HTML always revalidates
  const cacheOverride = cacheControlFor(pathname);
  if (cacheOverride) {
    headers.set("Cache-Control", cacheOverride);
  } else {
    const contentType = headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    }
  }

  const contentType = headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    // Use HTMLRewriter to inject nonce into all <script> tags
    const rewritten = new HTMLRewriter().on("script", new NonceInjector(nonce)).transform(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    );
    return rewritten;
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * HTMLRewriter element handler that adds a nonce attribute to <script> tags.
 * This allows Vite-injected inline scripts (module preloads, etc.) to execute
 * under the nonce-based CSP while blocking any attacker-injected scripts.
 */
class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }

  element(el) {
    el.setAttribute("nonce", this.nonce);
  }
}

/**
 * Return a branded error page for service failures.
 */
function brandedErrorPage(statusCode, message, requestId, nonce = "") {
  const statusMessages = {
    502: "Service temporarily unavailable",
    503: "Service temporarily unavailable",
    504: "Request timed out",
    default: "Service unreachable",
  };

  const displayMessage = statusMessages[statusCode] || statusMessages.default;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Unavailable - Matt Butler Engineering</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      max-width: 500px;
      text-align: center;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 2rem;
      letter-spacing: -0.025em;
    }
    h1 {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #f1f5f9;
    }
    p {
      font-size: 1.125rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .error-code {
      font-size: 0.875rem;
      color: #64748b;
      font-family: monospace;
      background: #1e293b;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      display: inline-block;
      margin-bottom: 1.5rem;
    }
    .link {
      color: #38bdf8;
      text-decoration: none;
    }
    .link:hover {
      text-decoration: underline;
    }
    .refresh {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Matt Butler Engineering</div>
    <h1>${displayMessage}</h1>
    <p>We're experiencing some technical difficulties. Please try again shortly.</p>
    <div class="error-code">Request ID: ${requestId}</div>
    <p><a href="/" class="link">Return to homepage</a></p>
    <p class="refresh">Refreshing automatically in 30 seconds...</p>
  </div>
  <script nonce="${nonce}">setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`;

  const securityHeaders = nonce ? buildSecurityHeaders(nonce) : {};
  return new Response(html, {
    status: statusCode,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      ...securityHeaders,
    },
  });
}

// ── Health Aggregation ──────────────────────────────────────────────
// /health/system fans out to all subsystems in parallel and returns a
// unified JSON response.  Service health endpoints are fetched via HTTP,
// static sites are probed via Service Bindings (in-process), and CI/deploy
// status is read from KV (written by GitHub Actions).

const HEALTH_TIMEOUT_MS = 5_000;
const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1_000; // 24 hours

const SERVICE_ENDPOINTS = {
  users: "/health",
  reservations: "/api/health",
  agent: "/api/gen/health",
};

const STATIC_SITE_BINDINGS = ["MARKETING", "HOSPITALITY", "RIALTO", "GEN"];

const KV_KEYS = {
  ci: "ci/latest",
  deployStatic: "deploy/static",
  deployServices: "deploy/services",
  deployInfrastructure: "deploy/infrastructure",
  featureFlags: "flags/all",
  migrateUsers: "migrate/users",
  migrateReservations: "migrate/reservations",
  migrateAgent: "migrate/agent",
};

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

/**
 * Read a KV key as JSON, returning null if missing.
 */
async function readKvJson(kv, key) {
  try {
    return await kv.get(key, "json");
  } catch {
    return null;
  }
}

/**
 * Evaluate a feature flag for a given percentage rollout.
 * Returns true if the flag is enabled for the given seed (usually a user ID or session ID).
 */
function evaluateFlag(flag, seed) {
  if (!flag || !flag.enabled) return false;
  if (!flag.percentage || flag.percentage >= 100) return true;
  if (!seed) return false;
  const hash = hashCode(seed);
  return hash % 100 < flag.percentage;
}

/**
 * Simple hash function for consistent percentage distribution.
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Get all feature flags from KV and inject into request context.
 * Returns map of flag name -> boolean (whether enabled for this request).
 */
async function getFeatureFlags(env, seed) {
  const flags = await readKvJson(env.HEALTH_STATE, KV_KEYS.featureFlags);
  if (!flags) return {};
  const result = {};
  for (const [name, flag] of Object.entries(flags)) {
    result[name] = evaluateFlag(flag, seed);
  }
  return result;
}

/**
 * Determine subsystem status from an array of individual check statuses.
 * "ok" checks are healthy; any "error"/"timeout" degrades the subsystem.
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
 * null or stale data → "stale"; failure → "unhealthy"; success → "healthy".
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
  const entries = Object.entries(pipelines);
  let errorCount = 0;
  let staleCount = 0;
  for (const [, data] of entries) {
    if (!data) {
      staleCount++;
    } else {
      const age = now - new Date(data.updated_at).getTime();
      if (age > STALENESS_THRESHOLD_MS) staleCount++;
      else if (data.conclusion !== "success") errorCount++;
    }
  }
  const status = errorCount > 0 ? "unhealthy" : staleCount > 0 ? "degraded" : "healthy";
  return { status, pipelines };
}

/**
 * Determine per-service migration health from KV data.
 * Each service writes its own status after its pre-deploy job completes.
 * Format: { conclusion: "success"|"failure", updated_at: ISO string, service: string }
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
 *
 * Policy (balanced):
 * - Any service unhealthy → unhealthy (users can't do their work)
 * - 2+ static sites down  → unhealthy (significant outage)
 * - Single static site / CI / one deploy pipeline failing → degraded
 * - All healthy → healthy
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
 * Returns true only when HEALTH_TOKEN is configured and the request
 * includes a matching `Authorization: Bearer <token>` header.
 */
function isHealthAuthorized(request, env) {
  if (!env.HEALTH_TOKEN) return false;
  return request.headers.get("Authorization") === `Bearer ${env.HEALTH_TOKEN}`;
}

/**
 * Return a coarse health response with no infrastructure details.
 */
function coarseHealthResponse(status, timestamp, requestId, request) {
  const corsOrigin = corsOriginFor(request);
  return new Response(JSON.stringify({ status, timestamp, requestId }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    },
  });
}

/**
 * Handle GET /health/system — aggregate all subsystem health.
 *
 * Unauthenticated requests receive only a coarse { status, timestamp }
 * response.  Detailed subsystem data (service names, latencies, commit
 * SHAs, CI status) requires a valid Bearer token matching HEALTH_TOKEN.
 * If HEALTH_TOKEN is not configured, all requests get the coarse response
 * (safe by default).
 */
async function handleHealthSystem(request, env, requestId) {
  const now = Date.now();

  // Fan out all checks in parallel
  const [serviceResults, staticResults, kvResults] = await Promise.all([
    // Service health endpoints (HTTP)
    Promise.all(
      Object.entries(SERVICE_ENDPOINTS).map(async ([name, path]) => {
        const check = await checkService(env.API_ORIGIN, path);
        return [name, check];
      })
    ),
    // Static site probes (Service Binding)
    Promise.all(
      STATIC_SITE_BINDINGS.map(async (bindingName) => {
        const check = await checkStaticSite(env[bindingName]);
        return [bindingName.toLowerCase(), check];
      })
    ),
    // KV reads (CI + deploy + per-service migration status)
    Promise.all([
      readKvJson(env.HEALTH_STATE, KV_KEYS.ci),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployStatic),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployServices),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployInfrastructure),
      readKvJson(env.HEALTH_STATE, KV_KEYS.migrateUsers),
      readKvJson(env.HEALTH_STATE, KV_KEYS.migrateReservations),
      readKvJson(env.HEALTH_STATE, KV_KEYS.migrateAgent),
    ]),
  ]);

  // Build subsystem objects
  const serviceChecks = Object.fromEntries(serviceResults);
  const staticChecks = Object.fromEntries(staticResults);

  const services = { status: subsystemStatus(serviceChecks), checks: serviceChecks };
  const staticSites = { status: subsystemStatus(staticChecks), checks: staticChecks };
  const ci = ciStatus(kvResults[0], now);
  const deploys = deployStatus(
    { static: kvResults[1], services: kvResults[2], infrastructure: kvResults[3] },
    now
  );
  const migrations = migrationStatus(
    { users: kvResults[4], reservations: kvResults[5], agent: kvResults[6] },
    now
  );

  const status = computeSystemStatus(services, staticSites, ci, deploys);
  const timestamp = new Date(now).toISOString();

  // Gate detailed output behind token auth (safe by default)
  if (!isHealthAuthorized(request, env)) {
    return coarseHealthResponse(status, timestamp, requestId, request);
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

/**
 * Handle GET /health/uptime — compute uptime percentages from daily snapshots.
 *
 * Reads the last 30 days of uptime/ keys from KV, computes overall and
 * per-subsystem uptime as (healthy / total) * 100.
 */
async function handleHealthUptime(env) {
  const days = 30;
  const keys = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(`uptime/${d.toISOString().slice(0, 10)}`);
  }

  const snapshots = await Promise.all(
    keys.map(async (key) => {
      const raw = await env.HEALTH_STATE.get(key, "json");
      return raw;
    })
  );

  const valid = snapshots.filter(Boolean);
  const totalDays = valid.length;

  if (totalDays === 0) {
    return new Response(
      JSON.stringify({
        uptime: null,
        message: "No snapshots available yet. Snapshots are recorded daily.",
        daysTracked: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Count healthy days per subsystem
  const subsystemCounts = {};
  let overallHealthy = 0;

  for (const entry of valid) {
    const snap = entry.snapshot ?? entry;
    if (snap.status === "healthy") overallHealthy++;

    // Count per-service health
    if (snap.services) {
      for (const [name, svc] of Object.entries(snap.services)) {
        if (!subsystemCounts[name]) subsystemCounts[name] = { healthy: 0, total: 0 };
        subsystemCounts[name].total++;
        if (svc.status === "healthy" || svc.status === "ok") subsystemCounts[name].healthy++;
      }
    }
  }

  const subsystems = {};
  for (const [name, counts] of Object.entries(subsystemCounts)) {
    subsystems[name] = {
      uptimePercent: parseFloat(((counts.healthy / counts.total) * 100).toFixed(2)),
      healthyDays: counts.healthy,
      totalDays: counts.total,
    };
  }

  return new Response(
    JSON.stringify({
      uptimePercent: parseFloat(((overallHealthy / totalDays) * 100).toFixed(2)),
      healthyDays: overallHealthy,
      totalDays,
      periodDays: days,
      subsystems,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    }
  );
}

/**
 * Handle feature flags admin API.
 * GET /api/flags - list all flags
 * PUT /api/flags/<name> - create/update a flag
 * DELETE /api/flags/<name> - delete a flag
 */
/**
 * Handle GET /health/performance — 7-day latency trends per service.
 *
 * Reads latency/ KV keys for the last 7 days (up to 336 hourly samples),
 * computes per-service average and p95 latency, and flags regressions
 * where current p95 exceeds 1.5x the 7-day average.
 */
async function handleHealthPerformance(env) {
  const days = 7;
  const keys = [];
  const now = new Date();

  // Generate hourly keys for the last 7 days
  for (let h = 0; h < days * 24; h++) {
    const d = new Date(now.getTime() - h * 3600_000);
    keys.push(`latency/${d.toISOString().slice(0, 13).replace("T", "-")}`);
  }

  // Read all samples (KV list is faster but we know the keys)
  // Batch in groups of 50 to avoid overwhelming KV
  const samples = [];
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const results = await Promise.all(batch.map((key) => env.HEALTH_STATE.get(key, "json")));
    for (const r of results) {
      if (r) samples.push(r);
    }
  }

  if (samples.length === 0) {
    return new Response(
      JSON.stringify({
        message: "No latency data available yet. Samples are recorded twice daily.",
        samplesCollected: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Aggregate per-service latencies
  const serviceLatencies = {};
  for (const sample of samples) {
    const services = sample.services ?? {};
    for (const [name, data] of Object.entries(services)) {
      if (data.latency == null) continue;
      if (!serviceLatencies[name]) serviceLatencies[name] = [];
      serviceLatencies[name].push(data.latency);
    }
  }

  // Compute stats per service
  const serviceStats = {};
  const alerts = [];

  for (const [name, latencies] of Object.entries(serviceLatencies)) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];

    // Recent p95 = last 10% of samples (most recent)
    const recentCount = Math.max(1, Math.floor(sorted.length * 0.1));
    const recentLatencies = latencies.slice(-recentCount);
    const recentSorted = [...recentLatencies].sort((a, b) => a - b);
    const recentP95Index = Math.floor(recentSorted.length * 0.95);
    const recentP95 = recentSorted[recentP95Index] ?? recentSorted[recentSorted.length - 1];

    const trend =
      recentP95 > avg * 1.5 ? "degrading" : recentP95 < avg * 0.8 ? "improving" : "stable";

    serviceStats[name] = {
      avgMs: Math.round(avg),
      p95Ms: Math.round(p95),
      recentP95Ms: Math.round(recentP95),
      samples: latencies.length,
      trend,
    };

    if (trend === "degrading") {
      alerts.push(
        `${name}: p95 ${Math.round(recentP95)}ms exceeds 1.5x average (${Math.round(avg)}ms)`
      );
    }
  }

  return new Response(
    JSON.stringify({
      periodDays: days,
      samplesCollected: samples.length,
      services: serviceStats,
      alerts,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}

/**
 * Handle GET /health/lighthouse — 30-day Lighthouse score trends per app.
 *
 * Reads lighthouse/ KV keys, groups by app, computes average scores and
 * trend direction. Alerts if any category drops >5 points over 2 weeks.
 */
async function handleHealthLighthouse(env) {
  // List all lighthouse/ keys
  const listResult = await env.HEALTH_STATE.list({ prefix: "lighthouse/" });
  const keys = listResult.keys.map((k) => k.name);

  if (keys.length === 0) {
    return new Response(
      JSON.stringify({
        message: "No Lighthouse data available yet. Scores are recorded weekly.",
        appsTracked: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Read all scores
  const entries = await Promise.all(
    keys.map(async (key) => {
      const data = await env.HEALTH_STATE.get(key, "json");
      return data;
    })
  );
  const scores = entries.filter(Boolean);

  // Group by app
  const byApp = {};
  for (const score of scores) {
    if (!byApp[score.app]) byApp[score.app] = [];
    byApp[score.app].push(score);
  }

  // Compute trends per app
  const apps = {};
  const alerts = [];
  const categories = ["performance", "accessibility", "bestPractices", "seo"];

  for (const [app, appScores] of Object.entries(byApp)) {
    const sorted = appScores.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const twoWeeksAgo =
      sorted.find((s) => {
        const d = new Date(s.date);
        const cutoff = new Date(Date.now() - 14 * 86400_000);
        return d <= cutoff;
      }) ?? sorted[0];

    const appStats = { latest: {}, trend: {}, dataPoints: sorted.length };

    for (const cat of categories) {
      appStats.latest[cat] = latest[cat] ?? null;
      const diff = (latest[cat] ?? 0) - (twoWeeksAgo[cat] ?? 0);
      appStats.trend[cat] = diff > 5 ? "improving" : diff < -5 ? "degrading" : "stable";

      if (diff < -5) {
        alerts.push(
          `${app}: ${cat} dropped ${Math.abs(Math.round(diff))} points (${twoWeeksAgo[cat]} → ${latest[cat]})`
        );
      }
    }

    apps[app] = appStats;
  }

  return new Response(JSON.stringify({ periodDays: 30, apps, alerts }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Handle GET /health/deps — return the auto-generated service dependency graph.
 *
 * The graph is built at CI time by `scripts/generate-dep-graph.mjs` and
 * imported as a static JSON module.  Cached for 5 minutes at the edge.
 */
function handleHealthDeps(request) {
  const corsOrigin = corsOriginFor(request);
  return new Response(JSON.stringify(depGraph), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    },
  });
}

async function handleFeatureFlags(request, env, url) {
  const flagName = url.pathname.replace("/api/flags/", "");
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate actual token value against configured secret
  const token = authHeader.slice(7);
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const flags = (await readKvJson(env.HEALTH_STATE, KV_KEYS.featureFlags)) || {};

  if (request.method === "GET") {
    return new Response(JSON.stringify(flags), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "PUT") {
    try {
      const body = await request.json();
      flags[flagName] = {
        enabled: body.enabled ?? true,
        percentage: body.percentage ?? 100,
      };
      await env.HEALTH_STATE.put(KV_KEYS.featureFlags, JSON.stringify(flags));
      return new Response(JSON.stringify({ success: true, flag: flags[flagName] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (request.method === "DELETE") {
    delete flags[flagName];
    await env.HEALTH_STATE.put(KV_KEYS.featureFlags, JSON.stringify(flags));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Generate or preserve request ID
    const clientRequestId = request.headers.get("x-request-id");
    const requestId = clientRequestId || crypto.randomUUID();

    // Generate a per-request nonce for CSP script-src
    const nonce = generateNonce();

    // ── Audit token verification ──────────────────────────────────────
    const auditVerified = isAuditRequest(request, env);

    // ── Rate limiting (bypassed for verified audit requests) ─────────
    if (!auditVerified) {
      const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const rateCheck = await checkRateLimit(env.HEALTH_STATE, url.pathname, clientIp, Date.now());
      if (!rateCheck.allowed) {
        return rateLimitResponse();
      }
    }

    // ── Health aggregation endpoint ───────────────────────────────────
    if (url.pathname === "/health/system") {
      return handleHealthSystem(request, env, requestId);
    }

    if (url.pathname === "/health/uptime") {
      return handleHealthUptime(env);
    }

    if (url.pathname === "/health/performance") {
      return handleHealthPerformance(env);
    }

    if (url.pathname === "/health/lighthouse") {
      return handleHealthLighthouse(env);
    }

    if (url.pathname === "/health/deps") {
      return handleHealthDeps(request);
    }

    // ── Feature flags admin API ─────────────────────────────────────
    if (url.pathname.startsWith("/api/flags/")) {
      return handleFeatureFlags(request, env, url);
    }

    // Redirect www → non-www
    if (url.hostname.startsWith("www.")) {
      const bare = url.hostname.slice(4);
      return addHeaders(
        Response.redirect(`https://${bare}${url.pathname}${url.search}`, 301),
        url.pathname,
        nonce
      );
    }

    // Redirect legacy /dashboard → /hospitality
    if (url.pathname.startsWith("/dashboard")) {
      const rest = url.pathname.slice("/dashboard".length);
      return addHeaders(
        Response.redirect(`https://${url.hostname}/hospitality${rest}`, 301),
        url.pathname,
        nonce
      );
    }

    // ── API routes → HTTP subrequest to DO App Platform ──────────────
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      // Circuit breaker: check if API proxy is healthy
      const circuitState = await getCircuitState(env.HEALTH_STATE);
      const nowMs = Date.now();
      const { allowed, updatedState } = shouldAllowRequest(circuitState, nowMs);

      if (updatedState) {
        await saveCircuitState(env.HEALTH_STATE, updatedState);
      }

      if (!allowed) {
        return brandedErrorPage(503, "Service temporarily unavailable", requestId, nonce);
      }

      const target = new URL(url.pathname + url.search, env.API_ORIGIN);
      const headers = new Headers(request.headers);
      headers.set("Host", target.host);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");
      headers.set("X-Request-ID", requestId);

      // Feature flags: get from KV, inject as header for services
      const seed = request.headers.get("CF-Connecting-IP") ?? "";
      const featureFlags = await getFeatureFlags(env, seed);
      if (Object.keys(featureFlags).length > 0) {
        headers.set("X-Feature-Flags", JSON.stringify(featureFlags));
      }

      let apiResponse;
      try {
        apiResponse = await fetch(
          new Request(target, {
            method: request.method,
            headers,
            body: request.body,
            redirect: "manual",
          })
        );
      } catch (error) {
        console.error("API proxy error:", error.message);
        const newState = recordFailure(updatedState ?? circuitState, Date.now());
        await saveCircuitState(env.HEALTH_STATE, newState);
        return brandedErrorPage(503, "Service unreachable", requestId, nonce);
      }

      // If API returns 5xx, record failure for circuit breaker
      if (apiResponse.status >= 500) {
        const newState = recordFailure(updatedState ?? circuitState, Date.now());
        await saveCircuitState(env.HEALTH_STATE, newState);
        return brandedErrorPage(apiResponse.status, "Service error", requestId, nonce);
      }

      // Success — record for circuit breaker recovery
      const currentState = updatedState ?? circuitState;
      if (currentState.state !== "closed" || currentState.failures > 0) {
        const newState = recordSuccess(currentState);
        await saveCircuitState(env.HEALTH_STATE, newState);
      }

      // Pass through the response (including 4xx which should show app error pages)
      return apiResponse;
    }

    // ── Block source maps (defense-in-depth) ─────────────────────────
    // Source maps are uploaded to Sentry during build and deleted from
    // dist/, but block at the edge in case any slip through.
    if (url.pathname.endsWith(".map")) {
      return new Response("Not Found", { status: 404 });
    }

    // ── Trailing-slash redirects for SPA prefixes ────────────────────
    // Without the trailing slash, the prefix strip leaves "" which
    // normalizes to "/" and causes React Router catch-all confusion.
    if (url.pathname === "/rialto" || url.pathname === "/hospitality" || url.pathname === "/gen") {
      return addHeaders(
        Response.redirect(`https://${url.hostname}${url.pathname}/${url.search}`, 301),
        url.pathname,
        nonce
      );
    }

    // ── Canary routes → Canary Workers (CDN-free) ───────────────────
    // /canary/<app>[/rest] → strips /canary/<app> and forwards to canary Worker.
    // Canary Workers are accessible only through this router, never directly.
    if (url.pathname.startsWith("/canary/")) {
      let canaryBinding;
      let canaryPrefix = "";
      let canaryOrigin = "";

      if (url.pathname.startsWith("/canary/marketing")) {
        canaryBinding = env.MARKETING_CANARY;
        canaryPrefix = "/canary/marketing";
        canaryOrigin = "https://mattbutlerengineering-marketing-canary.workers.dev";
      } else if (url.pathname.startsWith("/canary/hospitality")) {
        canaryBinding = env.HOSPITALITY_CANARY;
        canaryPrefix = "/canary/hospitality";
        canaryOrigin = "https://mattbutlerengineering-hospitality-canary.workers.dev";
      } else if (url.pathname.startsWith("/canary/rialto")) {
        canaryBinding = env.RIALTO_CANARY;
        canaryPrefix = "/canary/rialto";
        canaryOrigin = "https://mattbutlerengineering-rialto-web-canary.workers.dev";
      } else if (url.pathname.startsWith("/canary/gen")) {
        canaryBinding = env.GEN_CANARY;
        canaryPrefix = "/canary/gen";
        canaryOrigin = "https://mattbutlerengineering-gen-canary.workers.dev";
      }

      if (canaryBinding) {
        const strippedCanaryPath = url.pathname.slice(canaryPrefix.length) || "/";
        const canaryUrl = new URL(strippedCanaryPath + url.search, canaryOrigin);
        const canaryRequest = new Request(canaryUrl, request);
        const canaryResponse = await canaryBinding.fetch(canaryRequest);
        return addHeaders(canaryResponse, url.pathname, nonce);
      }

      // Unknown /canary/* path — 404
      return new Response("Not Found", { status: 404 });
    }

    // ── Static sites → Service Binding (CDN-free) ───────────────────
    let binding;
    let prefix = "";
    let bindingOrigin = "";

    if (url.pathname.startsWith("/hospitality")) {
      binding = env.HOSPITALITY;
      prefix = "/hospitality";
      bindingOrigin = "https://mattbutlerengineering-hospitality.workers.dev";
    } else if (url.pathname.startsWith("/rialto")) {
      binding = env.RIALTO;
      prefix = "/rialto";
      bindingOrigin = "https://mattbutlerengineering-rialto-web.workers.dev";
    } else if (url.pathname.startsWith("/gen")) {
      binding = env.GEN;
      prefix = "/gen";
      bindingOrigin = "https://mattbutlerengineering-gen.workers.dev";
    } else {
      binding = env.MARKETING;
      bindingOrigin = "https://mattbutlerengineering-marketing.workers.dev";
    }

    // Strip path prefix before forwarding to the app Worker.
    // Each app is built with base: "/<name>/" in Vite, but the Worker
    // serves from root — so /hospitality/foo → /foo on the app Worker.
    const strippedPath = prefix ? url.pathname.slice(prefix.length) || "/" : url.pathname;
    const appUrl = new URL(strippedPath + url.search, bindingOrigin);
    const appHeaders = new Headers(request.headers);
    appHeaders.set("X-Request-ID", requestId);
    const appRequest = new Request(appUrl, {
      method: request.method,
      headers: appHeaders,
      body: request.body,
      redirect: request.redirect,
    });

    let response;
    try {
      response = await binding.fetch(appRequest);
    } catch (error) {
      console.error(`Static site error (${prefix || "marketing"}):`, error.message);
      return brandedErrorPage(503, "Service temporarily unavailable", requestId, nonce);
    }

    // If static site returns 5xx, show branded error
    if (response.status >= 500) {
      return brandedErrorPage(response.status, "Service error", requestId, nonce);
    }

    // Rewrite Location headers so redirects use the public domain with prefix.
    const location = response.headers.get("Location");
    if (location) {
      try {
        const loc = new URL(location, url.origin);
        if (loc.pathname !== url.pathname) {
          const rewritten = new Headers(response.headers);
          rewritten.set("Location", `https://${url.host}${prefix}${loc.pathname}${loc.search}`);
          return addHeaders(
            new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: rewritten,
            }),
            url.pathname,
            nonce
          );
        }
      } catch {
        // Relative or malformed Location header — pass through as-is
      }
    }

    return addHeaders(response, url.pathname, nonce);
  },
};
