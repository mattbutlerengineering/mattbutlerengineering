import type { FastifyInstance } from "fastify";

export interface StartServiceServerOptions {
  serviceName: string;
  port: number;
  buildApp: () => Promise<FastifyInstance>;
  beforeShutdown?: () => void | Promise<void>;
}

/**
 * Bootstraps a Fastify service with OTel + Sentry telemetry, then listens on
 * the given port.  Handles SIGTERM gracefully and exits with code 1 on startup
 * errors.
 *
 * Telemetry is initialised via dynamic import so that the OTel SDK monkey-
 * patches Node's HTTP stack *before* buildApp() (and its transitive imports)
 * are evaluated — matching the pattern used in each service entry point.
 */
export async function startServiceServer(options: StartServiceServerOptions): Promise<void> {
  const { initTelemetry } = await import("@mbe/observability");
  const { initSentry } = await import("@mbe/sentry/node");

  const sdk = initTelemetry({ serviceName: options.serviceName });
  sdk.start();
  initSentry({ serviceName: options.serviceName });

  const host = process.env.HOST ?? "0.0.0.0";

  try {
    const fastify = await options.buildApp();
    await fastify.listen({ port: options.port, host });
    fastify.log.info(`Server running at http://${host}:${options.port}`);
    fastify.log.info(`API docs at http://${host}:${options.port}/docs`);

    const shutdown = async () => {
      await options.beforeShutdown?.();
      await sdk.shutdown();
      await fastify.close();
    };

    process.on("SIGTERM", () => {
      shutdown().then(() => process.exit(0));
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
