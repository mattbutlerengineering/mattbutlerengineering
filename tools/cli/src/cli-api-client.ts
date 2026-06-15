import { ApiClient } from "@mbe/api-client";
import { getApiUrl, getAccessToken } from "./config.js";

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:3003";

/**
 * Creates an ApiClient configured for the main MBE API.
 * Injects Bearer token from CLI config when available.
 */
export function createCliApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: getApiUrl(),
    getAccessToken: () => getAccessToken() ?? null,
    maxRetries: 0,
  });
}

/**
 * Creates an ApiClient configured for the local agent API service.
 * No auth token — the agent service is unauthenticated.
 */
export function createAgentApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: AGENT_API_URL,
    maxRetries: 0,
  });
}
