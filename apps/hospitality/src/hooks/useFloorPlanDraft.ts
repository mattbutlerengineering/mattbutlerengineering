import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "../components/floor-plan/floor-plan-geometry.js";
import {
  INITIAL_DRAFT,
  draftReducer,
  selectDirty,
  selectTables,
} from "./floor-plan-draft-reducer.js";

export interface PositionUpdate {
  tableId: string;
  shapeMetadata: NonNullable<Table["shapeMetadata"]>;
}

export interface UseFloorPlanDraftOptions {
  /** Latest tables from the server (may refetch at any time). */
  serverTables: readonly Table[] | undefined;
  /** Persist moved tables; reject to signal failure. */
  persist: (positions: PositionUpdate[]) => Promise<unknown>;
}

function toUpdate(table: Table | undefined, tableId: string, x: number, y: number): PositionUpdate {
  const existing = table?.shapeMetadata;
  return {
    tableId,
    shapeMetadata: {
      x,
      y,
      width: existing?.width ?? SHAPE_DEFAULTS.rectangle.width,
      height: existing?.height ?? SHAPE_DEFAULTS.rectangle.height,
      shape: existing?.shape ?? ("rectangle" as const),
      rotation: existing?.rotation,
      color: existing?.color,
    },
  };
}

/**
 * Owns draft vs. server floor-plan state: layered moves, dirty tracking,
 * save with rollback. A refetch never wipes unsaved moves, and moves made
 * during an in-flight save survive its resolution.
 */
export function useFloorPlanDraft({ serverTables, persist }: UseFloorPlanDraftOptions) {
  const [state, dispatch] = useReducer(draftReducer, INITIAL_DRAFT);
  // Mirrors reducer state so save() can read/guard synchronously before re-render.
  const stateRef = useRef(state);

  const send = useCallback((action: Parameters<typeof draftReducer>[1]) => {
    stateRef.current = draftReducer(stateRef.current, action);
    dispatch(action);
  }, []);

  useEffect(() => {
    if (serverTables) send({ type: "synced", tables: serverTables });
  }, [serverTables, send]);

  const tables = useMemo(() => selectTables(state), [state]);

  const move = useCallback(
    (tableId: string, x: number, y: number) => send({ type: "moved", tableId, x, y }),
    [send]
  );

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (current.inFlight !== null || current.edits.size === 0) return;
    const positions = Array.from(current.edits, ([id, p]) =>
      toUpdate(
        current.base.find((t) => t.id === id),
        id,
        p.x,
        p.y
      )
    );
    send({ type: "saveStarted" });
    try {
      await persist(positions);
      send({ type: "saveSucceeded" });
    } catch (err) {
      send({ type: "saveFailed", error: err });
    }
  }, [persist, send]);

  const addTable = useCallback((table: Table) => send({ type: "tableAdded", table }), [send]);
  const removeTable = useCallback(
    (tableId: string) => send({ type: "tableRemoved", tableId }),
    [send]
  );

  return {
    tables,
    move,
    save,
    addTable,
    removeTable,
    dirty: selectDirty(state),
    hasUnsentEdits: state.edits.size > 0,
    isSaving: state.inFlight !== null,
    saveFailure: state.saveFailure,
  };
}
