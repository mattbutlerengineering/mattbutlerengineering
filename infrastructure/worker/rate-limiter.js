/**
 * In-Worker rate limiter using KV.
 *
 * Tracks request counts per IP per route bucket in KV with TTL.
 * Uses a sliding window approximation with 1-minute buckets.
 *
 * Immutable pattern: all functions return new objects, never mutate.
 */

/**
 * Rate limit configuration per route pattern.
 * Each entry: { pattern, maxRequests, windowSeconds }
 */
const RATE_LIMITS = Object.freeze([
  { pattern: "/api/flags/", maxRequests: 5, windowSeconds: 60 },
  { pattern: "/health/system", maxRequests: 10, windowSeconds: 60 },
  { pattern: "/api/", maxRequests: 100, windowSeconds: 60 },
]);

/**
 * Find the matching rate limit config for a given pathname.
 * Returns the first match (most specific patterns listed first).
 */
function findRateLimit(pathname) {
  return RATE_LIMITS.find((rule) => pathname.startsWith(rule.pattern)) || null;
}

/**
 * Build a KV key for rate limiting.
 * Format: ratelimit:<bucket>:<ip>:<minuteBucket>
 */
function rateLimitKey(pattern, ip, nowMs) {
  const minuteBucket = Math.floor(nowMs / 60_000);
  const sanitizedIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
  const sanitizedPattern = pattern.replace(/\//g, "_");
  return `ratelimit:${sanitizedPattern}:${sanitizedIp}:${minuteBucket}`;
}

/**
 * Check and increment the rate limit counter for a request.
 *
 * Returns { allowed: boolean, remaining: number, limit: number }
 *
 * If no rate limit rule matches the path, returns allowed: true
 * with remaining: -1 (unlimited).
 */
async function checkRateLimit(kv, pathname, ip, nowMs) {
  const rule = findRateLimit(pathname);
  if (!rule) {
    return { allowed: true, remaining: -1, limit: -1 };
  }

  const key = rateLimitKey(rule.pattern, ip, nowMs);

  let count = 0;
  try {
    const stored = await kv.get(key, "text");
    count = stored ? parseInt(stored, 10) : 0;
  } catch {
    // KV read failure — fail open (allow the request)
    return { allowed: true, remaining: rule.maxRequests, limit: rule.maxRequests };
  }

  if (count >= rule.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      limit: rule.maxRequests,
    };
  }

  // Increment counter with TTL
  const newCount = count + 1;
  try {
    await kv.put(key, String(newCount), {
      expirationTtl: rule.windowSeconds,
    });
  } catch {
    // KV write failure — already allowed, just continue
  }

  return {
    allowed: true,
    remaining: rule.maxRequests - newCount,
    limit: rule.maxRequests,
  };
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
