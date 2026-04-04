/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*          → DO App Platform (HTTP subrequest)
 *   /gen/*          → Workers Static Assets (Service Binding, CDN-free)
 *   /hospitality/*  → Workers Static Assets (Service Binding, CDN-free)
 *   /rialto/*       → Workers Static Assets (Service Binding, CDN-free)
 *   /*              → Workers Static Assets (Service Binding, CDN-free)
 *
 * Static site Workers are called via Service Bindings (env.BINDING.fetch()),
 * which bypass the CDN entirely — eliminating stale HTML after deploys.
 */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://dev-ytbgmz5ls3wh4xdx.us.auth0.com https://api.mattbutlerengineering.com https://cloudflareinsights.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

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
 * Clone a response, append security headers, and set cache headers.
 * Used for static site responses only (not API proxy).
 */
function addHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Health Aggregation ──────────────────────────────────────────────
// /health/system fans out to all subsystems in parallel and returns a
// unified JSON response.  Service health endpoints are fetched via HTTP,
// static sites are probed via Service Bindings (in-process), and CI/deploy
// status is read from KV (written by GitHub Actions).

const HEALTH_TIMEOUT_MS = 5_000;
const STALENESS_THRESHOLD_MS = 60 * 60 * 1_000; // 1 hour

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
  return (hash % 100) < flag.percentage;
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
function coarseHealthResponse(status, timestamp) {
  return new Response(JSON.stringify({ status, timestamp }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
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
async function handleHealthSystem(request, env) {
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
    // KV reads (CI + deploy status)
    Promise.all([
      readKvJson(env.HEALTH_STATE, KV_KEYS.ci),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployStatic),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployServices),
      readKvJson(env.HEALTH_STATE, KV_KEYS.deployInfrastructure),
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

  const status = computeSystemStatus(services, staticSites, ci, deploys);
  const timestamp = new Date(now).toISOString();

  // Gate detailed output behind token auth (safe by default)
  if (!isHealthAuthorized(request, env)) {
    return coarseHealthResponse(status, timestamp);
  }

  return new Response(
    JSON.stringify({
      status,
      timestamp,
      subsystems: { services, static_sites: staticSites, ci, deploys },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

/**
 * Handle feature flags admin API.
 * GET /api/flags - list all flags
 * PUT /api/flags/<name> - create/update a flag
 * DELETE /api/flags/<name> - delete a flag
 */
async function handleFeatureFlags(request, env, url) {
  const flagName = url.pathname.replace("/api/flags/", "");
  const authHeader = request.headers.get("Authorization");
  
  // Simple auth check (in production, validate against API key)
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
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

    // ── Health aggregation endpoint ───────────────────────────────────
    if (url.pathname === "/health/system") {
      return handleHealthSystem(request, env);
    }

    // ── Feature flags admin API ─────────────────────────────────────
    if (url.pathname.startsWith("/api/flags/")) {
      return handleFeatureFlags(request, env, url);
    }

    // Redirect www → non-www
    if (url.hostname.startsWith("www.")) {
      const bare = url.hostname.slice(4);
      return addHeaders(
        Response.redirect(
          `https://${bare}${url.pathname}${url.search}`,
          301
        ),
        url.pathname
      );
    }

    // Redirect legacy /dashboard → /hospitality
    if (url.pathname.startsWith("/dashboard")) {
      const rest = url.pathname.slice("/dashboard".length);
      return addHeaders(
        Response.redirect(
          `https://${url.hostname}/hospitality${rest}`,
          301
        ),
        url.pathname
      );
    }

    // ── API routes → HTTP subrequest to DO App Platform ──────────────
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      const target = new URL(url.pathname + url.search, env.API_ORIGIN);
      const headers = new Headers(request.headers);
      headers.set("Host", target.host);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");

      // Feature flags: get from KV, inject as header for services
      const seed = request.headers.get("CF-Connecting-IP") ?? "";
      const featureFlags = await getFeatureFlags(env, seed);
      if (Object.keys(featureFlags).length > 0) {
        headers.set("X-Feature-Flags", JSON.stringify(featureFlags));
      }

      return fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        })
      );
    }

    // ── Trailing-slash redirects for SPA prefixes ────────────────────
    // Without the trailing slash, the prefix strip leaves "" which
    // normalizes to "/" and causes React Router catch-all confusion.
    if (url.pathname === "/rialto" || url.pathname === "/hospitality" || url.pathname === "/gen") {
      return addHeaders(
        Response.redirect(
          `https://${url.hostname}${url.pathname}/${url.search}`,
          301
        ),
        url.pathname
      );
    }

    // ── Static sites → Service Binding (CDN-free) ───────────────────
    let binding;
    let prefix = "";

    if (url.pathname.startsWith("/hospitality")) {
      binding = env.HOSPITALITY;
      prefix = "/hospitality";
    } else if (url.pathname.startsWith("/rialto")) {
      binding = env.RIALTO;
      prefix = "/rialto";
    } else if (url.pathname.startsWith("/gen")) {
      binding = env.GEN;
      prefix = "/gen";
    } else {
      binding = env.MARKETING;
    }

    // Strip path prefix before forwarding to the app Worker.
    // Each app is built with base: "/<name>/" in Vite, but the Worker
    // serves from root — so /hospitality/foo → /foo on the app Worker.
    const strippedPath = prefix ? (url.pathname.slice(prefix.length) || "/") : url.pathname;
    const appUrl = new URL(strippedPath + url.search, url.origin);
    const appRequest = new Request(appUrl, request);

    const response = await binding.fetch(appRequest);

    // Rewrite Location headers so redirects use the public domain with prefix.
    const location = response.headers.get("Location");
    if (location) {
      try {
        const loc = new URL(location, url.origin);
        if (loc.pathname !== url.pathname) {
          const rewritten = new Headers(response.headers);
          rewritten.set(
            "Location",
            `https://${url.host}${prefix}${loc.pathname}${loc.search}`
          );
          return addHeaders(
            new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: rewritten,
            }),
            url.pathname
          );
        }
      } catch {
        // Relative or malformed Location header — pass through as-is
      }
    }

    return addHeaders(response, url.pathname);
  },
};
