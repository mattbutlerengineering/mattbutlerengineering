// OTel SDK must initialize before any other imports — it monkey-patches
// Node's HTTP stack during registration. Dynamic import() ensures buildApp
// and all its transitive deps load after the SDK is active.
import { initTelemetry } from "@mbe/observability";
import { initSentry } from "@mbe/observability/sentry/node";

const sdk = initTelemetry({ serviceName: "users-api" });
sdk.start();

initSentry({ serviceName: "users-api" });

process.on("SIGTERM", () => sdk.shutdown().finally(() => process.exit(0)));

const { buildApp } = await import("./app.js");

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const fastify = await buildApp();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server running at http://${HOST}:${PORT}`);
    fastify.log.info(`API docs at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
