// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTextures } from "../hooks/useTextures";

// Mock Image constructor to simulate async loading
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    setTimeout(() => { if (this.onload) this.onload(); }, 0);
  }
}
vi.stubGlobal("Image", MockImage);

describe("useTextures", () => {
  it("starts with loaded false", () => {
    const { result } = renderHook(() => useTextures());
    expect(result.current.loaded).toBe(false);
  });

  it("sets loaded to true after all images load", async () => {
    const { result } = renderHook(() => useTextures());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(result.current.loaded).toBe(true);
  });

  it("provides texture images by key", async () => {
    const { result } = renderHook(() => useTextures());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(result.current.textures["table-round"]).toBeDefined();
    expect(result.current.textures["chair"]).toBeDefined();
    expect(result.current.textures["hardwood"]).toBeDefined();
    expect(result.current.textures["concrete"]).toBeDefined();
  });
});
