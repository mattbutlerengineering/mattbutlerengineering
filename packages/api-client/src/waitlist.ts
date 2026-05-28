import type { CreateWaitlistEntryRequest, JoinWaitlistResponse, WaitlistEstimate } from "@mbe/types";
import type { ApiClient } from "./client.js";

export interface GetWaitlistEstimateParams {
  venueId: string;
  date: string;
  partySize: number;
}

export class WaitlistClient {
  constructor(private client: ApiClient) {}

  async join(data: CreateWaitlistEntryRequest): Promise<JoinWaitlistResponse> {
    return this.client.postOne<JoinWaitlistResponse>("/api/v1/waitlist", data);
  }

  async getEstimate(params: GetWaitlistEstimateParams): Promise<WaitlistEstimate> {
    const searchParams = new URLSearchParams();
    searchParams.set("venueId", params.venueId);
    searchParams.set("date", params.date);
    searchParams.set("partySize", String(params.partySize));
    return this.client.getOne<WaitlistEstimate>(
      `/api/v1/waitlist/estimate?${searchParams.toString()}`
    );
  }
}
