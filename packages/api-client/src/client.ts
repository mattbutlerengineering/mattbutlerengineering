import type { ApiError } from "@mbe/types";

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

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
      const error = (await response.json().catch(() => ({
        error: "Error",
        message: response.statusText,
        statusCode: response.status,
      }))) as ApiError;
      throw new ApiClientError(error, method, path);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete(path: string): Promise<void> {
    return this.request<void>(path, { method: "DELETE" });
  }
}

export class ApiClientError extends Error {
  constructor(
    public response: ApiError,
    public method?: string,
    public path?: string
  ) {
    const prefix = method && path ? `${method} ${path} failed: ` : "";
    super(`${prefix}${response.statusCode} ${response.message}`);
    this.name = "ApiClientError";
  }

  get statusCode(): number {
    return this.response.statusCode;
  }
}

/**
 * Creates an AbortSignal that fires when either the timeout expires
 * or the caller-provided signal aborts (whichever comes first).
 */
function createCombinedSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal | null
): AbortSignal {
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
