import type {
  ApiResponse,
  PaginatedResponse,
  Table,
  CreateTableRequest,
  UpdateTableRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export interface ListTablesParams {
  page?: number;
  limit?: number;
  venueId?: string;
  activeOnly?: boolean;
}

export class TablesClient {
  constructor(private client: ApiClient) {}

  /**
   * List tables with optional filters
   */
  async list(params: ListTablesParams = {}): Promise<PaginatedResponse<Table>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.venueId) searchParams.set("venueId", params.venueId);
    if (params.activeOnly !== undefined) searchParams.set("activeOnly", String(params.activeOnly));

    const query = searchParams.toString();
    return this.client.get<PaginatedResponse<Table>>(`/api/v1/tables${query ? `?${query}` : ""}`);
  }

  /**
   * Get a table by ID
   */
  async get(id: string): Promise<Table> {
    const response = await this.client.get<ApiResponse<Table>>(`/api/v1/tables/${id}`);
    return response.data;
  }

  /**
   * Create a new table
   */
  async create(data: CreateTableRequest): Promise<Table> {
    const response = await this.client.post<ApiResponse<Table>>("/api/v1/tables", data);
    return response.data;
  }

  /**
   * Update a table
   */
  async update(id: string, data: UpdateTableRequest): Promise<Table> {
    const response = await this.client.patch<ApiResponse<Table>>(`/api/v1/tables/${id}`, data);
    return response.data;
  }

  /**
   * Delete a table
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/v1/tables/${id}`);
  }

  /**
   * Update the status of a table
   */
  async updateStatus(id: string, status: string): Promise<Table> {
    const response = await this.client.patch<ApiResponse<Table>>(`/api/v1/tables/${id}/status`, {
      status,
    });
    return response.data;
  }
}
