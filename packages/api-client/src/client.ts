import type { ProblemDetails } from "@mbe/types";
import { z } from "zod";
import { retry } from "./retry.js";
import { parseProblemDetails } from "./problem-details.js";

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

/**
 * Per-request overrides for retry and timeout.
 * When provided, these take precedence over the client-wide values.
 */
export interface PerRequestOptions {
  maxRetries?: number;
  timeout?: number;
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
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
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

    const effectiveTimeout = override?.timeout ?? this.timeout;
    const effectiveMaxRetries = override?.maxRetries ?? this.maxRetries;

    const combinedSignal = createCombinedSignal(effectiveTimeout, options.signal);

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: combinedSignal,
    };

    const url = `${baseUrl}${path}`;
    const response = await fetchWithRetry(url, fetchOptions, effectiveMaxRetries);

    if (!response.ok) {
      const raw = await response.json().catch(() => null);
      const problemDetails = parseProblemDetails(raw, response.status);
      const clientError = new ApiClientError(problemDetails, method, path);
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
        const validationError = new ApiValidationError(result.error, method, path);
        // Cast to ApiClientError so onError can observe validation errors too.
        // Callers can narrow with `instanceof ApiValidationError`.
        this.config.onError?.(validationError as unknown as ApiClientError);
        throw validationError;
      }
      return result.data;
    }

    return data as T;
  }

  get<T>(
    path: string,
    params?: QueryParams,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const query = params ? buildQueryString(params) : "";
    return this.request<T>(`${path}${query}`, { method: "GET" }, schema, override);
  }

  post<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      schema,
      override
    );
  }

  patch<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
      schema,
      override
    );
  }

  put<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      schema,
      override
    );
  }

  delete(path: string, override?: PerRequestOptions): Promise<void> {
    return this.request<void>(path, { method: "DELETE" }, undefined, override);
  }

  /**
   * GET + unwrap `.data` from ApiResponse envelope.
   * Use for single-resource endpoints that return `{ data: T }`.
   * Pass a Zod schema to validate the unwrapped value at runtime.
   */
  async getOne<T>(
    path: string,
    params?: QueryParams,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const envelopeSchema = schema ? z.object({ data: schema }) : undefined;
    const response = await this.get<{ data: T }>(path, params, envelopeSchema, override);
    return response.data;
  }

  /**
   * POST + unwrap `.data` from ApiResponse envelope.
   * Use for create endpoints that return `{ data: T }`.
   * Pass a Zod schema to validate the unwrapped value at runtime.
   */
  async postOne<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const envelopeSchema = schema ? z.object({ data: schema }) : undefined;
    const response = await this.post<{ data: T }>(path, body, envelopeSchema, override);
    return response.data;
  }

  /**
   * PATCH + unwrap `.data` from ApiResponse envelope.
   * Use for update endpoints that return `{ data: T }`.
   * Pass a Zod schema to validate the unwrapped value at runtime.
   */
  async patchOne<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const envelopeSchema = schema ? z.object({ data: schema }) : undefined;
    const response = await this.patch<{ data: T }>(path, body, envelopeSchema, override);
    return response.data;
  }

  /**
   * PUT + unwrap `.data` from ApiResponse envelope.
   * Use for state-transition endpoints (e.g. seat/cancel/expire) that return `{ data: T }`.
   * Pass a Zod schema to validate the unwrapped value at runtime.
   */
  async putOne<T>(
    path: string,
    body: unknown,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const envelopeSchema = schema ? z.object({ data: schema }) : undefined;
    const response = await this.put<{ data: T }>(path, body, envelopeSchema, override);
    return response.data;
  }

  /**
   * DELETE + unwrap `.data` from ApiResponse envelope.
   * Use for delete endpoints that return the affected resource as `{ data: T }`
   * (e.g. a soft-delete/cancel that hands back the updated resource).
   * Pass a Zod schema to validate the unwrapped value at runtime.
   */
  async deleteOne<T>(
    path: string,
    schema?: z.ZodSchema<T>,
    override?: PerRequestOptions
  ): Promise<T> {
    const envelopeSchema = schema ? z.object({ data: schema }) : undefined;
    const response = await this.request<{ data: T }>(
      path,
      { method: "DELETE" },
      envelopeSchema,
      override
    );
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
  /**
   * RFC 7807 ProblemDetails — the sole error representation.
   * Always present: synthesized defensively for non-7807 response bodies.
   */
  readonly problemDetails: ProblemDetails;

  constructor(
    problemDetails: ProblemDetails,
    public method?: string,
    public path?: string
  ) {
    const prefix = method && path ? `${method} ${path} failed: ` : "";
    super(`${prefix}${problemDetails.status} ${problemDetails.detail}`);
    this.name = "ApiClientError";
    this.problemDetails = problemDetails;
  }

  /** HTTP status code, derived from the ProblemDetails shape. */
  get statusCode(): number {
    return this.problemDetails.status;
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
 * Wraps fetch with retry logic for transient failures.
 * Retries on network errors (TypeError) and 502/503/504 status codes.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, options);
      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        throw new RetryableStatusError(response);
      }
      return response;
    },
    {
      maxRetries,
      baseDelayMs: BASE_BACKOFF_MS,
      jitter: true,
      isRetryable: (e) => e instanceof TypeError || e instanceof RetryableStatusError,
    }
  ).catch((error) => {
    if (error instanceof RetryableStatusError) return error.response;
    throw error;
  });
}

/** Sentinel error used internally to signal a retryable HTTP status. */
class RetryableStatusError extends Error {
  constructor(public readonly response: Response) {
    super(`Retryable status: ${response.status}`);
    this.name = "RetryableStatusError";
  }
}
