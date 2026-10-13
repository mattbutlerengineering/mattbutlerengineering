import type {
  GuestRiskResult,
  GuestRecognition,
  WaitlistJoinRequest,
  WaitlistJoinResult,
  WaitlistEstimate,
  CreateDepositPaymentIntentRequest,
  DepositPaymentIntent,
} from "@mbe/types";
import {
  GuestRiskResultSchema,
  GuestRecognitionSchema,
  WaitlistJoinResultSchema,
  WaitlistEstimateSchema,
  DepositPaymentIntentSchema,
} from "@mbe/types";
import { z } from "zod";
import type { ApiClient, QueryParams } from "./client.js";

export interface GetGuestRiskParams {
  email?: string;
  phone?: string;
}

/**
 * Unauthenticated endpoints backing the embeddable public booking widget,
 * all scoped by venue slug. Each method owns its own path construction,
 * schema-validated envelope unwrap, and normalized errors.
 */
export class PublicVenueClient {
  constructor(private client: ApiClient) {}

  /**
   * Whether this guest must pay a deposit, by email or phone.
   * Unwraps `{ data }` and parses `GuestRiskResultSchema`.
   */
  async guestRisk(slug: string, params: GetGuestRiskParams): Promise<GuestRiskResult> {
    return this.client.getOne<GuestRiskResult>(
      `/public/v1/venues/${slug}/guest-risk`,
      params as unknown as QueryParams,
      GuestRiskResultSchema
    );
  }

  /**
   * Recognize a returning guest by email for a venue.
   */
  async recognizeGuest(slug: string, email: string): Promise<GuestRecognition> {
    return this.client.getOne<GuestRecognition>(
      `/public/v1/venues/${slug}/guests/recognize`,
      { email },
      GuestRecognitionSchema
    );
  }

  /**
   * Join a venue's walk-in waitlist.
   */
  async joinWaitlist(slug: string, data: WaitlistJoinRequest): Promise<WaitlistJoinResult> {
    return this.client.postOne<WaitlistJoinResult>(
      `/public/v1/venues/${slug}/waitlist`,
      data,
      WaitlistJoinResultSchema
    );
  }

  /**
   * The guest's live position and wait estimate for their own entry, read with
   * the `statusToken` returned by {@link joinWaitlist}.
   */
  async waitlistEstimate(slug: string, statusToken: string): Promise<WaitlistEstimate> {
    return this.client.getOne<WaitlistEstimate>(
      `/public/v1/venues/${slug}/waitlist/status`,
      { token: statusToken },
      WaitlistEstimateSchema
    );
  }

  /**
   * Create a Stripe PaymentIntent for a reservation's deposit.
   * `sessionId` is the booking session that confirmed the reservation
   * (`api.holds.getSessionId()`), sent as `x-session-id` — the server's
   * proof of ownership (#6304).
   */
  async depositIntent(
    slug: string,
    data: CreateDepositPaymentIntentRequest,
    sessionId: string
  ): Promise<DepositPaymentIntent> {
    const response = await this.client.request(
      `/public/v1/venues/${slug}/deposits/payment-intent`,
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-session-id": sessionId },
      },
      z.object({ data: DepositPaymentIntentSchema })
    );
    return response.data;
  }
}
