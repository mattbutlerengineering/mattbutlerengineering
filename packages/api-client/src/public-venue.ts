import type {
  GuestRiskResult,
  GuestRecognition,
  WaitlistJoinRequest,
  WaitlistJoinResult,
  CreateDepositPaymentIntentRequest,
  DepositPaymentIntent,
} from "@mbe/types";
import {
  GuestRiskResultSchema,
  GuestRecognitionSchema,
  WaitlistJoinResultSchema,
  DepositPaymentIntentSchema,
} from "@mbe/types";
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
   * Get a guest's risk score for a venue by email or phone.
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
   * Create a Stripe PaymentIntent for a reservation's deposit.
   */
  async depositIntent(
    slug: string,
    data: CreateDepositPaymentIntentRequest
  ): Promise<DepositPaymentIntent> {
    return this.client.postOne<DepositPaymentIntent>(
      `/public/v1/venues/${slug}/deposits/payment-intent`,
      data,
      DepositPaymentIntentSchema
    );
  }
}
