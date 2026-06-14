import type {
  PaginatedResponse,
  Venue,
  VenueGroup,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
} from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

export class VenuesClient {
  constructor(private client: ApiClient) {}

  /**
   * List venues with optional filters
   */
  async list(
    params: { page?: number; limit?: number; venueGroupId?: string } = {}
  ): Promise<PaginatedResponse<Venue>> {
    return this.client.get<PaginatedResponse<Venue>>("/api/v1/venues", params as QueryParams);
  }

  /**
   * Get a venue by ID
   */
  async get(id: string): Promise<Venue> {
    return this.client.getOne<Venue>(`/api/v1/venues/${id}`);
  }

  /**
   * Get a venue by slug
   */
  async getBySlug(slug: string): Promise<Venue> {
    return this.client.getOne<Venue>(`/api/v1/venues/by-slug/${slug}`);
  }

  /**
   * Create a new venue
   */
  async create(data: CreateVenueRequest): Promise<Venue> {
    return this.client.postOne<Venue>("/api/v1/venues", data);
  }

  /**
   * Update a venue
   */
  async update(id: string, data: UpdateVenueRequest): Promise<Venue> {
    return this.client.patchOne<Venue>(`/api/v1/venues/${id}`, data);
  }

  /**
   * Delete a venue
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/venues/${id}`);
  }
}

export class VenueGroupsClient {
  constructor(private client: ApiClient) {}

  /**
   * List venue groups
   */
  async list(page = 1, limit = 10): Promise<PaginatedResponse<VenueGroup>> {
    return this.client.get<PaginatedResponse<VenueGroup>>(
      `/api/v1/venues/groups?page=${page}&limit=${limit}`
    );
  }

  /**
   * Get a venue group by ID
   */
  async get(id: string): Promise<VenueGroup> {
    return this.client.getOne<VenueGroup>(`/api/v1/venues/groups/${id}`);
  }

  /**
   * Get a venue group by slug
   */
  async getBySlug(slug: string): Promise<VenueGroup> {
    return this.client.getOne<VenueGroup>(`/api/v1/venues/groups/by-slug/${slug}`);
  }

  /**
   * Create a new venue group
   */
  async create(data: CreateVenueGroupRequest): Promise<VenueGroup> {
    return this.client.postOne<VenueGroup>("/api/v1/venues/groups", data);
  }

  /**
   * Update a venue group
   */
  async update(id: string, data: UpdateVenueGroupRequest): Promise<VenueGroup> {
    return this.client.patchOne<VenueGroup>(`/api/v1/venues/groups/${id}`, data);
  }

  /**
   * Delete a venue group
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/venues/groups/${id}`);
  }
}
