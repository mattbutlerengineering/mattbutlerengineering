import type { ApiError } from "@mbe/types";

export interface ClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
}

export class ApiClient {
  constructor(private config: ClientConfig) {}

  async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const { baseUrl, getAccessToken } = this.config;

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

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({
        error: "Error",
        message: response.statusText,
        statusCode: response.status,
      }))) as ApiError;
      throw new ApiClientError(error);
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
  constructor(public response: ApiError) {
    super(response.message);
    this.name = "ApiClientError";
  }

  get statusCode(): number {
    return this.response.statusCode;
  }
}
