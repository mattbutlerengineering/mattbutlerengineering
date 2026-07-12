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

const SYSTEM_HEALTH_PATH = "/api/health/system";

/**
 * Platform health endpoints. Unlike the resource clients these responses are
 * not `{ data: T }`-enveloped — `system()` returns the bare snapshot matching
 * the `/api/health/system` contract, schema-validated behind the seam.
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
