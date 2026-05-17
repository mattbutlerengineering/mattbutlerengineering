import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails } from "@mbe/types";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_CONCURRENT_HOLDS_PER_IP = 3;

interface WindowEntry {
  timestamps: number[];
}

interface HoldCountEntry {
  count: number;
}

export class PublicRateLimitStore {
  private readonly requestWindows = new Map<string, WindowEntry>();
  private readonly holdCounts = new Map<string, HoldCountEntry>();

  private requestKey(ip: string, venueId: string): string {
    return `${ip}:${venueId}`;
  }

  checkRequest(
    ip: string,
    venueId: string,
    now: number = Date.now()
  ): { allowed: boolean; retryAfterMs: number } {
    const key = this.requestKey(ip, venueId);
    const windowStart = now - WINDOW_MS;

    let entry = this.requestWindows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.requestWindows.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldest = entry.timestamps[0]!;
      const retryAfterMs = oldest + WINDOW_MS - now;
      return { allowed: false, retryAfterMs };
    }

    entry.timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  checkAndIncrementHolds(ip: string): { allowed: boolean } {
    const entry = this.holdCounts.get(ip) ?? { count: 0 };
    if (entry.count >= MAX_CONCURRENT_HOLDS_PER_IP) {
      return { allowed: false };
    }
    this.holdCounts.set(ip, { count: entry.count + 1 });
    return { allowed: true };
  }

  decrementHolds(ip: string): void {
    const entry = this.holdCounts.get(ip);
    if (!entry) return;
    const next = entry.count - 1;
    if (next <= 0) {
      this.holdCounts.delete(ip);
    } else {
      this.holdCounts.set(ip, { count: next });
    }
  }

  getHoldCount(ip: string): number {
    return this.holdCounts.get(ip)?.count ?? 0;
  }

  reset(): void {
    this.requestWindows.clear();
    this.holdCounts.clear();
  }
}

export const publicRateLimitStore = new PublicRateLimitStore();

export function extractVenueId(request: FastifyRequest): string | null {
  const query = request.query as Record<string, unknown>;
  if (typeof query.venueId === "string" && query.venueId.length > 0) {
    return query.venueId;
  }
  const body = request.body as Record<string, unknown> | null;
  if (body && typeof body.venueId === "string" && body.venueId.length > 0) {
    return body.venueId;
  }
  const params = request.params as Record<string, unknown>;
  if (typeof params.venueId === "string" && params.venueId.length > 0) {
    return params.venueId;
  }
  return null;
}

function sendRateLimitResponse(reply: FastifyReply, retryAfterSec: number): void {
  const body = JSON.stringify(
    createProblemDetails(429, "Too Many Requests", "Rate limit exceeded. Try again later.")
  );
  reply.hijack();
  reply.raw.writeHead(429, {
    "Content-Type": "application/json",
    "Retry-After": String(retryAfterSec),
    "Content-Length": String(Buffer.byteLength(body)),
  });
  reply.raw.end(body);
}

const publicRateLimitFn: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const ip = request.ip;
    const venueId = extractVenueId(request) ?? "_global";

    const { allowed, retryAfterMs } = publicRateLimitStore.checkRequest(ip, venueId);
    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      sendRateLimitResponse(reply, retryAfterSec);
      return;
    }
    done();
  });
};

// Skip encapsulation so the onRequest hook applies to the parent scope's routes.
(publicRateLimitFn as unknown as Record<symbol, unknown>)[Symbol.for("skip-override")] = true;

export const publicRateLimit = publicRateLimitFn;

export function holdRateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  const ip = request.ip;
  const { allowed } = publicRateLimitStore.checkAndIncrementHolds(ip);
  if (!allowed) {
    reply
      .code(429)
      .header("Retry-After", "60")
      .send(
        createProblemDetails(429, "Too Many Requests", "Too many active holds for this IP address.")
      );
    return;
  }
  done();
}
