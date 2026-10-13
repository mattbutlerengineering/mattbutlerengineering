import { describe, it, expect } from "vitest";
import type { Table } from "@mbe/types";
import {
  INITIAL_DRAFT,
  draftReducer,
  selectDirty,
  selectTables,
  type DraftAction,
  type DraftState,
} from "./floor-plan-draft-reducer.js";

const table = (id: string, x: number, y: number): Table =>
  ({
    id,
    name: id,
    shapeMetadata: { x, y, width: 80, height: 60, shape: "rectangle" },
  }) as Table;

const run = (actions: DraftAction[], from: DraftState = INITIAL_DRAFT) =>
  actions.reduce(draftReducer, from);

const pos = (state: DraftState, id: string) => {
  const t = selectTables(state).find((x) => x.id === id);
  return [t?.shapeMetadata?.x, t?.shapeMetadata?.y];
};

const synced: DraftAction = { type: "synced", tables: [table("a", 1, 2), table("b", 3, 4)] };

describe("draftReducer", () => {
  it("failed save restores base positions", () => {
    const s = run([
      synced,
      { type: "moved", tableId: "a", x: 9, y: 9 },
      { type: "saveStarted" },
      { type: "saveFailed", error: new Error("boom") },
    ]);
    expect(pos(s, "a")).toEqual([1, 2]);
    expect(selectDirty(s)).toBe(false);
    expect(s.saveFailure?.error).toEqual(new Error("boom"));
  });

  it("failed save keeps moves made while in flight", () => {
    const s = run([
      synced,
      { type: "moved", tableId: "a", x: 9, y: 9 },
      { type: "saveStarted" },
      { type: "moved", tableId: "b", x: 7, y: 7 },
      { type: "saveFailed", error: new Error("boom") },
    ]);
    expect(pos(s, "a")).toEqual([1, 2]);
    expect(pos(s, "b")).toEqual([7, 7]);
  });

  it("successful save keeps in-flight-era moves dirty", () => {
    const s = run([
      synced,
      { type: "moved", tableId: "a", x: 9, y: 9 },
      { type: "saveStarted" },
      { type: "moved", tableId: "b", x: 7, y: 7 },
      { type: "saveSucceeded" },
    ]);
    expect(pos(s, "a")).toEqual([9, 9]);
    expect(selectDirty(s)).toBe(true);
  });

  it("server sync while dirty keeps unsaved edits", () => {
    const s = run([
      synced,
      { type: "moved", tableId: "a", x: 9, y: 9 },
      { type: "synced", tables: [table("a", 1, 2), table("b", 3, 4)] },
    ]);
    expect(pos(s, "a")).toEqual([9, 9]);
  });

  it("removing a table drops its edits", () => {
    const s = run([
      synced,
      { type: "moved", tableId: "a", x: 9, y: 9 },
      { type: "tableRemoved", tableId: "a" },
    ]);
    expect(selectDirty(s)).toBe(false);
    expect(selectTables(s)).toHaveLength(1);
  });
});
