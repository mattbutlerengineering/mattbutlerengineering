import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import { invertSpecDiff } from "../lib/spec-subtree.js";
import type { SpecDiff } from "../lib/spec-subtree.js";
import { useSpecDiffHistory } from "./useSpecDiffHistory.js";

const sub = (type: string): Spec => ({ root: "card", elements: { card: { type, props: {} } } });
const diffA: SpecDiff = { parentId: null, path: "card", before: sub("Stack"), after: sub("Grid") };
const diffB: SpecDiff = { parentId: null, path: "card", before: sub("Grid"), after: sub("Text") };

describe("useSpecDiffHistory", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undo()).toBeNull();
    expect(result.current.redo()).toBeNull();
  });

  it("undo returns the inverted diff and enables redo", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    act(() => result.current.push(diffA));
    expect(result.current.canUndo).toBe(true);

    let applied: SpecDiff | null = null;
    act(() => {
      applied = result.current.undo();
    });
    expect(applied).toEqual(invertSpecDiff(diffA));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo returns the original diff", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    act(() => result.current.push(diffA));
    act(() => void result.current.undo());

    let applied: SpecDiff | null = null;
    act(() => {
      applied = result.current.redo();
    });
    expect(applied).toEqual(diffA);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undoes in reverse order", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    act(() => {
      result.current.push(diffA);
      result.current.push(diffB);
    });
    let first: SpecDiff | null = null;
    act(() => {
      first = result.current.undo();
    });
    expect(first).toEqual(invertSpecDiff(diffB));
  });

  it("a new push clears the redo stack", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    act(() => result.current.push(diffA));
    act(() => void result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.push(diffB));
    expect(result.current.canRedo).toBe(false);
  });

  it("clear empties both stacks", () => {
    const { result } = renderHook(() => useSpecDiffHistory());
    act(() => result.current.push(diffA));
    act(() => void result.current.undo());
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
