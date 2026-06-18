/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*                   → DO App Platform (HTTP subrequest)
 *   /gen/*                   → Workers Static Assets (Service Binding, CDN-free)
 *   /hospitality/*           → Workers Static Assets (Service Binding, CDN-free)
 *   /rialto/*                → Workers Static Assets (Service Binding, CDN-free)
 *   /*                       → Workers Static Assets (Service Binding, CDN-free)
 *
 * Static site Workers are called via Service Bindings (env.BINDING.fetch()),
 * which bypass the CDN entirely — eliminating stale HTML after deploys.
 */
import {
  getCircuitState,
  saveCircuitState,
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
} from "./circuit-breaker.js";
import { checkRateLimit, rateLimitResponse } from "./rate-limiter.js";
import { AUTH0_ORIGIN } from "./csp.js";
import topologyConfig from "./routes-config.json";
import {
  generateNonce,
  readCspPolicy,
  addHeaders,
  brandedErrorPage,
} from "./response-formatter.js";
import { handleHealthSystem } from "./health/system.js";
import { handleHealthUptime } from "./health/uptime.js";
import { handleHealthPerformance } from "./health/performance.js";
import { handleHealthLighthouse } from "./health/lighthouse.js";
import { handleHealthDeps } from "./health/deps.js";
import { readKvJson } from "./health/kv-access.js";

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

// ── Auth0 Tenant ──────────────────────────────────────────────────────
// AUTH0_ORIGIN is defined in csp.js (the module that uses it) and
// re-exported here for backward compatibility with consumers that
// import it from edge-router.js.
export { AUTH0_ORIGIN };

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
 * Evaluate a feature flag for a given percentage rollout.
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
 */
async function getFeatureFlags(env, seed) {
  const KV_KEY_FEATURE_FLAGS = topologyConfig.kvKeys.featureFlags;
  const flags = await readKvJson(env.HEALTH_STATE, KV_KEY_FEATURE_FLAGS);
  if (!flags) return {};
  const result = {};
  for (const [name, flag] of Object.entries(flags)) {
    result[name] = evaluateFlag(flag, seed);
  }
  return result;
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

  const token = authHeader.slice(7);
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const KV_KEY_FEATURE_FLAGS = topologyConfig.kvKeys.featureFlags;
  const flags = (await readKvJson(env.HEALTH_STATE, KV_KEY_FEATURE_FLAGS)) || {};

  if (request.method === "GET") {
    return new Response(JSON.stringify(flags), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "PUT") {
    try {
      const body = await request.json();
      const updatedFlags = {
        ...flags,
        [flagName]: {
          enabled: body.enabled ?? true,
          percentage: body.percentage ?? 100,
        },
      };
      await env.HEALTH_STATE.put(KV_KEY_FEATURE_FLAGS, JSON.stringify(updatedFlags));
      return new Response(JSON.stringify({ success: true, flag: updatedFlags[flagName] }), {
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
    const { [flagName]: _removed, ...remainingFlags } = flags;
    await env.HEALTH_STATE.put(KV_KEY_FEATURE_FLAGS, JSON.stringify(remainingFlags));
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

function writeAnalytics(env, request, route, statusCode, startTime) {
  if (!env.ANALYTICS) return;
  const country = request.headers.get("CF-IPCountry") || "unknown";
  const elapsed = Date.now() - startTime;
  env.ANALYTICS.writeDataPoint({
    blobs: [route, request.method, country, new URL(request.url).pathname],
    doubles: [statusCode, elapsed],
    indexes: [route],
  });
}

export default {
  async fetch(request, env) {
    const startTime = Date.now();
    const url = new URL(request.url);

    // Generate or preserve request ID
    const clientRequestId = request.headers.get("x-request-id");
    const requestId = clientRequestId || crypto.randomUUID();

    // Generate a per-request nonce for CSP script-src
    const nonce = generateNonce();

    // ── CSP policy from KV (security/csp) — null = use hardcoded fallback ─
    // Rollback: `wrangler kv key delete --binding HEALTH_STATE "security/csp"`
    const kvPolicy = await readCspPolicy(env.HEALTH_STATE);

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

    // ── Health aggregation endpoints ──────────────────────────────────
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
        nonce,
        kvPolicy
      );
    }

    // Redirect legacy /dashboard → /hospitality
    if (url.pathname.startsWith("/dashboard")) {
      const rest = url.pathname.slice("/dashboard".length);
      return addHeaders(
        Response.redirect(`https://${url.hostname}/hospitality${rest}`, 301),
        url.pathname,
        nonce,
        kvPolicy
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
        return brandedErrorPage(503, "Service temporarily unavailable", requestId, nonce, kvPolicy);
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
        return brandedErrorPage(503, "Service unreachable", requestId, nonce, kvPolicy);
      }

      // If API returns 5xx, record failure for circuit breaker
      if (apiResponse.status >= 500) {
        const newState = recordFailure(updatedState ?? circuitState, Date.now());
        await saveCircuitState(env.HEALTH_STATE, newState);
        return brandedErrorPage(apiResponse.status, "Service error", requestId, nonce, kvPolicy);
      }

      // Success — record for circuit breaker recovery
      const currentState = updatedState ?? circuitState;
      if (currentState.state !== "closed" || currentState.failures > 0) {
        const newState = recordSuccess(currentState);
        await saveCircuitState(env.HEALTH_STATE, newState);
      }

      // Pass through the response (including 4xx which should show app error pages)
      writeAnalytics(env, request, "api", apiResponse.status, startTime);
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
    // Prefixes come from routes-config.json staticRoutes (skip catch-all).
    const spaPrefixes = topologyConfig.staticRoutes.map((r) => r.prefix).filter((p) => p !== "");
    if (spaPrefixes.includes(url.pathname)) {
      return addHeaders(
        Response.redirect(`https://${url.hostname}${url.pathname}/${url.search}`, 301),
        url.pathname,
        nonce,
        kvPolicy
      );
    }

    // ── Static sites → Service Binding (CDN-free) ───────────────────
    // Route table comes from routes-config.json staticRoutes.
    // Entries are ordered: specific prefixes first, catch-all (empty prefix) last.
    const matchedRoute = topologyConfig.staticRoutes.find((r) =>
      r.prefix ? url.pathname.startsWith(r.prefix) : true
    );
    const prefix = matchedRoute.prefix;
    const bindingOrigin = matchedRoute.bindingOrigin;
    const routeName = matchedRoute.routeName;
    const binding = env[matchedRoute.binding];

    // Strip path prefix before forwarding to the app Worker.
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
      return brandedErrorPage(503, "Service temporarily unavailable", requestId, nonce, kvPolicy);
    }

    // If static site returns 5xx, show branded error
    if (response.status >= 500) {
      return brandedErrorPage(response.status, "Service error", requestId, nonce, kvPolicy);
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
            nonce,
            kvPolicy
          );
        }
      } catch {
        // Relative or malformed Location header — pass through as-is
      }
    }

    writeAnalytics(env, request, routeName, response.status, startTime);
    return addHeaders(response, url.pathname, nonce, kvPolicy);
  },
};
