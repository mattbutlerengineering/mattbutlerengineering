import { getApiUrl, getAccessToken } from "./config.js";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorResponse {
  message?: string;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiUrl();
  const token = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: response.statusText }))) as ErrorResponse;
    throw new ApiError(response.status, error.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
