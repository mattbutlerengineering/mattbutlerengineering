import type {
  ApiResponse,
  PaginatedResponse,
  Venue,
  VenueGroup,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export class VenuesClient {
  constructor(private client: ApiClient) {}

  /**
   * List venues with optional filters
   */
  async list(params: { page?: number; limit?: number; venueGroupId?: string } = {}): Promise<PaginatedResponse<Venue>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.venueGroupId) searchParams.set("venueGroupId", params.venueGroupId);

    const query = searchParams.toString();
    return this.client.get<PaginatedResponse<Venue>>(
      `/api/v1/venues${query ? `?${query}` : ""}`
    );
  }

  /**
   * Get a venue by ID
   */
  async get(id: string): Promise<Venue> {
    const response = await this.client.get<ApiResponse<Venue>>(`/api/v1/venues/${id}`);
    return response.data;
  }

  /**
   * Get a venue by slug
   */
  async getBySlug(slug: string): Promise<Venue> {
    const response = await this.client.get<ApiResponse<Venue>>(`/api/v1/venues/by-slug/${slug}`);
    return response.data;
  }

  /**
   * Create a new venue
   */
  async create(data: CreateVenueRequest): Promise<Venue> {
    const response = await this.client.post<ApiResponse<Venue>>("/api/v1/venues", data);
    return response.data;
  }

  /**
   * Update a venue
   */
  async update(id: string, data: UpdateVenueRequest): Promise<Venue> {
    const response = await this.client.patch<ApiResponse<Venue>>(`/api/v1/venues/${id}`, data);
    return response.data;
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
    const response = await this.client.get<ApiResponse<VenueGroup>>(`/api/v1/venues/groups/${id}`);
    return response.data;
  }

  /**
   * Get a venue group by slug
   */
  async getBySlug(slug: string): Promise<VenueGroup> {
    const response = await this.client.get<ApiResponse<VenueGroup>>(`/api/v1/venues/groups/by-slug/${slug}`);
    return response.data;
  }

  /**
   * Create a new venue group
   */
  async create(data: CreateVenueGroupRequest): Promise<VenueGroup> {
    const response = await this.client.post<ApiResponse<VenueGroup>>("/api/v1/venues/groups", data);
    return response.data;
  }

  /**
   * Update a venue group
   */
  async update(id: string, data: UpdateVenueGroupRequest): Promise<VenueGroup> {
    const response = await this.client.patch<ApiResponse<VenueGroup>>(`/api/v1/venues/groups/${id}`, data);
    return response.data;
  }

  /**
   * Delete a venue group
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/venues/groups/${id}`);
  }
}
