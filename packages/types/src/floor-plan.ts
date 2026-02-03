import type { Table } from "./reservation.js";

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

export interface FloorPlanLayout {
  width: number;
  height: number;
  backgroundImage?: string;
  gridSize?: number;
  showGrid?: boolean;
}

export interface TableShapeMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape: "rectangle" | "circle" | "square";
  color?: string;
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
