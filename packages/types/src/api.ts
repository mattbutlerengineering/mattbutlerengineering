import type { z } from "zod";
import type { ProblemDetailsSchema } from "./schemas/api.js";

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
 * RFC 7807 Problem Details for HTTP APIs.
 * Derived from ProblemDetailsSchema — single source of truth.
 */
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

/**
 * Canonical RFC 9457 problem-detail title for a given HTTP status code.
 *
 * Single source of truth for the "status -> title" mapping — do not
 * re-implement this elsewhere. Unlisted 5xx statuses fall back to
 * "Internal Server Error"; unlisted non-5xx statuses fall back to "Error".
 */
const STATUS_TITLES: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export function titleForStatus(status: number): string {
  if (status in STATUS_TITLES) {
    return STATUS_TITLES[status]!;
  }
  return status >= 500 ? "Internal Server Error" : "Error";
}

/**
 * Creates a standard RFC 7807 Problem Details object.
 */
export function createProblemDetails(
  status: number,
  title: string,
  detail: string,
  type = "about:blank",
  instance?: string,
  extensions?: Record<string, unknown>
): ProblemDetails {
  return {
    type,
    title,
    status,
    detail,
    instance,
    ...extensions,
  };
}

/**
 * Paginated API response.
 * Shape matches the wire format produced by buildPaginatedResponse in @mbe/database.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * Pagination metadata
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
 * Health check response
 */
export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  timestamp: string;
  service?: string;
  checks?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Readiness probe response — returned by /ready endpoints.
 * 200 when all checks pass, 503 during startup or if any check fails.
 */
export interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
  checks: ReadinessCheckStatus[];
}

export interface ReadinessCheckStatus {
  name: string;
  status: "ok" | "error";
  message?: string;
}

/**
 * Individual health check result
 */
export interface HealthCheck {
  name: string;
  status: "ok" | "error";
  message?: string;
  durationMs?: number;
}
