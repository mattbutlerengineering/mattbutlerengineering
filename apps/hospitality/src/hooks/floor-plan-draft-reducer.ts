import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "../components/floor-plan/floor-plan-geometry.js";

export interface Position {
  readonly x: number;
  readonly y: number;
}

export type PositionMap = ReadonlyMap<string, Position>;

/**
 * base     - last known saved/server tables
 * edits    - moves not yet sent to the server
 * inFlight - moves currently being saved (shown optimistically)
 */
export interface DraftState {
  readonly base: readonly Table[];
  readonly edits: PositionMap;
  readonly inFlight: PositionMap | null;
  /** Wrapped so a thrown `null`/`undefined` is still distinguishable from "no failure". */
  readonly saveFailure: { readonly error: unknown } | null;
}

export type DraftAction =
  | { readonly type: "synced"; readonly tables: readonly Table[] }
  | { readonly type: "moved"; readonly tableId: string; readonly x: number; readonly y: number }
  | { readonly type: "tableAdded"; readonly table: Table }
  | { readonly type: "tableRemoved"; readonly tableId: string }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveSucceeded" }
  | { readonly type: "saveFailed"; readonly error: unknown };

export const INITIAL_DRAFT: DraftState = {
  base: [],
  edits: new Map(),
  inFlight: null,
  saveFailure: null,
};

function withPosition(table: Table, pos: Position): Table {
  const existing = table.shapeMetadata ?? {
    ...SHAPE_DEFAULTS.rectangle,
    shape: "rectangle" as const,
  };
  return { ...table, shapeMetadata: { ...existing, x: pos.x, y: pos.y } };
}

function applyPositions(tables: readonly Table[], positions: PositionMap | null): Table[] {
  if (!positions || positions.size === 0) return [...tables];
  return tables.map((t) => {
    const pos = positions.get(t.id);
    return pos ? withPosition(t, pos) : t;
  });
}

/** Tables as the user should see them: base + in-flight moves + unsaved edits. */
export function selectTables(state: DraftState): Table[] {
  return applyPositions(applyPositions(state.base, state.inFlight), state.edits);
}

export function selectDirty(state: DraftState): boolean {
  return state.edits.size > 0 || state.inFlight !== null;
}

function without(map: PositionMap, id: string): PositionMap {
  if (!map.has(id)) return map;
  const next = new Map(map);
  next.delete(id);
  return next;
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "synced":
      // Server data replaces base only; unsaved edits and in-flight moves stay layered on top.
      return { ...state, base: action.tables };
    case "moved":
      return {
        ...state,
        edits: new Map(state.edits).set(action.tableId, { x: action.x, y: action.y }),
      };
    case "tableAdded":
      return { ...state, base: [...state.base, action.table] };
    case "tableRemoved":
      return {
        ...state,
        base: state.base.filter((t) => t.id !== action.tableId),
        edits: without(state.edits, action.tableId),
        inFlight: state.inFlight && without(state.inFlight, action.tableId),
      };
    case "saveStarted":
      if (state.inFlight !== null || state.edits.size === 0) return state;
      return { ...state, inFlight: state.edits, edits: new Map(), saveFailure: null };
    case "saveSucceeded":
      if (state.inFlight === null) return state;
      return { ...state, base: applyPositions(state.base, state.inFlight), inFlight: null };
    case "saveFailed":
      // Rollback: drop the failed moves so positions revert to base. Moves made while the
      // save was in flight are newer and stay as edits.
      return { ...state, inFlight: null, saveFailure: { error: action.error } };
  }
}
