import type { FastifyInstance } from "fastify";

export interface StartServiceServerOptions {
  serviceName: string;
  port: number;
  buildApp: () => Promise<FastifyInstance>;
  beforeShutdown?: () => void | Promise<void>;
}

/**
 * Upper bound on how long graceful shutdown (beforeShutdown -> fastify.close
 * -> sdk.shutdown) may take before the process force-exits instead of waiting
 * for SIGKILL. This repo's Pulumi app spec (infrastructure/pulumi/index.ts)
 * does not set a custom `termination_grace_period_seconds`, so DigitalOcean
 * App Platform's own SIGTERM->SIGKILL grace period applies. 10s is chosen to
 * leave headroom under that window while still giving connection-draining
 * and telemetry flush a real chance to finish.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Rejects with `message` after `ms`, without keeping the process alive. */
function delayReject(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    timer.unref?.();
  });
}

/**
 * Bootstraps a Fastify service with OTel + Sentry telemetry, then listens on
 * the given port. Handles SIGTERM and SIGINT gracefully — draining in-flight
 * requests (fastify.close()) before telemetry is shut down, so the drain
 * window itself is still traced — and exits with code 1 on startup errors.
 * A rejection anywhere in the shutdown chain, or a shutdown that overruns
 * SHUTDOWN_TIMEOUT_MS, still forces a non-zero exit rather than hanging.
 * Repeated signals are a no-op once a shutdown is already in flight.
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

    let shutdownStarted = false;

    const runShutdown = async () => {
      await options.beforeShutdown?.();
      await fastify.close();
      await sdk.shutdown();
    };

    const handleShutdownSignal = (signal: NodeJS.Signals): Promise<void> => {
      if (shutdownStarted) return Promise.resolve();
      shutdownStarted = true;

      return Promise.race([
        runShutdown(),
        delayReject(SHUTDOWN_TIMEOUT_MS, `shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms`),
      ]).then(
        () => process.exit(0),
        (err: unknown) => {
          fastify.log.error(err, `graceful shutdown on ${signal} failed`);
          process.exit(1);
        }
      );
    };

    process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
    process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
