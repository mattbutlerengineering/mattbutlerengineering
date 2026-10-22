import { z } from "zod";
import type {
  FloorPlanSection,
  CreateFloorPlanSectionRequest,
  UpdateFloorPlanSectionRequest,
  Table,
} from "@mbe/types";
import { FloorPlanSectionSchema, TableSchema } from "@mbe/types";
import type { ApiClient } from "./client.js";

const sectionListResponseSchema = z.object({ data: z.array(FloorPlanSectionSchema) });
const sectionListSchema = z.array(FloorPlanSectionSchema);
const tableListSchema = z.array(TableSchema);

/** `/api/v1/floor-plan-sections[/a/b/...]?venueId=` — a module function so it is not mistaken for a client method. */
function sectionPath(venueId: string, segments: string[] = [], extraQuery = ""): string {
  const path = ["/api/v1/floor-plan-sections", ...segments.map(encodeURIComponent)].join("/");
  return `${path}?venueId=${encodeURIComponent(venueId)}${extraQuery}`;
}

/**
 * Operator floor-plan section management. Every route is venue-scoped through
 * `?venueId=`, so every method takes the venue first; paths match
 * `routes/floor-plan-sections.ts` exactly.
 */
export class FloorPlanSectionsClient {
  constructor(private client: ApiClient) {}

  async list(venueId: string, floorPlanId?: string): Promise<FloorPlanSection[]> {
    const extra = floorPlanId ? `&floorPlanId=${encodeURIComponent(floorPlanId)}` : "";
    const response = await this.client.get<{ data: FloorPlanSection[] }>(
      sectionPath(venueId, [], extra),
      undefined,
      sectionListResponseSchema
    );
    return response.data;
  }

  async create(venueId: string, data: CreateFloorPlanSectionRequest): Promise<FloorPlanSection> {
    return this.client.postOne<FloorPlanSection>(
      sectionPath(venueId),
      data,
      FloorPlanSectionSchema
    );
  }

  async update(
    venueId: string,
    sectionId: string,
    data: UpdateFloorPlanSectionRequest
  ): Promise<FloorPlanSection> {
    return this.client.patchOne<FloorPlanSection>(
      sectionPath(venueId, [sectionId]),
      data,
      FloorPlanSectionSchema
    );
  }

  async delete(venueId: string, sectionId: string): Promise<void> {
    return this.client.delete(sectionPath(venueId, [sectionId]));
  }

  /** Persists `displayOrder` as each id's index (`PUT /order`). */
  async reorder(venueId: string, floorPlanId: string, ids: string[]): Promise<FloorPlanSection[]> {
    return this.client.putOne<FloorPlanSection[]>(
      sectionPath(venueId, ["order"]),
      { floorPlanId, ids },
      sectionListSchema
    );
  }

  /** Makes `tableIds` the section's exact membership (`PUT /:sectionId/tables`). */
  async assignTables(venueId: string, sectionId: string, tableIds: string[]): Promise<Table[]> {
    return this.client.putOne<Table[]>(
      sectionPath(venueId, [sectionId, "tables"]),
      { tableIds },
      tableListSchema
    );
  }
}
