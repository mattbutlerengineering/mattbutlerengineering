// OTel SDK must initialize before any other imports — it monkey-patches
// Node's HTTP stack during registration. startServiceServer uses dynamic
// imports internally to guarantee correct ordering.
import { startServiceServer } from "@mbe/database";

const PORT = parseInt(process.env.PORT ?? "3003", 10);

await startServiceServer({
  serviceName: "agent-api",
  port: PORT,
  buildApp: async () => {
    const { buildApp } = await import("./app.js");
    const { startLivenessMonitor } = await import("./services/liveness-monitor.js");
    const fastify = await buildApp();
    startLivenessMonitor(fastify.log);
    return fastify;
  },
  beforeShutdown: async () => {
    const { stopLivenessMonitor } = await import("./services/liveness-monitor.js");
    stopLivenessMonitor();
  },
});
