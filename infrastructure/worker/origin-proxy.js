/**
 * Origin proxy: forwards /api and /public requests to the DO origin.
 *
 * Owns everything between "this path is an origin route" and "here is the
 * response": the per-service circuit breaker (read -> decide -> persist),
 * forwarded-header construction, and error rendering. Origin routes speak
 * Problem Details (ADR-008), so every failure here is application/problem+json
 * and a service's own problem+json 5xx body passes through untouched.
 */
import {
  CIRCUIT_BREAKER_KEY_PREFIX,
  getCircuitState,
  saveCircuitState,
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
} from "./circuit-breaker.js";
import { addHeaders } from "./response-formatter.js";

const PROBLEM_JSON = "application/problem+json";

// Mirrors the DO ingress order in infrastructure/pulumi/index.ts: the more
// specific prefixes win, everything else (/api, /public) is reservations.
const SERVICE_PREFIXES = [
  { prefix: "/api/v1/users", service: "users" },
  { prefix: "/api/gen", service: "agent" },
];
const DEFAULT_SERVICE = "reservations";

function serviceFor(pathname) {
  const match = SERVICE_PREFIXES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return match ? match.service : DEFAULT_SERVICE;
}

function problemResponse(status, title, requestId) {
  return new Response(JSON.stringify({ type: "about:blank", title, status, requestId }), {
    status,
    headers: { "Content-Type": PROBLEM_JSON },
  });
}

function buildForwardRequest(request, url, env, requestId) {
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set("Host", target.host);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");
  headers.set("X-Request-ID", requestId);
  // The edge no longer injects feature flags (pipeline deleted, #3349). Strip
  // any inbound X-Feature-Flags so a client can never supply a header the
  // service-side flag plugin would trust. (Headers API is case-insensitive.)
  headers.delete("X-Feature-Flags");
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
}

/**
 * Proxy an origin-route request through the service's circuit breaker.
 *
 * @param {Request} request
 * @param {URL} url
 * @param {object} env Worker env (API_ORIGIN, HEALTH_STATE)
 * @param {{requestId: string, nonce: string, kvPolicy: unknown, onResponse?: (status: number) => void}} ctx
 */
async function proxyToOrigin(request, url, env, ctx) {
  const { requestId, nonce, kvPolicy, onResponse } = ctx;
  const key = `${CIRCUIT_BREAKER_KEY_PREFIX}${serviceFor(url.pathname)}`;
  const finish = (response) => addHeaders(response, url.pathname, nonce, kvPolicy);

  const stored = await getCircuitState(env.HEALTH_STATE, key);
  const { allowed, updatedState } = shouldAllowRequest(stored, Date.now());
  const current = updatedState ?? stored;
  if (updatedState) await saveCircuitState(env.HEALTH_STATE, key, updatedState);

  if (!allowed) {
    return finish(problemResponse(503, "Service temporarily unavailable", requestId));
  }

  let response;
  try {
    response = await fetch(buildForwardRequest(request, url, env, requestId));
  } catch (error) {
    console.error("API proxy error:", error.message);
    await saveCircuitState(env.HEALTH_STATE, key, recordFailure(current, Date.now()));
    return finish(problemResponse(503, "Service unreachable", requestId));
  }

  if (response.status >= 500) {
    await saveCircuitState(env.HEALTH_STATE, key, recordFailure(current, Date.now()));
    const isProblem = (response.headers.get("Content-Type") ?? "").includes(PROBLEM_JSON);
    return finish(
      isProblem ? response : problemResponse(response.status, "Service error", requestId)
    );
  }

  if (current.state !== "closed" || current.failures > 0) {
    await saveCircuitState(env.HEALTH_STATE, key, recordSuccess(current));
  }

  // 4xx passes through so the app can render its own error pages.
  onResponse?.(response.status);
  return finish(response);
}

export { proxyToOrigin };
