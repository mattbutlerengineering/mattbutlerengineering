export type TableShape = "circle" | "square" | "rectangle";

export const TABLE_SHAPES: readonly TableShape[] = [
  "circle",
  "square",
  "rectangle",
] as const;

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  circle: "Round",
  square: "Square",
  rectangle: "Rectangular",
} as const;

// --- Layout data (stored as JSON in floor_plans.layout_data) ---

export interface TableLayout {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface SectionLayout {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type WallType = "wall" | "window";

export interface WallLayout {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly thickness: number;
  readonly wallType?: WallType | undefined;
}

export interface LayoutData {
  readonly tables: readonly TableLayout[];
  readonly sections: readonly SectionLayout[];
  readonly walls: readonly WallLayout[];
}

// --- Business data (from normalized DB tables) ---

export interface FloorPlanTable {
  readonly id: string;
  readonly floorPlanId: string;
  readonly sectionId: string | null;
  readonly label: string;
  readonly shape: TableShape;
  readonly minCapacity: number;
  readonly maxCapacity: number;
}

export interface FloorPlanSection {
  readonly id: string;
  readonly floorPlanId: string;
  readonly name: string;
  readonly color: string;
  readonly floorMaterial?: "hardwood" | "concrete" | "carpet" | "tile" | "marble" | undefined;
}

// --- API response types ---

export interface FloorPlan {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FloorPlanFull extends FloorPlan {
  readonly layoutData: LayoutData;
  readonly tables: readonly FloorPlanTable[];
  readonly sections: readonly FloorPlanSection[];
}

// --- Save payload (client → server) ---

export interface SaveTablePayload {
  readonly id: string;
  readonly label: string;
  readonly shape: TableShape;
  readonly minCapacity: number;
  readonly maxCapacity: number;
  readonly sectionId: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface SaveSectionPayload {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly floorMaterial?: "hardwood" | "concrete" | "carpet" | "tile" | "marble" | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SaveWallPayload {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly thickness: number;
  readonly wallType?: WallType | undefined;
}

export interface SaveFloorPlanPayload {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tables: readonly SaveTablePayload[];
  readonly sections: readonly SaveSectionPayload[];
  readonly walls: readonly SaveWallPayload[];
}
