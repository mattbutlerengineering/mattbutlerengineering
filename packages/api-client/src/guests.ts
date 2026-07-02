import { z } from "zod";
import type {
  PaginatedResponse,
  Guest,
  GuestSegment,
  LapsingGuest,
  GuestRiskResult,
  GuestRecognition,
  CreateGuestRequest,
  UpdateGuestRequest,
} from "@mbe/types";
import {
  GuestSchema,
  GuestSegmentSchema,
  GuestRiskResultSchema,
  GuestRecognitionSchema,
  paginatedResponseSchema,
} from "@mbe/types";

export interface FindOrCreateGuestRequest {
  venueId: string;
  email?: string;
  phone?: string;
  name: string;
  dietaryRestrictions?: string[];
}
import type { ApiClient, QueryParams } from "./client.js";

export interface ListGuestsParams {
  page?: number;
  limit?: number;
  venueId: string;
}

export interface SearchGuestsParams {
  venueId: string;
  query?: string;
  hasNotVisitedInDays?: number;
}

export interface GetGuestRiskParams {
  email?: string;
  phone?: string;
}

const guestListSchema: z.ZodSchema<PaginatedResponse<Guest>> = paginatedResponseSchema(GuestSchema);

export class GuestsClient {
  constructor(private client: ApiClient) {}

  /**
   * List guests for a venue
   */
  async list(params: ListGuestsParams): Promise<PaginatedResponse<Guest>> {
    return this.client.get<PaginatedResponse<Guest>>(
      "/api/v1/guests",
      params as unknown as QueryParams,
      guestListSchema
    );
  }

  /**
   * Search guests
   */
  async search(params: SearchGuestsParams): Promise<PaginatedResponse<Guest>> {
    return this.client.get<PaginatedResponse<Guest>>(
      "/api/v1/guests/search",
      params as unknown as QueryParams,
      guestListSchema
    );
  }

  /**
   * Get guest segments for a venue
   */
  async getSegments(venueId: string): Promise<GuestSegment[]> {
    return this.client.getOne<GuestSegment[]>(
      `/api/v1/guests/segments?venueId=${venueId}`,
      undefined,
      z.array(GuestSegmentSchema)
    );
  }

  /**
   * Get a guest by ID
   */
  async get(id: string): Promise<Guest> {
    return this.client.getOne<Guest>(`/api/v1/guests/${id}`, undefined, GuestSchema);
  }

  /**
   * Create a new guest
   */
  async create(data: CreateGuestRequest): Promise<Guest> {
    return this.client.postOne<Guest>("/api/v1/guests", data, GuestSchema);
  }

  /**
   * Find or create a guest by email/phone
   */
  async findOrCreate(data: FindOrCreateGuestRequest): Promise<Guest> {
    return this.client.postOne<Guest>("/api/v1/guests/find-or-create", data, GuestSchema);
  }

  /**
   * Update a guest
   */
  async update(id: string, data: UpdateGuestRequest): Promise<Guest> {
    return this.client.patchOne<Guest>(`/api/v1/guests/${id}`, data, GuestSchema);
  }

  /**
   * Delete a guest
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/guests/${id}`);
  }

  /**
   * Add a staff note to a guest
   */
  async addNote(id: string, text: string): Promise<Guest> {
    return this.client.postOne<Guest>(`/api/v1/guests/${id}/notes`, { text }, GuestSchema);
  }

  /**
   * Get lapsing guests for a venue (on-demand scan)
   */
  async getLapsing(venueId: string): Promise<LapsingGuest[]> {
    return this.client.getOne<LapsingGuest[]>(`/api/v1/guests/lapsing?venueId=${venueId}`);
  }

  /**
   * Send a win-back message to a guest
   */
  async sendWinBack(id: string): Promise<{ sent: boolean }> {
    return this.client.postOne<{ sent: boolean }>(`/api/v1/guests/${id}/win-back`, {});
  }

  /**
   * Get a guest's risk score for a venue by email or phone (unauthenticated
   * booking widget lookup).
   */
  async getRisk(slug: string, params: GetGuestRiskParams): Promise<GuestRiskResult> {
    return this.client.getOne<GuestRiskResult>(
      `/public/v1/venues/${slug}/guest-risk`,
      params as unknown as QueryParams,
      GuestRiskResultSchema
    );
  }

  /**
   * Recognize a guest by email for a venue (unauthenticated booking widget lookup).
   */
  async recognize(slug: string, email: string): Promise<GuestRecognition> {
    return this.client.getOne<GuestRecognition>(
      `/public/v1/venues/${slug}/guests/recognize`,
      { email },
      GuestRecognitionSchema
    );
  }
}
