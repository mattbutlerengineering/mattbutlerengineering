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

async function checkStaleSessions(): Promise<void> {
  try {
    const runningSessions = await sessionService.findByStatus("RUNNING");
    const now = Date.now();

    for (const session of runningSessions) {
      const lastEvent = await sessionService.getLastEvent(session.id);
      const lastActivityAt = lastEvent?.createdAt ?? session.updatedAt;
      const silenceMs = now - new Date(lastActivityAt).getTime();

      if (silenceMs >= INACTIVITY_THRESHOLD_MS) {
        console.warn(
          `[liveness] Session ${session.id} has been inactive for ${Math.round(silenceMs / 1000)}s — auto-cancelling`
        );

        const cancelled = await cancelSession(session.id);
        if (cancelled) {
          await sessionService.addEvent(session.id, "session:error", {
            message: `Auto-cancelled: no activity for ${Math.round(silenceMs / 1000)}s (threshold: ${INACTIVITY_THRESHOLD_MS / 1000}s)`,
            reason: "liveness_timeout",
          });
        }
      }
    }
  } catch (error) {
    console.error("[liveness] Error checking stale sessions:", error);
  }
}

export function startLivenessMonitor(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(checkStaleSessions, CHECK_INTERVAL_MS);
  console.log(
    `[liveness] Monitor started (check every ${CHECK_INTERVAL_MS / 1000}s, timeout ${INACTIVITY_THRESHOLD_MS / 1000}s)`
  );
}

export function stopLivenessMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[liveness] Monitor stopped");
  }
}
