import type {
  FloorPlan,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  PaginatedResponse,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export class FloorPlansClient {
  constructor(private client: ApiClient) {}

  async list(params: {
    venueId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<FloorPlan>> {
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
    const response = await this.client.get<{ data: FloorPlan }>(`/api/v1/floor-plans/${id}`);
    return response.data;
  }

  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    const response = await this.client.post<{ data: FloorPlan }>("/api/v1/floor-plans", data);
    return response.data;
  }

  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan> {
    const response = await this.client.patch<{ data: FloorPlan }>(`/api/v1/floor-plans/${id}`, data);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    return this.client.delete(`/api/v1/floor-plans/${id}`);
  }

  async setActive(id: string): Promise<FloorPlan> {
    const response = await this.client.post<{ data: FloorPlan }>(`/api/v1/floor-plans/${id}/active`, undefined);
    return response.data;
  }

  async clone(id: string): Promise<FloorPlan> {
    const response = await this.client.post<{ data: FloorPlan }>(`/api/v1/floor-plans/${id}/clone`, undefined);
    return response.data;
  }
}
