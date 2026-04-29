import type {
  FloorPlan,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  PaginatedResponse,
} from "@mbe/types";
import { BaseResource } from "./base.js";

export class FloorPlanResource extends BaseResource {
  async list(params: {
    venueId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<FloorPlan>> {
    return this.get<PaginatedResponse<FloorPlan>>("/v1/floor-plans", params);
  }

  async getById(id: string): Promise<FloorPlan> {
    return this.get<FloorPlan>(`/v1/floor-plans/${id}`);
  }

  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    return this.post<FloorPlan>("/v1/floor-plans", data);
  }

  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan> {
    return this.patch<FloorPlan>(`/v1/floor-plans/${id}`, data);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.deleteRequest<{ success: boolean }>(`/v1/floor-plans/${id}`);
  }

  async setActive(id: string): Promise<FloorPlan> {
    return this.post<FloorPlan>(`/v1/floor-plans/${id}/active`);
  }

  async clone(id: string): Promise<FloorPlan> {
    return this.post<FloorPlan>(`/v1/floor-plans/${id}/clone`);
  }
}
