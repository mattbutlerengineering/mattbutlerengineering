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

export class HealthClient {
  constructor(private client: ApiClient) {}

  /**
   * Get system-wide health status (admin only)
   */
  async getSystemHealth(): Promise<SystemHealth> {
    return this.client.get<SystemHealth>("/api/health/system");
  }
}
