import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
import {
  createRequestIdMiddleware,
  errorRatePlugin_,
  createRateLimitMonitor,
} from "@mbe/observability";
import { sentryFastifyPlugin } from "@mbe/sentry/node";

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
 * API versioning configuration.
 */
export interface ApiVersioningConfig {
  readonly currentVersion: string;
  readonly successorVersion: string;
  readonly sunsetMonthsFromNow: number;
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

  const rateLimitMonitor = createRateLimitMonitor();
  fastify.decorate("rateLimitMonitor", rateLimitMonitor);

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
      servers: [{ url: config.swagger.serverUrl }],
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

  // --- API Versioning (inlined from @mbe/api-versioning) ---
  const {
    currentVersion,
    successorVersion: configuredSuccessorVersion,
    sunsetMonthsFromNow = 6,
  } = config.apiVersioning ?? {
    currentVersion: "v1",
    successorVersion: "v2",
    sunsetMonthsFromNow: 6,
  };

  const successorVersion =
    configuredSuccessorVersion !== undefined
      ? configuredSuccessorVersion
      : (() => {
          const match = currentVersion.match(/^v(\d+)$/);
          if (match) {
            return `v${parseInt(match[1], 10) + 1}`;
          }
          return undefined;
        })();

  const sunsetDate = (() => {
    const date = new Date();
    date.setMonth(date.getMonth() + sunsetMonthsFromNow);
    return date.toUTCString();
  })();

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("API-Version", currentVersion);
    if (successorVersion) {
      const path = request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("addDeprecationHeaders", (reply: FastifyReply) => {
    reply.header("Deprecation", "true");
    reply.header("Sunset", sunsetDate);
    if (successorVersion) {
      const path = reply.request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("apiVersion", currentVersion);
  fastify.decorate("successorVersion", successorVersion);
  fastify.decorate("sunsetDate", sunsetDate);

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    apiVersion: string;
    successorVersion?: string;
    sunsetDate: string;
    addDeprecationHeaders: (reply: FastifyReply) => void;
  }
}
