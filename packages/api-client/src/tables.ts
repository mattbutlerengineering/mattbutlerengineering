import { z } from "zod";
import type {
  PaginatedResponse,
  Table,
  CreateTableRequest,
  UpdateTableRequest,
  TableStatusDelta,
} from "@mbe/types";
import { TableSchema, TableStatusDeltaSchema, paginatedResponseSchema } from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

export interface ListTablesParams {
  page?: number;
  limit?: number;
  venueId?: string;
  activeOnly?: boolean;
}

const tableListSchema: z.ZodSchema<PaginatedResponse<Table>> = paginatedResponseSchema(TableSchema);

export class TablesClient {
  constructor(private client: ApiClient) {}

  /**
   * List tables with optional filters
   */
  async list(params: ListTablesParams = {}): Promise<PaginatedResponse<Table>> {
    return this.client.get<PaginatedResponse<Table>>(
      "/api/v1/tables",
      params as QueryParams,
      tableListSchema
    );
  }

  /**
   * Get a table by ID
   */
  async get(id: string): Promise<Table> {
    return this.client.getOne<Table>(`/api/v1/tables/${id}`, undefined, TableSchema);
  }

  /**
   * Create a new table
   */
  async create(data: CreateTableRequest): Promise<Table> {
    return this.client.postOne<Table>("/api/v1/tables", data, TableSchema);
  }

  /**
   * Update a table
   */
  async update(id: string, data: UpdateTableRequest): Promise<Table> {
    return this.client.patchOne<Table>(`/api/v1/tables/${id}`, data, TableSchema);
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
    return this.client.patchOne<Table>(
      `/api/v1/tables/${id}/status`,
      { status: tableStatus },
      TableSchema
    );
  }

  /**
   * Current derived status for every table in a venue — the resync snapshot
   * an SSE client refetches on reconnect to replace `table-status:changed`
   * deltas lost while disconnected (#3931).
   */
  async getStatuses(venueId: string): Promise<TableStatusDelta[]> {
    return this.client.getOne<TableStatusDelta[]>(
      `/api/v1/venues/${venueId}/table-statuses`,
      undefined,
      z.array(TableStatusDeltaSchema)
    );
  }
}
