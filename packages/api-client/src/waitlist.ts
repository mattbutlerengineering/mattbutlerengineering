import type { WaitlistJoinRequest, WaitlistJoinResult } from "@mbe/types";
import { WaitlistJoinResultSchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

export class WaitlistClient {
  constructor(private client: ApiClient) {}

  /**
   * Join a venue's walk-in waitlist (unauthenticated booking widget).
   */
  async join(slug: string, data: WaitlistJoinRequest): Promise<WaitlistJoinResult> {
    return this.client.postOne<WaitlistJoinResult>(
      `/public/v1/venues/${slug}/waitlist`,
      data,
      WaitlistJoinResultSchema
    );
  }
}
