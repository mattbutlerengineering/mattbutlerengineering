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
