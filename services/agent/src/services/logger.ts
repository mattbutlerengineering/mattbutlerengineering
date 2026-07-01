import type { FastifyBaseLogger } from "fastify";
import type { SessionLifecycleLogger } from "@mbe/agent-core";

/**
 * Process-wide structured logger seam for code that runs outside a Fastify
 * request context — the session executor singleton and `triggerSession`'s
 * fire-and-forget execution catch. Defaults to a `console.error`-backed
 * logger until the real Fastify (pino) logger is wired in from `src/index.ts`
 * at boot, via `setServiceLogger`, before the server accepts any requests.
 */
let activeLogger: SessionLifecycleLogger = {
  error: (meta, message) => console.error(meta, message),
};

/** Wire the real service logger in. Call once at boot (see src/index.ts). */
export function setServiceLogger(logger: FastifyBaseLogger): void {
  activeLogger = { error: (meta, message) => logger.error(meta, message) };
}

export function getServiceLogger(): SessionLifecycleLogger {
  return activeLogger;
}
