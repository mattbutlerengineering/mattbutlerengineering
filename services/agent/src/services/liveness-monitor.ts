import type { FastifyBaseLogger } from "fastify";
import { DEFAULT_HEARTBEAT_CONFIG } from "@mbe/agent-core";
import { sessionService } from "./session.js";
import { cancelSession } from "./session-executor.js";

/**
 * Background liveness monitor for agent sessions.
 *
 * Periodically checks all RUNNING sessions for inactivity. If a session
 * has no events for longer than the inactivity timeout, it is auto-cancelled
 * with a descriptive error.
 *
 * The session-runner also has its own heartbeat timer that aborts the SDK
 * query loop on inactivity. This monitor is a server-side safety net for
 * cases where the runner itself hangs (e.g., process crash, network partition).
 */

const CHECK_INTERVAL_MS = 120_000; // 2 minutes
const INACTIVITY_THRESHOLD_MS = DEFAULT_HEARTBEAT_CONFIG.inactivityTimeoutMs;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let activeLogger: FastifyBaseLogger | null = null;

async function checkStaleSessions(): Promise<void> {
  try {
    const staleSessions = await sessionService.findStaleSessions(INACTIVITY_THRESHOLD_MS);

    for (const session of staleSessions) {
      activeLogger?.warn(
        `[liveness] Session ${session.id} exceeded inactivity threshold — auto-cancelling`
      );

      const cancelled = await cancelSession(session.id);
      if (cancelled) {
        await sessionService.addEvent(session.id, "session:error", {
          message: `Auto-cancelled: exceeded inactivity threshold (${INACTIVITY_THRESHOLD_MS / 1000}s)`,
          reason: "liveness_timeout",
        });
      }
    }
  } catch (error) {
    activeLogger?.error({ err: error }, "[liveness] Error checking stale sessions");
  }
}

export function startLivenessMonitor(logger: FastifyBaseLogger): void {
  if (intervalHandle) return;
  activeLogger = logger;
  intervalHandle = setInterval(checkStaleSessions, CHECK_INTERVAL_MS);
  logger.info(
    `[liveness] Monitor started (check every ${CHECK_INTERVAL_MS / 1000}s, timeout ${INACTIVITY_THRESHOLD_MS / 1000}s)`
  );
}

export function stopLivenessMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    activeLogger?.info("[liveness] Monitor stopped");
    activeLogger = null;
  }
}
