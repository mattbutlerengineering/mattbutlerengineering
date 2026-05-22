export { ApiClient, ApiClientError } from "./client.js";
export type { ClientConfig, ErrorCategory } from "./client.js";

export { UsersClient } from "./users.js";
export { ReservationsClient, type ListReservationsParams } from "./reservations.js";
export { VenuesClient, VenueGroupsClient } from "./venues.js";
export { TablesClient, type ListTablesParams } from "./tables.js";
export {
  GuestsClient,
  type ListGuestsParams,
  type SearchGuestsParams,
  type FindOrCreateGuestRequest,
} from "./guests.js";
export { FloorPlansClient } from "./floor-plans.js";
export {
  AvailabilityClient,
  HoldsClient,
  type GetTimeSlotsParams,
  type GetDatesParams,
} from "./availability.js";
export { streamNDJSON, type StreamConfig } from "./streaming.js";
export { HealthClient, type SystemHealth, type ServiceHealth } from "./health.js";

import { ApiClient } from "./client.js";
import type { ApiClientError } from "./client.js";
import { UsersClient } from "./users.js";
import { ReservationsClient } from "./reservations.js";
import { VenuesClient, VenueGroupsClient } from "./venues.js";
import { TablesClient } from "./tables.js";
import { GuestsClient } from "./guests.js";
import { FloorPlansClient } from "./floor-plans.js";
import { AvailabilityClient, HoldsClient } from "./availability.js";
import { HealthClient } from "./health.js";

/**
 * Create a configured API client for the MBE platform
 */
export function createApiClient(config: {
  baseUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  timeout?: number;
  maxRetries?: number;
  onError?: (error: ApiClientError) => void;
}) {
  const client = new ApiClient({
    baseUrl: config.baseUrl ?? "",
    getAccessToken: config.getAccessToken,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    onError: config.onError,
  });

  return {
    client,
    users: new UsersClient(client),
    reservations: new ReservationsClient(client),
    venues: new VenuesClient(client),
    venueGroups: new VenueGroupsClient(client),
    tables: new TablesClient(client),
    guests: new GuestsClient(client),
    floorPlans: new FloorPlansClient(client),
    availability: new AvailabilityClient(client),
    holds: new HoldsClient(client),
    health: new HealthClient(client),
  };
}
