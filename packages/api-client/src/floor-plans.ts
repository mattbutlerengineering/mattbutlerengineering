import { z } from "zod";
import type {
  FloorPlan,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
  BulkUpdateTablePositionsRequest,
  Table,
  PaginatedResponse,
} from "@mbe/types";
import { FloorPlanSchema, TableSchema, paginatedResponseSchema } from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

const floorPlanListSchema: z.ZodSchema<PaginatedResponse<FloorPlan>> =
  paginatedResponseSchema(FloorPlanSchema);

export class FloorPlansClient {
  constructor(private client: ApiClient) {}

  async list(
    params: {
      venueId?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedResponse<FloorPlan>> {
    return this.client.get<PaginatedResponse<FloorPlan>>(
      "/api/v1/floor-plans",
      params as QueryParams,
      floorPlanListSchema
    );
  }

  async getById(id: string): Promise<FloorPlan> {
    return this.client.getOne<FloorPlan>(`/api/v1/floor-plans/${id}`, undefined, FloorPlanSchema);
  }

  /** Alias for getById */
  async get(id: string): Promise<FloorPlan> {
    return this.getById(id);
  }

  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>("/api/v1/floor-plans", data, FloorPlanSchema);
  }

  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan> {
    return this.client.patchOne<FloorPlan>(`/api/v1/floor-plans/${id}`, data, FloorPlanSchema);
  }

  async delete(id: string): Promise<void> {
    return this.client.delete(`/api/v1/floor-plans/${id}`);
  }

  /** Activates this plan and deactivates the venue's others (`POST /:id/activate`). */
  async setActive(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(
      `/api/v1/floor-plans/${id}/activate`,
      {},
      FloorPlanSchema
    );
  }

  /** Alias for setActive */
  async activate(id: string): Promise<FloorPlan> {
    return this.setActive(id);
  }

  /**
   * Bulk-updates table positions. The service registers this under the
   * collection (`POST /floor-plans/tables/positions`) and scopes it by the
   * `floorPlanId` in the body, not by a path segment.
   */
  async bulkUpdatePositions(
    floorPlanId: string,
    positions: UpdateTablePositionRequest[]
  ): Promise<Table[]> {
    const body: BulkUpdateTablePositionsRequest = { floorPlanId, positions };
    return this.client.postOne<Table[]>(
      "/api/v1/floor-plans/tables/positions",
      body,
      z.array(TableSchema)
    );
  }

  async clone(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(`/api/v1/floor-plans/${id}/clone`, {}, FloorPlanSchema);
  }
}
