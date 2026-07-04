import { z } from "zod";
import type { ApiClient } from "./client.js";

export interface ServiceHealth {
  readonly status: string;
  readonly version?: string;
  readonly latency?: number;
}

export interface SystemHealth {
  readonly status: string;
  readonly timestamp: string;
  readonly services?: Record<string, ServiceHealth>;
  readonly staticSites?: Record<string, { status: string }>;
  readonly ci?: { status: string };
  readonly deploy?: { status: string };
}

const serviceHealthSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  latency: z.number().optional(),
});

const systemHealthSchema: z.ZodSchema<SystemHealth> = z.object({
  status: z.string(),
  timestamp: z.string(),
  services: z.record(z.string(), serviceHealthSchema).optional(),
  staticSites: z.record(z.string(), z.object({ status: z.string() })).optional(),
  ci: z.object({ status: z.string() }).optional(),
  deploy: z.object({ status: z.string() }).optional(),
});

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
