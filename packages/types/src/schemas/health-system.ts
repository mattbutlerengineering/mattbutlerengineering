import { z } from "zod";

/**
 * Canonical contract for the Tier-2 system-health aggregation endpoint
 * (`GET /health/system`), owned here as the single source of truth.
 *
 * The sole producer is the Cloudflare edge router's
 * `infrastructure/worker/health/system.js` handler; the consumer seam is
 * `@mbe/api-client`'s `HealthClient`. Both validate against the schema below
 * so the untyped producer can no longer drift silently. See ADR-009
 * (Health Check Patterns) for the two-tier design and status policy — this
 * schema encodes where the contract lives, not its content.
 *
 * The endpoint returns two variants under one shape:
 *   - **coarse** (unauthenticated): per-subsystem `status` rollups only, no
 *     `migrations` subsystem and no sensitive detail (checks/last_run/pipelines).
 *   - **detailed** (valid `HEALTH_TOKEN` bearer): full subsystem detail.
 * The optional fields below make a single schema accept both.
 */

/** Rollup status for the overall system and most subsystems. */
export const systemHealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);
export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>;

/** Status of an individual service or static-site probe. */
export const probeStatusSchema = z.enum(["ok", "error", "timeout"]);
export type ProbeStatus = z.infer<typeof probeStatusSchema>;

/** CI subsystem rollup — includes `stale` when KV data ages out. */
export const ciStatusSchema = z.enum(["healthy", "unhealthy", "stale"]);
export type CiStatus = z.infer<typeof ciStatusSchema>;

/** Per-service migration check status. */
export const migrationCheckStatusSchema = z.enum(["ok", "error", "stale", "unknown"]);
export type MigrationCheckStatus = z.infer<typeof migrationCheckStatusSchema>;

/**
 * Raw run metadata read verbatim from KV (written by GitHub Actions) for CI,
 * deploy pipelines, and migration runs. The producer passes it through
 * unmodified, so the contract pins only the fields consumers rely on and
 * tolerates extra keys.
 */
export const runInfoSchema = z
  .object({
    conclusion: z.string(),
    updated_at: z.string(),
  })
  .catchall(z.unknown());
export type RunInfo = z.infer<typeof runInfoSchema>;

/** A single service `/health` probe result (detailed responses only). */
export const serviceCheckSchema = z.object({
  status: probeStatusSchema,
  latency: z.number(),
  version: z.string().optional(),
  checks: z.record(z.string(), z.unknown()).optional(),
});
export type ServiceHealthCheck = z.infer<typeof serviceCheckSchema>;

/** A single static-site HEAD probe result (detailed responses only). */
export const staticSiteCheckSchema = z.object({
  status: probeStatusSchema,
  latency: z.number(),
});
export type StaticSiteCheck = z.infer<typeof staticSiteCheckSchema>;

const servicesSubsystemSchema = z.object({
  status: systemHealthStatusSchema,
  checks: z.record(z.string(), serviceCheckSchema).optional(),
});

const staticSitesSubsystemSchema = z.object({
  status: systemHealthStatusSchema,
  checks: z.record(z.string(), staticSiteCheckSchema).optional(),
});

const ciSubsystemSchema = z.object({
  status: ciStatusSchema,
  last_run: runInfoSchema.nullable().optional(),
});

const deploysSubsystemSchema = z.object({
  status: systemHealthStatusSchema,
  pipelines: z.record(z.string(), runInfoSchema.nullable()).optional(),
});

const migrationCheckSchema = z.object({
  status: migrationCheckStatusSchema,
  last_run: runInfoSchema.optional(),
});

const migrationsSubsystemSchema = z.object({
  status: systemHealthStatusSchema,
  checks: z.record(z.string(), migrationCheckSchema),
});

const subsystemsSchema = z.object({
  services: servicesSubsystemSchema,
  static_sites: staticSitesSubsystemSchema,
  ci: ciSubsystemSchema,
  deploys: deploysSubsystemSchema,
  migrations: migrationsSubsystemSchema.optional(),
});

/** The full `GET /health/system` response — the one owner of this contract. */
export const systemHealthSchema = z.object({
  status: systemHealthStatusSchema,
  timestamp: z.string(),
  requestId: z.string(),
  subsystems: subsystemsSchema,
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;
