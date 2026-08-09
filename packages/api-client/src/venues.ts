import type { z } from "zod";
import type {
  PaginatedResponse,
  Venue,
  VenueGroup,
  PublicVenue,
  PublicVenueConfig,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
} from "@mbe/types";
import {
  VenueSchema,
  VenueGroupSchema,
  PublicVenueSchema,
  PublicVenueConfigSchema,
  paginatedResponseSchema,
} from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

const venueListSchema: z.ZodSchema<PaginatedResponse<Venue>> = paginatedResponseSchema(VenueSchema);
const venueGroupListSchema: z.ZodSchema<PaginatedResponse<VenueGroup>> =
  paginatedResponseSchema(VenueGroupSchema);

export class VenuesClient {
  constructor(private client: ApiClient) {}

  /**
   * List venues with optional filters
   */
  async list(
    params: { page?: number; limit?: number; venueGroupId?: string } = {}
  ): Promise<PaginatedResponse<Venue>> {
    return this.client.get<PaginatedResponse<Venue>>(
      "/api/v1/venues",
      params as QueryParams,
      venueListSchema
    );
  }

  /**
   * Get a venue by ID
   */
  async get(id: string): Promise<Venue> {
    return this.client.getOne<Venue>(`/api/v1/venues/${id}`, undefined, VenueSchema);
  }

  /**
   * Get a venue's curated public projection by slug (safe for anonymous
   * callers — used by the public booking widget). Omits `venueGroup`,
   * `venueGroupId`, and the raw `settings` blob (#4022).
   */
  async getBySlug(slug: string): Promise<PublicVenue> {
    return this.client.getOne<PublicVenue>(
      `/api/v1/venues/by-slug/${slug}`,
      undefined,
      PublicVenueSchema
    );
  }

  /**
   * Create a new venue
   */
  async create(data: CreateVenueRequest): Promise<Venue> {
    return this.client.postOne<Venue>("/api/v1/venues", data, VenueSchema);
  }

  /**
   * Update a venue
   */
  async update(id: string, data: UpdateVenueRequest): Promise<Venue> {
    return this.client.patchOne<Venue>(`/api/v1/venues/${id}`, data, VenueSchema);
  }

  /**
   * Delete a venue
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/venues/${id}`);
  }

  /**
   * Get a venue's public booking-widget config by slug (unauthenticated).
   */
  async getPublicConfig(slug: string): Promise<PublicVenueConfig> {
    return this.client.getOne<PublicVenueConfig>(
      `/public/v1/venues/${slug}`,
      undefined,
      PublicVenueConfigSchema
    );
  }
}

export class VenueGroupsClient {
  constructor(private client: ApiClient) {}

  /**
   * List venue groups
   */
  async list(page = 1, limit = 10): Promise<PaginatedResponse<VenueGroup>> {
    return this.client.get<PaginatedResponse<VenueGroup>>(
      `/api/v1/venues/groups?page=${page}&limit=${limit}`,
      undefined,
      venueGroupListSchema
    );
  }

  /**
   * Get a venue group by ID
   */
  async get(id: string): Promise<VenueGroup> {
    return this.client.getOne<VenueGroup>(
      `/api/v1/venues/groups/${id}`,
      undefined,
      VenueGroupSchema
    );
  }

  /**
   * Get a venue group by slug
   */
  async getBySlug(slug: string): Promise<VenueGroup> {
    return this.client.getOne<VenueGroup>(
      `/api/v1/venues/groups/by-slug/${slug}`,
      undefined,
      VenueGroupSchema
    );
  }

  /**
   * Create a new venue group
   */
  async create(data: CreateVenueGroupRequest): Promise<VenueGroup> {
    return this.client.postOne<VenueGroup>("/api/v1/venues/groups", data, VenueGroupSchema);
  }

  /**
   * Update a venue group
   */
  async update(id: string, data: UpdateVenueGroupRequest): Promise<VenueGroup> {
    return this.client.patchOne<VenueGroup>(`/api/v1/venues/groups/${id}`, data, VenueGroupSchema);
  }

  /**
   * Delete a venue group
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/venues/groups/${id}`);
  }
}
