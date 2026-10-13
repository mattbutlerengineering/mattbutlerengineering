import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Table } from "@mbe/types";
import { useFloorPlanDraft } from "./useFloorPlanDraft.js";

const table = (id: string, overrides: Partial<Table["shapeMetadata"]> = {}): Table =>
  ({
    id,
    name: id,
    shapeMetadata: {
      x: 0,
      y: 0,
      width: 120,
      height: 90,
      shape: "circle",
      color: "#f00",
      ...overrides,
    },
  }) as Table;

describe("useFloorPlanDraft", () => {
  it("save() after a synced update sends the real shape, not the rectangle default", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const serverTables: Table[] = [table("t1")];

    const { result } = renderHook(() => useFloorPlanDraft({ serverTables, persist }));

    // Wait for the "synced" effect to run and populate base.
    await waitFor(() => expect(result.current.tables).toHaveLength(1));

    act(() => {
      result.current.move("t1", 55, 66);
    });

    await act(async () => {
      await result.current.save();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith([
      {
        tableId: "t1",
        shapeMetadata: {
          x: 55,
          y: 66,
          width: 120,
          height: 90,
          shape: "circle",
          rotation: undefined,
          color: "#f00",
        },
      },
    ]);
  });
});
