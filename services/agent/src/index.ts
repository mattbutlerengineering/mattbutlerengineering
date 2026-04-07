// OTel SDK must initialize before any other imports — it monkey-patches
// Node's HTTP stack during registration. Dynamic import() ensures buildApp
// and all its transitive deps load after the SDK is active.
import { initTelemetry } from "@mbe/observability";
import { initSentry } from "@mbe/sentry/node";

const sdk = initTelemetry({ serviceName: "agent-api" });
sdk.start();

initSentry({ serviceName: "agent-api" });

const { buildApp } = await import("./app.js");
const { startLivenessMonitor, stopLivenessMonitor } = await import(
  "./services/liveness-monitor.js"
);

const PORT = parseInt(process.env.PORT ?? "3003", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const fastify = await buildApp();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server running at http://${HOST}:${PORT}`);
    fastify.log.info(`API docs at http://${HOST}:${PORT}/docs`);

    startLivenessMonitor();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  stopLivenessMonitor();
  sdk.shutdown().finally(() => process.exit(0));
});

main();
