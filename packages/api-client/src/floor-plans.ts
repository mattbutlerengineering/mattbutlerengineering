import type {
  ApiResponse,
  PaginatedResponse,
  FloorPlan,
  Table,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export interface ListFloorPlansParams {
  page?: number;
  limit?: number;
  venueId?: string;
}

export class FloorPlansClient {
  constructor(private client: ApiClient) {}

  /**
   * List floor plans with optional filters
   */
  async list(params: ListFloorPlansParams = {}): Promise<PaginatedResponse<FloorPlan>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.venueId) searchParams.set("venueId", params.venueId);

    const query = searchParams.toString();
    return this.client.get<PaginatedResponse<FloorPlan>>(
      `/api/v1/floor-plans${query ? `?${query}` : ""}`
    );
  }

  /**
   * Get a floor plan by ID
   */
  async get(id: string): Promise<FloorPlan> {
    const response = await this.client.get<ApiResponse<FloorPlan>>(`/api/v1/floor-plans/${id}`);
    return response.data;
  }

  /**
   * Get the active floor plan for a venue
   */
  async getActiveByVenueId(venueId: string): Promise<FloorPlan> {
    const response = await this.client.get<ApiResponse<FloorPlan>>(
      `/api/v1/floor-plans/venue/${venueId}/active`
    );
    return response.data;
  }

  /**
   * Create a new floor plan
   */
  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    const response = await this.client.post<ApiResponse<FloorPlan>>("/api/v1/floor-plans", data);
    return response.data;
  }

  /**
   * Update a floor plan
   */
  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan> {
    const response = await this.client.patch<ApiResponse<FloorPlan>>(
      `/api/v1/floor-plans/${id}`,
      data
    );
    return response.data;
  }

  /**
   * Set a floor plan as active
   */
  async activate(id: string): Promise<FloorPlan> {
    const response = await this.client.post<ApiResponse<FloorPlan>>(
      `/api/v1/floor-plans/${id}/activate`,
      {}
    );
    return response.data;
  }

  /**
   * Delete a floor plan
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/floor-plans/${id}`);
  }

  /**
   * Bulk update table positions
   */
  async bulkUpdatePositions(floorPlanId: string, positions: UpdateTablePositionRequest[]): Promise<Table[]> {
    const response = await this.client.post<ApiResponse<Table[]>>(
      "/api/v1/floor-plans/tables/positions",
      { floorPlanId, positions }
    );
    return response.data;
  }

  /**
   * Assign a table to a floor plan
   */
  async assignTable(
    tableId: string,
    floorPlanId: string,
    position: { x: number; y: number }
  ): Promise<Table> {
    const response = await this.client.post<ApiResponse<Table>>(
      `/api/v1/floor-plans/tables/${tableId}/assign`,
      { floorPlanId, ...position }
    );
    return response.data;
  }

  /**
   * Remove a table from its floor plan
   */
  async removeTable(tableId: string): Promise<Table> {
    const response = await this.client.post<ApiResponse<Table>>(
      `/api/v1/floor-plans/tables/${tableId}/remove`,
      {}
    );
    return response.data;
  }
}
