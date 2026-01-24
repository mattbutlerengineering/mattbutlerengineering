export { ApiClient, ApiClientError } from "./client.js";
export type { ClientConfig } from "./client.js";

export { UsersClient } from "./users.js";

import { ApiClient } from "./client.js";
import { UsersClient } from "./users.js";

/**
 * Create a configured API client for the MBE platform
 */
export function createApiClient(config: {
  baseUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
}) {
  const client = new ApiClient({
    baseUrl: config.baseUrl ?? "",
    getAccessToken: config.getAccessToken,
  });

  return {
    client,
    users: new UsersClient(client),
  };
}
