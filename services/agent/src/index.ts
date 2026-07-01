// OTel SDK must initialize before any other imports — it monkey-patches
// Node's HTTP stack during registration. startServiceServer uses dynamic
// imports internally to guarantee correct ordering.
import { startServiceServer } from "@mbe/service-bootstrap";

const PORT = parseInt(process.env.PORT ?? "3003", 10);

await startServiceServer({
  serviceName: "agent-api",
  port: PORT,
  buildApp: async () => {
    const { buildApp } = await import("./app.js");
    const { createLivenessMonitor } = await import("./services/liveness-monitor.js");
    const { sessionService } = await import("./services/session.js");
    const { cancelSession } = await import("./services/session-executor.js");
    const { setServiceLogger } = await import("./services/logger.js");
    const { DEFAULT_HEARTBEAT_CONFIG } = await import("@mbe/agent-core");
    const fastify = await buildApp();
    // Wire the real structured logger before the server accepts any requests —
    // session-executor.ts and session.ts fall back to console.error otherwise.
    setServiceLogger(fastify.log);
    const monitor = createLivenessMonitor({
      inactivityThresholdMs: DEFAULT_HEARTBEAT_CONFIG.inactivityTimeoutMs,
      checkIntervalMs: 120_000,
      sessionService,
      cancelSession,
    });
    fastify.addHook("onReady", () => {
      monitor.start(fastify.log);
    });
    fastify.addHook("onClose", () => {
      monitor.stop();
    });
    return fastify;
  },
});
