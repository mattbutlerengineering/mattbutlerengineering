import type { preHandlerHookHandler } from "fastify";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipVenueMap = new Map<string, RateLimitEntry>();
const holdCountMap = new Map<string, number>();

const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_ACTIVE_HOLDS = 3;
const WINDOW_MS = 60_000;

function getKey(ip: string, venueSlug: string): string {
  return `${ip}:${venueSlug}`;
}

function isRateLimited(ip: string, venueSlug: string): { limited: boolean; retryAfter: number } {
  const key = getKey(ip, venueSlug);
  const now = Date.now();
  const entry = ipVenueMap.get(key);

  if (!entry || now >= entry.resetAt) {
    ipVenueMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  entry.count += 1;
  return { limited: false, retryAfter: 0 };
}

export function getActiveHoldCount(ip: string): number {
  return holdCountMap.get(ip) ?? 0;
}

export function incrementHoldCount(ip: string): void {
  holdCountMap.set(ip, (holdCountMap.get(ip) ?? 0) + 1);
}

export function decrementHoldCount(ip: string): void {
  const current = holdCountMap.get(ip) ?? 0;
  if (current <= 1) {
    holdCountMap.delete(ip);
  } else {
    holdCountMap.set(ip, current - 1);
  }
}

export { MAX_ACTIVE_HOLDS };

export const publicRateLimitHook: preHandlerHookHandler = async (request, reply) => {
  const ip = request.ip;
  const urlParts = request.url.split("/");
  const venueIdx = urlParts.indexOf("venues");
  const venueSlug = venueIdx >= 0 ? (urlParts[venueIdx + 1]?.split("?")[0] ?? "global") : "global";

  const { limited, retryAfter } = isRateLimited(ip, venueSlug);
  if (limited) {
    reply.header("Retry-After", retryAfter);
    return reply.status(429).send({
      type: "https://httpproblems.com/http-status/429",
      title: "Too Many Requests",
      status: 429,
      detail: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      retryAfter,
    });
  }
};

export function resetRateLimitState(): void {
  ipVenueMap.clear();
  holdCountMap.clear();
}
