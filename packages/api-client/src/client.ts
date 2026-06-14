import type { ApiError } from "@mbe/types";
import { ApiErrorSchema } from "@mbe/types";
import type { z } from "zod";

/**
 * Describes the value types accepted in a query-params object.
 * undefined and null values are omitted; all others are stringified.
 */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function buildQueryString(params: QueryParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;
const JITTER_FACTOR = 0.2;

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

export interface ClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  timeout?: number;
  maxRetries?: number;
  onError?: (error: ApiClientError) => void;
}

export interface RequestOptions extends RequestInit {
  signal?: AbortSignal;
}

export class ApiClient {
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(private config: ClientConfig) {
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async request<T>(
    path: string,
    options: RequestOptions = {},
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    const { baseUrl, getAccessToken } = this.config;
    const method = options.method ?? "GET";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (getAccessToken) {
      const token = await getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const combinedSignal = createCombinedSignal(this.timeout, options.signal);

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: combinedSignal,
    };

    const url = `${baseUrl}${path}`;
    const response = await fetchWithRetry(url, fetchOptions, this.maxRetries);

    if (!response.ok) {
      const raw = await response.json().catch(() => null);
      const parsed = ApiErrorSchema.safeParse(raw);
      // If the response body validates against ApiErrorSchema, use it directly.
      // Otherwise, build a fallback from status line defaults and layer the raw
      // body on top so partial server responses (e.g. { message: "..." }) still
      // propagate their fields — including overriding `detail` with any raw
      // `message` when neither `detail` nor `message` is in the raw body.
      let error: ApiError;
      if (parsed.success) {
        error = parsed.data;
      } else {
        const rawObj =
          typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
        const serverText = (rawObj.detail ?? rawObj.message ?? response.statusText) as string;
        error = {
          error: "Error",
          message: serverText,
          statusCode: response.status,
          type: "about:blank",
          title: "Error",
          status: response.status,
          detail: serverText,
          ...rawObj,
        };
      }
      const clientError = new ApiClientError(error, method, path);
      this.config.onError?.(clientError);
      throw clientError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (schema) {
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new ApiValidationError(result.error, method, path);
      }
      return result.data;
    }

    return data as T;
  }

  get<T>(path: string, params?: QueryParams, schema?: z.ZodSchema<T>): Promise<T> {
    const query = params ? buildQueryString(params) : "";
    return this.request<T>(`${path}${query}`, { method: "GET" }, schema);
  }

  post<T>(path: string, body: unknown, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      schema
    );
  }

  patch<T>(path: string, body: unknown, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
      schema
    );
  }

  delete(path: string): Promise<void> {
    return this.request<void>(path, { method: "DELETE" });
  }

  /**
   * GET + unwrap `.data` from ApiResponse envelope.
   * Use for single-resource endpoints that return `{ data: T }`.
   */
  async getOne<T>(path: string, params?: QueryParams): Promise<T> {
    const response = await this.get<{ data: T }>(path, params);
    return response.data;
  }

  /**
   * POST + unwrap `.data` from ApiResponse envelope.
   * Use for create endpoints that return `{ data: T }`.
   */
  async postOne<T>(path: string, body: unknown): Promise<T> {
    const response = await this.post<{ data: T }>(path, body);
    return response.data;
  }

  /**
   * PATCH + unwrap `.data` from ApiResponse envelope.
   * Use for update endpoints that return `{ data: T }`.
   */
  async patchOne<T>(path: string, body: unknown): Promise<T> {
    const response = await this.patch<{ data: T }>(path, body);
    return response.data;
  }
}

/**
 * Error categories callers can switch on instead of raw status codes.
 */
export type ErrorCategory =
  | "badRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "validationError"
  | "rateLimited"
  | "serverError"
  | "unknown";

function categorizeStatus(code: number): ErrorCategory {
  switch (code) {
    case 400:
      return "badRequest";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 422:
      return "validationError";
    case 429:
      return "rateLimited";
    default:
      if (code >= 500) return "serverError";
      return "unknown";
  }
}

export class ApiClientError extends Error {
  constructor(
    public response: ApiError,
    public method?: string,
    public path?: string
  ) {
    const prefix = method && path ? `${method} ${path} failed: ` : "";
    const status = response.status ?? response.statusCode;
    const message = response.detail ?? response.message;
    super(`${prefix}${status} ${message}`);
    this.name = "ApiClientError";
  }

  get statusCode(): number {
    return this.response.status ?? this.response.statusCode;
  }

  /**
   * Semantic error category derived from HTTP status code.
   * Callers can switch on this instead of raw status codes.
   */
  get category(): ErrorCategory {
    return categorizeStatus(this.statusCode);
  }
}

export class ApiValidationError extends Error {
  constructor(
    public error: z.ZodError,
    public method?: string,
    public path?: string
  ) {
    const prefix = method && path ? `${method} ${path} failed validation: ` : "";
    super(`${prefix}${error.message}`);
    this.name = "ApiValidationError";
  }
}

/**
 * Creates an AbortSignal that fires when either the timeout expires
 * or the caller-provided signal aborts (whichever comes first).
 */
function createCombinedSignal(timeoutMs: number, callerSignal?: AbortSignal | null): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (!callerSignal) {
    return timeoutSignal;
  }

  return AbortSignal.any([timeoutSignal, callerSignal]);
}

/**
 * Returns whether an error is retryable (network errors from fetch).
 */
function isRetryableError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Returns whether an HTTP status code is retryable.
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Calculates exponential backoff with jitter.
 * Base delay doubles each attempt: 1s, 2s, 4s, ...
 * Jitter adds +-20% to prevent thundering herd.
 */
function getBackoffMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = base * JITTER_FACTOR * (2 * Math.random() - 1);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps fetch with retry logic for transient failures.
 * Retries on network errors (TypeError) and 502/503/504 status codes.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        await sleep(getBackoffMs(attempt));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxRetries && isRetryableError(error)) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
      throw error;
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("fetchWithRetry: exhausted all retries");
}
