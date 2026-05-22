import type {
  FloorPlan,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
  Table,
  PaginatedResponse,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export class FloorPlansClient {
  constructor(private client: ApiClient) {}

  async list(
    params: {
      venueId?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedResponse<FloorPlan>> {
    const searchParams = new URLSearchParams();
    if (params.venueId) searchParams.set("venueId", params.venueId);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));

    const query = searchParams.toString();
    return this.client.get<PaginatedResponse<FloorPlan>>(
      `/api/v1/floor-plans${query ? `?${query}` : ""}`
    );
  }

  async getById(id: string): Promise<FloorPlan> {
    return this.client.getOne<FloorPlan>(`/api/v1/floor-plans/${id}`);
  }

  /** Alias for getById */
  async get(id: string): Promise<FloorPlan> {
    return this.getById(id);
  }

  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>("/api/v1/floor-plans", data);
  }

  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan> {
    return this.client.patchOne<FloorPlan>(`/api/v1/floor-plans/${id}`, data);
  }

  async delete(id: string): Promise<void> {
    return this.client.delete(`/api/v1/floor-plans/${id}`);
  }

  async setActive(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(`/api/v1/floor-plans/${id}/active`, undefined);
  }

  /** Alias for setActive */
  async activate(id: string): Promise<FloorPlan> {
    return this.setActive(id);
  }

  async bulkUpdatePositions(
    floorPlanId: string,
    positions: UpdateTablePositionRequest[]
  ): Promise<Table[]> {
    return this.client.postOne<Table[]>(
      `/api/v1/floor-plans/${floorPlanId}/bulk-update-positions`,
      positions
    );
  }

  async clone(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(`/api/v1/floor-plans/${id}/clone`, undefined);
  }
}
