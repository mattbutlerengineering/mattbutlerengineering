import type { Table, TableShapeMetadata } from "./table.js";

// Re-export for existing importers (type now owned by table.ts).
export type { TableShapeMetadata } from "./table.js";

export interface FloorPlan {
  id: string;
  venueId: string;
  name: string;
  isActive: boolean;
  layoutJson: FloorPlanLayout;
  tables?: Table[];
  createdAt: string;
  updatedAt: string;
}

export interface WallLayout {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  wallType?: "wall" | "window";
}

export interface FloorPlanLayout {
  width: number;
  height: number;
  backgroundImage?: string;
  gridSize?: number;
  showGrid?: boolean;
  walls?: WallLayout[];
}

export interface CreateFloorPlanRequest {
  venueId: string;
  name: string;
  isActive?: boolean;
  layoutJson: FloorPlanLayout;
}

export interface UpdateFloorPlanRequest {
  name?: string;
  isActive?: boolean;
  layoutJson?: FloorPlanLayout;
}

export interface UpdateTablePositionRequest {
  tableId: string;
  shapeMetadata: TableShapeMetadata;
}

export interface BulkUpdateTablePositionsRequest {
  floorPlanId: string;
  positions: UpdateTablePositionRequest[];
}
