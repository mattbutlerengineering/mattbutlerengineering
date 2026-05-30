import type {
  PaginatedResponse,
  Guest,
  GuestSegment,
  LapsingGuest,
  CreateGuestRequest,
  UpdateGuestRequest,
} from "@mbe/types";

export interface FindOrCreateGuestRequest {
  venueId: string;
  email?: string;
  phone?: string;
  name: string;
  dietaryRestrictions?: string[];
}
import type { ApiClient } from "./client.js";

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

export class GuestsClient {
  constructor(private client: ApiClient) {}

  /**
   * List guests for a venue
   */
  async list(params: ListGuestsParams): Promise<PaginatedResponse<Guest>> {
    const searchParams = new URLSearchParams();
    searchParams.set("venueId", params.venueId);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));

    return this.client.get<PaginatedResponse<Guest>>(`/api/v1/guests?${searchParams.toString()}`);
  }

  /**
   * Search guests
   */
  async search(params: SearchGuestsParams): Promise<PaginatedResponse<Guest>> {
    const searchParams = new URLSearchParams();
    searchParams.set("venueId", params.venueId);
    if (params.query) searchParams.set("query", params.query);
    if (params.hasNotVisitedInDays) {
      searchParams.set("hasNotVisitedInDays", String(params.hasNotVisitedInDays));
    }

    return this.client.get<PaginatedResponse<Guest>>(
      `/api/v1/guests/search?${searchParams.toString()}`
    );
  }

  /**
   * Get guest segments for a venue
   */
  async getSegments(venueId: string): Promise<GuestSegment[]> {
    return this.client.getOne<GuestSegment[]>(`/api/v1/guests/segments?venueId=${venueId}`);
  }

  /**
   * Get a guest by ID
   */
  async get(id: string): Promise<Guest> {
    return this.client.getOne<Guest>(`/api/v1/guests/${id}`);
  }

  /**
   * Create a new guest
   */
  async create(data: CreateGuestRequest): Promise<Guest> {
    return this.client.postOne<Guest>("/api/v1/guests", data);
  }

  /**
   * Find or create a guest by email/phone
   */
  async findOrCreate(data: FindOrCreateGuestRequest): Promise<Guest> {
    return this.client.postOne<Guest>("/api/v1/guests/find-or-create", data);
  }

  /**
   * Update a guest
   */
  async update(id: string, data: UpdateGuestRequest): Promise<Guest> {
    return this.client.patchOne<Guest>(`/api/v1/guests/${id}`, data);
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
    return this.client.postOne<Guest>(`/api/v1/guests/${id}/notes`, { text });
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
}
