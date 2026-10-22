import { nanoid } from "nanoid";
import type { SaveFloorPlanPayload, SaveTablePayload, SaveWallPayload, SaveSectionPayload } from "@shared/types/floor-plan";

export interface FloorPlanTemplate {
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly build: (w: number, h: number) => SaveFloorPlanPayload;
}

export interface TemplateSize {
  readonly label: string;
  readonly sub: string;
  readonly width: number;
  readonly height: number;
}

export const TEMPLATE_SIZES: readonly TemplateSize[] = [
  { label: "Cozy", sub: "~1,000 sq ft", width: 800, height: 600 },
  { label: "Standard", sub: "~2,000 sq ft", width: 1200, height: 800 },
  { label: "Spacious", sub: "~3,500 sq ft", width: 1600, height: 1000 },
  { label: "Grand", sub: "~5,000 sq ft", width: 2000, height: 1200 },
] as const;

export function templateIdFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// --- Helpers ---

function perimeterWalls(w: number, h: number, t: number = 6): SaveWallPayload[] {
  return [
    { id: nanoid(), x1: 0, y1: 0, x2: w, y2: 0, thickness: t },
    { id: nanoid(), x1: w, y1: 0, x2: w, y2: h, thickness: t },
    { id: nanoid(), x1: w, y1: h, x2: 0, y2: h, thickness: t },
    { id: nanoid(), x1: 0, y1: h, x2: 0, y2: 0, thickness: t },
  ];
}

function perimeterWithDoor(
  w: number, h: number,
  side: "bottom" | "left", pos: number, gap: number, t: number = 6,
): SaveWallPayload[] {
  if (side === "bottom") {
    return [
      { id: nanoid(), x1: 0, y1: 0, x2: w, y2: 0, thickness: t },
      { id: nanoid(), x1: w, y1: 0, x2: w, y2: h, thickness: t },
      { id: nanoid(), x1: 0, y1: h, x2: pos, y2: h, thickness: t },
      { id: nanoid(), x1: pos + gap, y1: h, x2: w, y2: h, thickness: t },
      { id: nanoid(), x1: 0, y1: h, x2: 0, y2: 0, thickness: t },
    ];
  }
  return [
    { id: nanoid(), x1: 0, y1: 0, x2: w, y2: 0, thickness: t },
    { id: nanoid(), x1: w, y1: 0, x2: w, y2: h, thickness: t },
    { id: nanoid(), x1: w, y1: h, x2: 0, y2: h, thickness: t },
    { id: nanoid(), x1: 0, y1: 0, x2: 0, y2: pos, thickness: t },
    { id: nanoid(), x1: 0, y1: pos + gap, x2: 0, y2: h, thickness: t },
  ];
}

const WL = (x1: number, y1: number, x2: number, y2: number, t: number = 6): SaveWallPayload =>
  ({ id: nanoid(), x1, y1, x2, y2, thickness: t });

const WIN = (x1: number, y1: number, x2: number, y2: number): SaveWallPayload =>
  ({ id: nanoid(), x1, y1, x2, y2, thickness: 4, wallType: "window" });

const SEC = (name: string, color: string, x: number, y: number, w: number, h: number): SaveSectionPayload =>
  ({ id: nanoid(), name, color, x, y, width: w, height: h });

// Table helpers — positions use 0-1 fractions of canvas, converted to px
const R = (x: number, y: number, seats: number, label: string, d: number = 48): SaveTablePayload =>
  ({ id: nanoid(), label, shape: "circle", minCapacity: Math.max(1, seats - 1), maxCapacity: seats, sectionId: null, x: Math.round(x), y: Math.round(y), width: d, height: d, rotation: 0 });

const SQ = (x: number, y: number, seats: number, label: string, s: number = 56, rot: number = 0): SaveTablePayload =>
  ({ id: nanoid(), label, shape: "square", minCapacity: Math.max(1, seats - 1), maxCapacity: seats, sectionId: null, x: Math.round(x), y: Math.round(y), width: s, height: s, rotation: rot });

const LT = (x: number, y: number, seats: number, label: string, w: number = 100, h: number = 48, rot: number = 0): SaveTablePayload =>
  ({ id: nanoid(), label, shape: "rectangle", minCapacity: Math.max(2, seats - 2), maxCapacity: seats, sectionId: null, x: Math.round(x), y: Math.round(y), width: w, height: h, rotation: rot });

// --- Templates ---
// All positions use fractional coords (0.05 = 5% from edge) then multiply by w/h

export const TEMPLATES: readonly FloorPlanTemplate[] = [
  {
    name: "Blank",
    description: "Empty floor with perimeter walls",
    icon: "blank",
    build: (w, h) => ({
      canvasWidth: w, canvasHeight: h, tables: [], sections: [],
      walls: perimeterWalls(w, h),
    }),
  },

  {
    name: "Fine Dining",
    description: "Spacious round tables, private room, window 2-tops",
    icon: "fine-dining",
    build: (w, h) => {
      // Divider at 60% width separates main from private
      const div = w * 0.6;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Window 2-tops along left wall (5% from left, evenly spaced)
          R(w * 0.04, h * 0.08, 2, "W1", 36), R(w * 0.04, h * 0.24, 2, "W2", 36),
          R(w * 0.04, h * 0.40, 2, "W3", 36), R(w * 0.04, h * 0.56, 2, "W4", 36),
          // Main dining — staggered 4-tops and 6-tops filling 55% width
          R(w * 0.16, h * 0.10, 4, "T1", 52), R(w * 0.32, h * 0.10, 4, "T2", 52), R(w * 0.48, h * 0.10, 4, "T3", 52),
          R(w * 0.24, h * 0.30, 6, "T4", 64), R(w * 0.42, h * 0.30, 6, "T5", 64),
          R(w * 0.16, h * 0.50, 4, "T6", 52), R(w * 0.32, h * 0.50, 4, "T7", 52), R(w * 0.48, h * 0.50, 4, "T8", 52),
          R(w * 0.24, h * 0.70, 4, "T9", 52), R(w * 0.42, h * 0.70, 4, "T10", 52),
          R(w * 0.16, h * 0.85, 4, "T11", 52),
          // Private dining room (right 35%)
          R(w * 0.72, h * 0.12, 8, "P1", 84),
          LT(w * 0.68, h * 0.35, 10, "P2", 140, 56),
          R(w * 0.68, h * 0.58, 4, "P3", 52), R(w * 0.84, h * 0.58, 4, "P4", 52),
          R(w * 0.76, h * 0.78, 6, "P5", 64),
        ],
        sections: [
          SEC("Main Dining", "#8B7355", w * 0.02, h * 0.03, div - w * 0.04, h * 0.92),
          SEC("Private", "#6b5740", div + w * 0.02, h * 0.03, w * 0.36, h * 0.92),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "bottom", w * 0.35, 80),
          WL(div, 0, div, h * 0.75), WL(div, h * 0.75, w, h * 0.75),
          WIN(0, h * 0.05, 0, h * 0.20), WIN(0, h * 0.25, 0, h * 0.40), WIN(0, h * 0.45, 0, h * 0.60),
        ],
      };
    },
  },

  {
    name: "Casual Bistro",
    description: "Diamond tops, communal table, booths, dense layout",
    icon: "casual",
    build: (w, h) => {
      const boothX = w * 0.68;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Window 2-tops
          R(w * 0.04, h * 0.10, 2, "W1", 36), R(w * 0.04, h * 0.28, 2, "W2", 36),
          R(w * 0.04, h * 0.46, 2, "W3", 36), R(w * 0.04, h * 0.64, 2, "W4", 36),
          // Diamond 4-tops — row 1
          SQ(w * 0.18, h * 0.08, 4, "T1", 52, 45), SQ(w * 0.34, h * 0.08, 4, "T2", 52, 45), SQ(w * 0.50, h * 0.08, 4, "T3", 52, 45),
          // Diamond 4-tops — row 2 (offset)
          SQ(w * 0.26, h * 0.26, 4, "T4", 52, 45), SQ(w * 0.42, h * 0.26, 4, "T5", 52, 45),
          // Diamond 4-tops — row 3
          SQ(w * 0.18, h * 0.44, 4, "T6", 52, 45), SQ(w * 0.34, h * 0.44, 4, "T7", 52, 45), SQ(w * 0.50, h * 0.44, 4, "T8", 52, 45),
          // Communal table
          LT(w * 0.20, h * 0.66, 10, "C1", 200, 60),
          // Bottom tables
          R(w * 0.20, h * 0.84, 4, "T9", 52), R(w * 0.40, h * 0.84, 4, "T10", 52),
          // Booths along right
          LT(boothX, h * 0.06, 4, "B1", 100, 48), LT(boothX, h * 0.20, 4, "B2", 100, 48),
          LT(boothX, h * 0.34, 4, "B3", 100, 48), LT(boothX, h * 0.48, 4, "B4", 100, 48),
          LT(boothX, h * 0.62, 4, "B5", 100, 48), LT(boothX, h * 0.76, 4, "B6", 100, 48),
        ],
        sections: [
          SEC("Dining", "#8B7355", w * 0.10, h * 0.03, w * 0.52, h * 0.56),
          SEC("Booths", "#6b5740", boothX - w * 0.03, h * 0.02, w * 0.33, h * 0.88),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "bottom", w * 0.35, 70),
          WL(boothX - w * 0.04, 0, boothX - w * 0.04, h * 0.90),
          WIN(0, h * 0.05, 0, h * 0.22), WIN(0, h * 0.28, 0, h * 0.45), WIN(0, h * 0.52, 0, h * 0.68),
        ],
      };
    },
  },

  {
    name: "Bar & Lounge",
    description: "Long bar, cocktail tables, lounge booths",
    icon: "bar",
    build: (w, h) => {
      const barY = h * 0.18;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Bar stools — spread across bar width
          R(w * 0.18, h * 0.05, 1, "B1", 32), R(w * 0.26, h * 0.05, 1, "B2", 32),
          R(w * 0.34, h * 0.05, 1, "B3", 32), R(w * 0.42, h * 0.05, 1, "B4", 32),
          R(w * 0.50, h * 0.05, 1, "B5", 32), R(w * 0.58, h * 0.05, 1, "B6", 32),
          R(w * 0.66, h * 0.05, 1, "B7", 32), R(w * 0.74, h * 0.05, 1, "B8", 32),
          R(w * 0.82, h * 0.05, 1, "B9", 32),
          // Cocktail rounds — 3 rows filling middle
          R(w * 0.08, h * 0.32, 3, "T1", 44), R(w * 0.22, h * 0.32, 3, "T2", 44),
          R(w * 0.36, h * 0.32, 3, "T3", 44), R(w * 0.50, h * 0.32, 3, "T4", 44),
          R(w * 0.15, h * 0.48, 3, "T5", 44), R(w * 0.29, h * 0.48, 3, "T6", 44),
          R(w * 0.43, h * 0.48, 3, "T7", 44),
          // Booths along right
          LT(w * 0.72, h * 0.30, 6, "T8", 110, 48),
          LT(w * 0.72, h * 0.46, 6, "T9", 110, 48),
          LT(w * 0.72, h * 0.62, 6, "T10", 110, 48),
          // Lounge — bottom, full width
          SQ(w * 0.08, h * 0.72, 4, "L1", 56), SQ(w * 0.22, h * 0.72, 4, "L2", 56),
          SQ(w * 0.36, h * 0.72, 4, "L3", 56), R(w * 0.52, h * 0.72, 6, "L4", 64),
          SQ(w * 0.08, h * 0.88, 4, "L5", 56), SQ(w * 0.22, h * 0.88, 4, "L6", 56),
        ],
        sections: [
          SEC("Bar", "#c49a2a", w * 0.14, h * 0.01, w * 0.74, barY - h * 0.01),
          SEC("Lounge", "#6b8a6b", w * 0.03, h * 0.67, w * 0.60, h * 0.30),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "bottom", w * 0.04, 80),
          // Bar counter
          WL(w * 0.15, barY, w * 0.88, barY, 8),
          WL(w * 0.13, 0, w * 0.13, barY), WL(w * 0.90, 0, w * 0.90, barY),
          // Booth divider
          WL(w * 0.67, h * 0.25, w * 0.67, h * 0.78),
        ],
      };
    },
  },

  {
    name: "Café",
    description: "Window seats, service counter, cozy nooks",
    icon: "cafe",
    build: (w, h) => {
      const counterX = w * 0.55;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Window seats — 2-tops along left
          R(w * 0.05, h * 0.08, 2, "W1", 36), R(w * 0.05, h * 0.22, 2, "W2", 36),
          R(w * 0.05, h * 0.36, 2, "W3", 36), R(w * 0.05, h * 0.50, 2, "W4", 36),
          R(w * 0.05, h * 0.64, 2, "W5", 36), R(w * 0.05, h * 0.78, 2, "W6", 36),
          // Main tables — filling center area
          SQ(w * 0.20, h * 0.08, 4, "T1", 52), SQ(w * 0.36, h * 0.08, 4, "T2", 52),
          R(w * 0.20, h * 0.28, 4, "T3", 48), R(w * 0.36, h * 0.28, 4, "T4", 48),
          SQ(w * 0.20, h * 0.48, 4, "T5", 52), SQ(w * 0.36, h * 0.48, 4, "T6", 52),
          R(w * 0.28, h * 0.68, 6, "T7", 64),
          R(w * 0.20, h * 0.86, 4, "T8", 48), R(w * 0.38, h * 0.86, 4, "T9", 48),
          // Counter stools
          R(counterX - 30, h * 0.28, 1, "C1", 32), R(counterX - 30, h * 0.38, 1, "C2", 32),
          R(counterX - 30, h * 0.48, 1, "C3", 32), R(counterX - 30, h * 0.58, 1, "C4", 32),
          R(counterX - 30, h * 0.68, 1, "C5", 32),
          // Back communal table
          LT(w * 0.62, h * 0.72, 8, "C6", 180, 52),
          LT(w * 0.62, h * 0.86, 6, "C7", 140, 48),
        ],
        sections: [
          SEC("Window Seats", "#5a8db5", w * 0.01, h * 0.03, w * 0.12, h * 0.88),
          SEC("Kitchen", "#e07050", w * 0.58, h * 0.02, w * 0.40, h * 0.30),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "left", h * 0.82, 60),
          WL(counterX, h * 0.20, counterX, h * 0.78),
          WL(w * 0.56, 0, w * 0.56, h * 0.35), WL(w * 0.56, h * 0.35, w, h * 0.35),
          WIN(0, h * 0.04, 0, h * 0.18), WIN(0, h * 0.22, 0, h * 0.36),
          WIN(0, h * 0.40, 0, h * 0.54), WIN(0, h * 0.58, 0, h * 0.72), WIN(0, h * 0.76, 0, h * 0.88),
        ],
      };
    },
  },

  {
    name: "Banquet Hall",
    description: "Large round tables, head table, stage area",
    icon: "banquet",
    build: (w, h) => {
      const stageY = h * 0.78;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Round 8-tops — 4-3-4 staggered grid filling room
          R(w * 0.08, h * 0.06, 8, "T1", 80), R(w * 0.28, h * 0.06, 8, "T2", 80),
          R(w * 0.48, h * 0.06, 8, "T3", 80), R(w * 0.68, h * 0.06, 8, "T4", 80),
          R(w * 0.18, h * 0.26, 8, "T5", 80), R(w * 0.38, h * 0.26, 8, "T6", 80), R(w * 0.58, h * 0.26, 8, "T7", 80),
          R(w * 0.08, h * 0.46, 8, "T8", 80), R(w * 0.28, h * 0.46, 8, "T9", 80),
          R(w * 0.48, h * 0.46, 8, "T10", 80), R(w * 0.68, h * 0.46, 8, "T11", 80),
          // Smaller tables along right wall
          R(w * 0.88, h * 0.10, 6, "T12", 60), R(w * 0.88, h * 0.30, 6, "T13", 60),
          R(w * 0.88, h * 0.50, 6, "T14", 60),
          // Head table — long, at stage
          LT(w * 0.20, stageY + h * 0.04, 16, "HEAD", Math.min(500, w * 0.5), 56),
        ],
        sections: [
          SEC("Seating", "#8B7355", w * 0.03, h * 0.02, w * 0.82, stageY - h * 0.06),
          SEC("Stage", "#c49a2a", w * 0.15, stageY, w * 0.60, h * 0.18),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "bottom", w * 0.06, 100),
          WL(0, stageY, w, stageY),
        ],
      };
    },
  },

  {
    name: "Open Kitchen",
    description: "Chef's counter, visible kitchen, mixed seating",
    icon: "open-kitchen",
    build: (w, h) => {
      const kitchenX = w * 0.50;
      const counterY = h * 0.35;
      return {
        canvasWidth: w, canvasHeight: h,
        tables: [
          // Chef's counter stools
          R(kitchenX + w * 0.04, counterY + 20, 1, "K1", 32),
          R(kitchenX + w * 0.12, counterY + 20, 1, "K2", 32),
          R(kitchenX + w * 0.20, counterY + 20, 1, "K3", 32),
          R(kitchenX + w * 0.28, counterY + 20, 1, "K4", 32),
          R(kitchenX + w * 0.36, counterY + 20, 1, "K5", 32),
          R(kitchenX + w * 0.44, counterY + 20, 1, "K6", 32),
          // Main dining — diamond squares + rounds
          SQ(w * 0.06, h * 0.06, 4, "T1", 52, 45), SQ(w * 0.22, h * 0.06, 4, "T2", 52, 45),
          R(w * 0.38, h * 0.06, 6, "T3", 64),
          SQ(w * 0.14, h * 0.26, 4, "T4", 52, 45), R(w * 0.30, h * 0.26, 4, "T5", 48),
          // Bottom dining — filling lower half
          LT(w * 0.06, h * 0.50, 6, "T6", 110, 48), LT(w * 0.26, h * 0.50, 6, "T7", 110, 48),
          R(w * 0.06, h * 0.68, 4, "T8", 52), R(w * 0.22, h * 0.68, 4, "T9", 52),
          SQ(w * 0.38, h * 0.65, 4, "T10", 52, 45),
          R(w * 0.06, h * 0.84, 4, "T11", 48), R(w * 0.22, h * 0.84, 4, "T12", 48),
          LT(w * 0.36, h * 0.84, 6, "T13", 110, 48),
          // Bar area
          R(w * 0.62, h * 0.56, 2, "B1", 40), R(w * 0.76, h * 0.56, 2, "B2", 40),
          R(w * 0.62, h * 0.70, 2, "B3", 40), R(w * 0.76, h * 0.70, 2, "B4", 40),
          R(w * 0.69, h * 0.84, 4, "B5", 52),
        ],
        sections: [
          SEC("Dining", "#8B7355", w * 0.02, h * 0.02, kitchenX - w * 0.04, h * 0.94),
          SEC("Kitchen", "#e07050", kitchenX + w * 0.02, h * 0.02, w * 0.46, counterY - h * 0.04),
          SEC("Bar", "#c49a2a", w * 0.56, h * 0.50, w * 0.40, h * 0.46),
        ],
        walls: [
          ...perimeterWithDoor(w, h, "left", h * 0.85, 60),
          WL(kitchenX, 0, kitchenX, counterY),
          WL(kitchenX, counterY, w, counterY),
          WL(kitchenX + 10, counterY + 10, w * 0.96, counterY + 10, 8),
          WIN(0, h * 0.04, 0, h * 0.22), WIN(0, h * 0.30, 0, h * 0.48),
        ],
      };
    },
  },
];
