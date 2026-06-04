import type { FastifyBaseLogger } from "fastify";

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

export interface LivenessMonitorConfig {
  inactivityThresholdMs: number;
  checkIntervalMs: number;
  sessionService: {
    findStaleSessions(ms: number): Promise<Array<{ id: string }>>;
    addEvent(id: string, type: string, payload: Record<string, unknown>): Promise<unknown>;
  };
  cancelSession: (id: string) => Promise<boolean>;
}

export interface LivenessMonitor {
  start(logger: FastifyBaseLogger): void;
  stop(): void;
}

export function createLivenessMonitor(config: LivenessMonitorConfig): LivenessMonitor {
  const { inactivityThresholdMs, checkIntervalMs, sessionService, cancelSession } = config;

  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let activeLogger: FastifyBaseLogger | null = null;

  async function checkStaleSessions(): Promise<void> {
    try {
      const staleSessions = await sessionService.findStaleSessions(inactivityThresholdMs);

      for (const session of staleSessions) {
        activeLogger?.warn(
          `[liveness] Session ${session.id} exceeded inactivity threshold — auto-cancelling`
        );

        const cancelled = await cancelSession(session.id);
        if (cancelled) {
          await sessionService.addEvent(session.id, "session:error", {
            message: `Auto-cancelled: exceeded inactivity threshold (${inactivityThresholdMs / 1000}s)`,
            reason: "liveness_timeout",
          });
        }
      }
    } catch (error) {
      activeLogger?.error({ err: error }, "[liveness] Error checking stale sessions");
    }
  }

  return {
    start(logger: FastifyBaseLogger): void {
      if (intervalHandle) return;
      activeLogger = logger;
      intervalHandle = setInterval(() => void checkStaleSessions(), checkIntervalMs);
      logger.info(
        `[liveness] Monitor started (check every ${checkIntervalMs / 1000}s, timeout ${inactivityThresholdMs / 1000}s)`
      );
    },

    stop(): void {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        activeLogger?.info("[liveness] Monitor stopped");
        activeLogger = null;
      }
    },
  };
}
