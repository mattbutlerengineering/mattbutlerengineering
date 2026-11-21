/**
 * In-Worker rate limiter backed by Cloudflare's Workers Rate Limiting binding
 * (`type: "ratelimit"`).
 *
 * The previous implementation did one Workers KV `put` per counted request.
 * Workers KV's free tier allows 1000 writes/day per ACCOUNT, so ordinary
 * traffic (or anyone who wanted to) exhausted it (error 10048, #9209), which
 * also broke every other KV writer and silently turned the limiter off. The
 * Rate Limiting binding keeps its counters at the edge, with no KV writes.
 *
 * Constraints of the binding that shape this file:
 * - limit and period are fixed per binding (in wrangler.toml / Pulumi), so
 *   every rule owns a binding. `maxRequests` / `windowSeconds` below MUST
 *   equal that binding's `simple` config; scripts/check-rate-limit-bindings.mjs
 *   enforces it across wrangler.toml, pulumi/index.ts and this table.
 * - period must be 10 or 60 seconds.
 * - namespaceId is a unique positive-integer string per limiter in the whole
 *   Cloudflare account. Pick ids that no other Worker uses.
 * - `limit()` returns only `{ success }`; there is no remaining count.
 *
 * Immutable pattern: all functions return new objects, never mutate.
 */

/**
 * Rate limit configuration per route pattern.
 * Each entry: { pattern, binding, namespaceId, maxRequests, windowSeconds }
 */
const RATE_LIMITS = Object.freeze([
  {
    pattern: "/api/flags/",
    binding: "RATE_LIMIT_FLAGS",
    namespaceId: "1001",
    maxRequests: 5,
    windowSeconds: 60,
  },
  {
    pattern: "/health/system",
    binding: "RATE_LIMIT_HEALTH_SYSTEM",
    namespaceId: "1002",
    maxRequests: 10,
    windowSeconds: 60,
  },
  {
    pattern: "/api/",
    binding: "RATE_LIMIT_API",
    namespaceId: "1003",
    maxRequests: 100,
    windowSeconds: 60,
  },
  // Same bound as its /api/ sibling, deliberately — /public/ is the
  // unauthenticated guest surface (booking widget, guest self-service), so it
  // is the one that most needs edge shedding.
  //
  // This limiter runs BEFORE the origin-proxy branch and is keyed by this
  // table, NOT by routes-config.json's originRoutes — so a prefix added there
  // does not become rate limited by being proxied. Measured before this entry
  // existed: /api/v1/venues -> {allowed:false, limit:100} while
  // /public/v1/venues/x -> {allowed:true, limit:-1}. rate-limiter.test.js
  // asserts every originRoutes prefix has an entry here, so the next prefix
  // added cannot repeat that.
  {
    pattern: "/public/",
    binding: "RATE_LIMIT_PUBLIC",
    namespaceId: "1004",
    maxRequests: 100,
    windowSeconds: 60,
  },
  // Unauthenticated, browser-fed CSP report sink (#8895). Real pages send a
  // handful per load (the Reporting API batches); this bounds a flood.
  {
    pattern: "/csp-report",
    binding: "RATE_LIMIT_CSP_REPORT",
    namespaceId: "1005",
    maxRequests: 60,
    windowSeconds: 60,
  },
]);

/**
 * Find the matching rate limit config for a given pathname.
 * Returns the first match (most specific patterns listed first).
 */
function findRateLimit(pathname) {
  return RATE_LIMITS.find((rule) => pathname.startsWith(rule.pattern)) || null;
}

/**
 * Build the per-IP key passed to a rule's binding. Format: <pattern>:<ip>.
 * The binding already isolates rules from each other; the pattern stays in the
 * key so a key is self-describing.
 */
function rateLimitKey(pattern, ip) {
  const sanitizedIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
  const sanitizedPattern = pattern.replace(/\//g, "_");
  return `${sanitizedPattern}:${sanitizedIp}`;
}

// Fail-open reasons already reported by this isolate. A broken binding fails
// every request, so reporting each one would be log noise; one line per
// binding+reason per isolate is enough to be seen. Module-level on purpose.
const reportedFailures = new Set();

function reportFailOpen(rule, reason) {
  const id = `${rule.binding}:${reason}`;
  if (reportedFailures.has(id)) return;
  reportedFailures.add(id);
  console.warn(`Rate limiter failing open for ${rule.pattern}: ${rule.binding} ${reason}`);
}

/**
 * Check and count a request against the matching rule's rate limit binding.
 *
 * Returns { allowed: boolean, remaining: number, limit: number }
 *
 * - No rule matches: allowed, remaining -1, limit -1 (unlimited).
 * - `remaining` is best effort: the binding reports no count, so an allowed
 *   request returns the rule's limit (an upper bound, not a measurement) and
 *   a blocked one returns 0. Nothing may present it to clients as exact.
 * - A missing or throwing binding fails open (allowed), reported once per
 *   isolate via console.warn.
 *
 * @param env Worker env holding the rule bindings (RATE_LIMITS[].binding)
 */
async function checkRateLimit(env, pathname, ip) {
  const rule = findRateLimit(pathname);
  if (!rule) {
    return { allowed: true, remaining: -1, limit: -1 };
  }

  const allowed = { allowed: true, remaining: rule.maxRequests, limit: rule.maxRequests };
  const limiter = env?.[rule.binding];
  if (!limiter || typeof limiter.limit !== "function") {
    reportFailOpen(rule, "binding missing");
    return allowed;
  }

  try {
    const { success } = await limiter.limit({ key: rateLimitKey(rule.pattern, ip) });
    return success ? allowed : { allowed: false, remaining: 0, limit: rule.maxRequests };
  } catch (error) {
    reportFailOpen(rule, `threw: ${error?.message ?? "unknown error"}`);
    return allowed;
  }
}

/**
 * Build a 429 Too Many Requests response with Retry-After header.
 */
function rateLimitResponse(retryAfterSeconds = 60) {
  return new Response(
    JSON.stringify({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    }
  );
}

export { RATE_LIMITS, findRateLimit, rateLimitKey, checkRateLimit, rateLimitResponse };
