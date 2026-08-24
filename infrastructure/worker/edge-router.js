/**
 * Cloudflare Worker edge router for mattbutlerengineering.com
 *
 * Routes requests based on path prefix:
 *   /api/*                   → DO App Platform (HTTP subrequest)
 *   /public/*                → DO App Platform (HTTP subrequest)
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

/**
 * Whether a path is served by the DO origin, per routes-config.json's
 * `originRoutes`.
 *
 * **Exact-or-slash, never a bare `startsWith(prefix)`**: a prefix matches the
 * whole path, or a whole path segment below it. `/api` and `/api/v1/x` proxy;
 * `/apiary` and `/publicity` do not, and both serve the marketing SPA today.
 * This is exactly what the hardcoded `/api` test did before the table moved
 * here, so for `/api` the change is a refactor — a matcher that changed what a
 * live path returns would not be.
 *
 * **Order is not significant.** This is one boolean — does ANY prefix match —
 * so `originRoutes` is a set, and no entry can shadow another. Contrast
 * `staticRoutes` below, whose order IS load-bearing (first match wins, ending
 * in a catch-all) and whose prefix is stripped before forwarding. The two
 * tables mean different things and deliberately keep different matchers: a
 * `staticRoutes` prefix is a mount point, an `originRoutes` prefix is a path
 * segment on a shared origin, forwarded verbatim for DO ingress to re-match.
 *
 * @param {string} pathname `url.pathname` only — the query is excluded, and
 *   matching is case-sensitive. Both unchanged from the hardcoded branch.
 */
function isOriginRoute(pathname) {
  return topologyConfig.originRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ── Auth0 Tenant ──────────────────────────────────────────────────────
// AUTH0_ORIGIN is defined in csp.js (the module that uses it) and
// re-exported here for backward compatibility with consumers that
// import it from edge-router.js.
export { AUTH0_ORIGIN };

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

    // ── Origin routes → HTTP subrequest to DO App Platform ───────────
    // Prefixes come from routes-config.json's originRoutes (ADR-011: no
    // topology is hardcoded here). /public joins /api on this branch, so it
    // inherits the circuit breaker, rate limiter, forwarded headers,
    // X-Feature-Flags stripping and verbatim path preservation unchanged.
    if (isOriginRoute(url.pathname)) {
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
      // The edge no longer injects feature flags (pipeline deleted, #3349). Strip
      // any inbound X-Feature-Flags so a client can never supply a header the
      // service-side flag plugin would trust — the edge is the only sanctioned
      // source, and it now emits none. (Headers API is case-insensitive.)
      headers.delete("X-Feature-Flags");

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
      return addHeaders(apiResponse, url.pathname, nonce, kvPolicy);
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
