/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

/**
 * API metadata for responses
 */
export interface ApiMeta {
  timestamp: string;
  requestId?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
  meta?: ApiMeta;
}

/**
 * Pagination info
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * API error response
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  apiVersion?: string;
  successorVersion?: string;
  sunsetDate?: string;
  timestamp: string;
  checks?: Record<string, HealthCheck>;
}

/**
 * Individual health check
 */
export interface HealthCheck {
  status: "ok" | "error";
  message?: string;
  latency?: number;
}

// ── System Health Aggregator Types ──────────────────────────────────

export type SystemStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Aggregated health response from /health/system.
 * Combines service health, static site availability, CI status, and deploy status.
 */
export interface SystemHealthResponse {
  status: SystemStatus;
  timestamp: string;
  subsystems: {
    services: SubsystemHealth<ServiceCheck>;
    static_sites: SubsystemHealth<StaticSiteCheck>;
    ci: CiHealth;
    deploys: DeployHealth;
  };
}

export interface SubsystemHealth<T> {
  status: SystemStatus;
  checks: Record<string, T>;
}

export interface ServiceCheck {
  status: "ok" | "error" | "timeout";
  latency: number;
  version?: string;
  checks?: Record<string, HealthCheck>;
}

export interface StaticSiteCheck {
  status: "ok" | "error" | "timeout";
  latency: number;
}

export interface CiHealth {
  status: "healthy" | "unhealthy" | "stale";
  last_run: CiRunInfo | null;
}

export interface CiRunInfo {
  id: number;
  conclusion: string;
  branch: string;
  sha: string;
  updated_at: string;
}

export interface DeployHealth {
  status: SystemStatus;
  pipelines: Record<string, DeployPipelineInfo | null>;
}

export interface DeployPipelineInfo {
  conclusion: string;
  sha: string;
  updated_at: string;
}
