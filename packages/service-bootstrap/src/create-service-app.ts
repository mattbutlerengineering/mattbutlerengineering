import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
import { createFeatureFlagsPlugin } from "./feature-flags.js";
import {
  createRequestIdMiddleware,
  errorRatePlugin_,
  createRateLimitMonitor,
  type RateLimitMonitor,
} from "@mbe/observability";
import { createLatencyTracker, type LatencyTracker } from "./health.js";
import { sentryFastifyPlugin } from "@mbe/sentry/node";
import { errorHandlerPlugin } from "./error-handler.js";
import { applyVersioning } from "./apply-versioning.js";
import type { ApiVersioningConfig } from "./apply-versioning.js";
export type { ApiVersioningConfig } from "./apply-versioning.js";

/**
 * Swagger/OpenAPI configuration for the service.
 */
export interface SwaggerConfig {
  readonly title: string;
  readonly description: string;
  readonly serverUrl: string;
  readonly version?: string;
}

/**
 * Configuration for createServiceApp.
 * Services provide only the values that differ; shared bootstrap is handled internally.
 */
export interface ServiceAppConfig {
  /** Swagger/OpenAPI metadata — differs per service */
  readonly swagger: SwaggerConfig;
  /** API versioning — defaults to v1 → v2, sunset in 6 months */
  readonly apiVersioning?: ApiVersioningConfig;
  /** Optional hook to register service-specific JSON schemas before plugins */
  readonly registerSchemas?: (fastify: FastifyInstance) => void;
}

export interface AppOptions {
  logger?: boolean | object;
}

/**
 * Validates CORS origins from the CORS_ORIGINS env var against an allowlist.
 * Accepts *.mattbutlerengineering.com in all environments and localhost
 * origins only in development. Returns only the origins that pass validation.
 */
export function validateCorsOrigins(origins: string[]): string[] {
  const validPatterns = [
    /^https:\/\/([a-z-]+\.)?mattbutlerengineering\.com$/,
    ...(process.env.NODE_ENV === "development" ? [/^http:\/\/localhost:\d+$/] : []),
  ];

  const validated: string[] = [];
  for (const origin of origins) {
    const trimmed = origin.trim();
    if (validPatterns.some((p) => p.test(trimmed))) {
      validated.push(trimmed);
    } else {
      console.warn(`[CORS] Rejected invalid origin from CORS_ORIGINS: ${trimmed}`);
    }
  }
  return validated;
}

/**
 * Resolves the OpenAPI server URL for Swagger "Try it out".
 * In production, API_BASE_URL (set on every DO service) overrides the
 * configured serverUrl. Routes register their full public path prefix
 * (e.g. /api/v1/users), so only the URL's origin is used — API_BASE_URL
 * carries an /api path suffix that would double up if used verbatim.
 * Production-only because the agent service sets API_BASE_URL to a
 * different port in local dev (gen-app links, not this service's origin).
 */
function resolveSwaggerServerUrl(fallbackUrl: string, log: FastifyInstance["log"]): string {
  const base = process.env.API_BASE_URL;
  if (process.env.NODE_ENV !== "production" || !base) return fallbackUrl;
  try {
    return new URL(base).origin;
  } catch {
    log.warn({ apiBaseUrl: base, fallbackUrl }, "API_BASE_URL is not a valid URL; using fallback");
    return fallbackUrl;
  }
}

/**
 * Creates a Fastify application with all shared plugins pre-registered:
 * CORS, request-ID, error-rate tracking, rate-limiting, Swagger/Scalar,
 * Auth0, Sentry, and API versioning.
 *
 * Services call this instead of duplicating ~100 lines of identical bootstrap,
 * then register their own routes on the returned instance.
 */
export async function createServiceApp(
  config: ServiceAppConfig,
  options: AppOptions = {}
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? true,
    disableRequestLogging: true,
    ajv: { customOptions: { strict: false } },
  });

  // Register service-specific schemas (if provided)
  if (config.registerSchemas) {
    config.registerSchemas(fastify);
  }

  // --- CORS ---
  const defaultDevOrigins = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:5173",
    "http://localhost:5174",
  ];
  const prodOrigins = [
    "https://mattbutlerengineering.com",
    "https://hospitality.mattbutlerengineering.com",
    "https://gen.mattbutlerengineering.com",
  ];

  const defaultOrigins = [
    ...prodOrigins,
    ...(process.env.NODE_ENV === "development" ? defaultDevOrigins : []),
  ];

  const envOrigins = process.env.CORS_ORIGINS?.split(",");
  const validatedEnv = envOrigins ? validateCorsOrigins(envOrigins) : null;

  if (validatedEnv && validatedEnv.length === 0) {
    console.warn("[CORS] All CORS_ORIGINS were rejected; falling back to defaults");
  }

  const corsOrigins = validatedEnv && validatedEnv.length > 0 ? validatedEnv : defaultOrigins;

  await fastify.register(cors, {
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // --- Observability ---
  // Propagate X-Request-ID from edge router for distributed tracing
  await fastify.register(createRequestIdMiddleware());

  // Track per-endpoint error rates (exposed via health check)
  await fastify.register(errorRatePlugin_);

  // Parse x-feature-flags once per request; routes use request.features
  await fastify.register(createFeatureFlagsPlugin());

  const rateLimitMonitor = createRateLimitMonitor();
  fastify.decorate("rateLimitMonitor", rateLimitMonitor);

  // Latency tracker for DB ping anomaly detection — shared via fastify decorator
  // so health routes don't need it passed as a parameter
  fastify.decorate("latencyTracker", createLatencyTracker());

  // --- Rate limiting ---
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    onExceeded: (req) => {
      const ip = req.ip;
      const endpoint = req.url;
      rateLimitMonitor.recordHit(ip, endpoint);
      req.log.warn({ ip, endpoint, timestamp: new Date().toISOString() }, "Rate limit exceeded");
    },
  });

  // --- Swagger / OpenAPI ---
  const swaggerVersion = config.swagger.version ?? "1.0.0";
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: config.swagger.title,
        description: config.swagger.description,
        version: swaggerVersion,
      },
      servers: [{ url: resolveSwaggerServerUrl(config.swagger.serverUrl, fastify.log) }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  await fastify.register(ScalarApiReference, {
    routePrefix: "/reference",
    configuration: {
      content: () => fastify.swagger(),
    },
  });

  // --- Auth ---
  if (process.env.AUTH_AUTHORITY && process.env.AUTH_AUDIENCE) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production");
  } else {
    fastify.log.warn("Skipping Auth0 plugin registration (dev/test mode)");
  }

  // --- Sentry ---
  // Register Sentry error handler (no-op without SENTRY_DSN)
  await fastify.register(sentryFastifyPlugin);

  // --- Error Handler (RFC 7807) ---
  await fastify.register(errorHandlerPlugin);

  // --- API Versioning ---
  // Policy (successor computation, sunset headers, deprecation decorators) is
  // governed by ADR-002 and lives in apply-versioning.ts.
  applyVersioning(fastify, config.apiVersioning);

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    rateLimitMonitor: RateLimitMonitor;
    latencyTracker: LatencyTracker;
  }
}
