import { z } from "zod";
import type { WaitlistEntry, CreateWaitlistEntryRequest } from "@mbe/types";
import { WaitlistEntrySchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

const WAITLIST_BASE_PATH = "/api/v1/waitlist";

const waitlistListSchema = z.array(WaitlistEntrySchema);

/**
 * Authenticated staff-facing client for `/api/v1/waitlist` — walk-in queue
 * management (add, list, seat, cancel, notify, expire).
 */
export class WaitlistClient {
  constructor(private client: ApiClient) {}

  /**
   * List waiting entries for a venue
   */
  async list(venueId: string): Promise<WaitlistEntry[]> {
    return this.client.getOne<WaitlistEntry[]>(WAITLIST_BASE_PATH, { venueId }, waitlistListSchema);
  }

  /**
   * Get a waitlist entry by ID
   */
  async get(id: string): Promise<WaitlistEntry> {
    return this.client.getOne<WaitlistEntry>(
      `${WAITLIST_BASE_PATH}/${id}`,
      undefined,
      WaitlistEntrySchema
    );
  }

  /**
   * Add a guest to the waitlist
   */
  async create(data: CreateWaitlistEntryRequest): Promise<WaitlistEntry> {
    return this.client.postOne<WaitlistEntry>(WAITLIST_BASE_PATH, data, WaitlistEntrySchema);
  }

  /**
   * Mark a waitlist entry as seated
   */
  async seat(id: string): Promise<WaitlistEntry> {
    return this.client.putOne<WaitlistEntry>(
      `${WAITLIST_BASE_PATH}/${id}/seat`,
      undefined,
      WaitlistEntrySchema
    );
  }

  /**
   * Cancel a waitlist entry
   */
  async cancel(id: string): Promise<WaitlistEntry> {
    return this.client.putOne<WaitlistEntry>(
      `${WAITLIST_BASE_PATH}/${id}/cancel`,
      undefined,
      WaitlistEntrySchema
    );
  }

  /**
   * Notify a guest their table is ready
   */
  async notify(id: string): Promise<WaitlistEntry> {
    return this.client.putOne<WaitlistEntry>(
      `${WAITLIST_BASE_PATH}/${id}/notify`,
      undefined,
      WaitlistEntrySchema
    );
  }

  /**
   * Mark a waitlist entry as expired
   */
  async expire(id: string): Promise<WaitlistEntry> {
    return this.client.putOne<WaitlistEntry>(
      `${WAITLIST_BASE_PATH}/${id}/expire`,
      undefined,
      WaitlistEntrySchema
    );
  }
}
