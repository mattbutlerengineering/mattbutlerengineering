import { systemHealthSchema } from "@mbe/types";
import type { SystemHealth, ServiceHealthCheck } from "@mbe/types";
import type { ApiClient } from "./client.js";

/**
 * Re-exported from `@mbe/types`, the single owner of the `/health/system`
 * contract. `ServiceHealth` is the per-service probe result carried under
 * `subsystems.services.checks`.
 */
export type { SystemHealth };
export type ServiceHealth = ServiceHealthCheck;

/**
 * The edge Worker answers this by exact match, with no `/api` prefix
 * (`infrastructure/worker/edge-router.js:147`), and it is the path ADR-009
 * ("Tier 2: System Aggregation") and ADR-011 both name as canonical.
 *
 * It was `/api/health/system` until 2026-09-22, which matched nothing: `/api`
 * is an `originRoutes` prefix, so the edge forwarded it verbatim to DO, where
 * no service registers it. The production symptom was a 404 on every poll and
 * an absent admin badge — `SystemHealthBadge` swallows the error and renders
 * null — so nothing was ever red. See
 * `docs/fixes/api-client-route-contract/`.
 *
 * Note the rate-limit bucket differs from `/api/`: 10 req/60 s here against
 * 100 there (`infrastructure/worker/rate-limiter.js:16-17`).
 */
const SYSTEM_HEALTH_PATH = "/health/system";

/**
 * Platform health endpoints. Unlike the resource clients these responses are
 * not `{ data: T }`-enveloped — `system()` returns the bare snapshot matching
 * the `/health/system` contract, schema-validated behind the seam.
 */
export class HealthClient {
  constructor(private client: ApiClient) {}

  /**
   * Get the system-wide health snapshot (admin-only dashboard badge).
   */
  system(): Promise<SystemHealth> {
    return this.client.get<SystemHealth>(SYSTEM_HEALTH_PATH, undefined, systemHealthSchema);
  }
}
