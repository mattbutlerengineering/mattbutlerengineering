import type { PaginatedResponse, Table, CreateTableRequest, UpdateTableRequest } from "@mbe/types";
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
    return this.client.getOne<Table>(`/api/v1/tables/${id}`);
  }

  /**
   * Create a new table
   */
  async create(data: CreateTableRequest): Promise<Table> {
    return this.client.postOne<Table>("/api/v1/tables", data);
  }

  /**
   * Update a table
   */
  async update(id: string, data: UpdateTableRequest): Promise<Table> {
    return this.client.patchOne<Table>(`/api/v1/tables/${id}`, data);
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
  async updateStatus(id: string, tableStatus: string): Promise<Table> {
    return this.client.patchOne<Table>(`/api/v1/tables/${id}/status`, {
      status: tableStatus,
    });
  }
}
