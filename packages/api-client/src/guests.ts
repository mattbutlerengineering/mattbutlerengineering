import type { z } from "zod";
import type {
  PaginatedResponse,
  Guest,
  GuestSegment,
  LapsingGuest,
  CreateGuestRequest,
  UpdateGuestRequest,
  FindOrCreateGuestBodySchema,
} from "@mbe/types";
import { guestsEndpoints } from "@mbe/types";
import type { ApiClient } from "./client.js";

export type FindOrCreateGuestRequest = z.input<typeof FindOrCreateGuestBodySchema>;

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

/**
 * Guests API. A thin facade over `guestsEndpoints`: every path, method and
 * schema comes from the definition (`ApiClient.call`); this class only keeps
 * the positional signatures callers use and unwraps `{ data }` envelopes.
 */
export class GuestsClient {
  constructor(private client: ApiClient) {}

  /**
   * List guests for a venue
   */
  async list(params: ListGuestsParams): Promise<PaginatedResponse<Guest>> {
    const { venueId, page, limit } = params;
    return this.client.call(guestsEndpoints.list, {
      query: { venueId, page: page?.toString(), limit: limit?.toString() },
    });
  }

  /**
   * Search guests
   */
  async search(params: SearchGuestsParams): Promise<PaginatedResponse<Guest>> {
    const { venueId, query, hasNotVisitedInDays } = params;
    return this.client.call(guestsEndpoints.search, {
      query: { venueId, query, hasNotVisitedInDays: hasNotVisitedInDays?.toString() },
    });
  }

  /**
   * Get guest segments for a venue
   */
  async getSegments(venueId: string): Promise<GuestSegment[]> {
    return (await this.client.call(guestsEndpoints.getSegments, { query: { venueId } })).data;
  }

  /**
   * Get a guest by ID
   */
  async get(id: string): Promise<Guest> {
    return (await this.client.call(guestsEndpoints.get, { params: { id } })).data;
  }

  /**
   * Create a new guest
   */
  async create(data: CreateGuestRequest): Promise<Guest> {
    return (await this.client.call(guestsEndpoints.create, { body: data })).data;
  }

  /**
   * Find or create a guest by email/phone
   */
  async findOrCreate(data: FindOrCreateGuestRequest): Promise<Guest> {
    return (await this.client.call(guestsEndpoints.findOrCreate, { body: data })).data;
  }

  /**
   * Update a guest
   */
  async update(id: string, data: UpdateGuestRequest): Promise<Guest> {
    return (await this.client.call(guestsEndpoints.update, { params: { id }, body: data })).data;
  }

  /**
   * Delete a guest
   */
  async delete(id: string): Promise<void> {
    await this.client.call(guestsEndpoints.delete, { params: { id } });
  }

  /**
   * Add a staff note to a guest
   */
  async addNote(id: string, text: string): Promise<Guest> {
    return (await this.client.call(guestsEndpoints.addNote, { params: { id }, body: { text } }))
      .data;
  }

  /**
   * Get lapsing guests for a venue (on-demand scan)
   */
  async getLapsing(venueId: string): Promise<LapsingGuest[]> {
    return (await this.client.call(guestsEndpoints.getLapsing, { query: { venueId } })).data;
  }

  /**
   * Send a win-back message to a guest
   */
  async sendWinBack(id: string): Promise<{ sent: boolean }> {
    return (await this.client.call(guestsEndpoints.sendWinBack, { params: { id } })).data;
  }
}
