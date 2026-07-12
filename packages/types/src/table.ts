// Shared table primitives.
//
// Owned here so `reservation.ts` and `floor-plan.ts` can both import them
// without importing each other (breaks the import cycle). Public exports
// from `index.ts` are unchanged — reservation.ts re-exports `Table` and
// `TableStatus`, floor-plan.ts re-exports `TableShapeMetadata`.

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "READY";

export interface TableShapeMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape: "rectangle" | "circle" | "square";
  color?: string;
}

export interface Table {
  id: string;
  name: string;
  tableNumber: string | null;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  priority: number;
  status: TableStatus;
  venueId: string | null;
  floorPlanId: string | null;
  shapeMetadata: TableShapeMetadata | null;
  createdAt: string;
  updatedAt: string;
}
