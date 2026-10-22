import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { FloorMaterial } from "@mbe/types";
import { useFloorTextures } from "./useFloorTextures.js";

/* A stand-in for the browser's Image: nothing loads until a test resolves it,
 * so each case drives load and failure order explicitly. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private source = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(value: string) {
    this.source = value;
  }

  get src(): string {
    return this.source;
  }

  static find(material: FloorMaterial): FakeImage | undefined {
    return FakeImage.instances.find((i) => i.src.endsWith(`/${material}.png`));
  }
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFloorTextures", () => {
  it("starts empty, so a first paint renders flat section colours", () => {
    const { result } = renderHook(() => useFloorTextures(["hardwood"]));
    expect(result.current.size).toBe(0);
  });

  it("requests one image per distinct material, from the app's public path", () => {
    renderHook(() => useFloorTextures(["carpet", "hardwood", "carpet"]));
    expect(FakeImage.instances.map((i) => i.src).sort()).toEqual([
      "/floor-plan/textures/carpet.png",
      "/floor-plan/textures/hardwood.png",
    ]);
  });

  it("publishes each texture as it loads rather than waiting for the slowest", async () => {
    const { result } = renderHook(() => useFloorTextures(["hardwood", "marble"]));
    act(() => FakeImage.find("hardwood")?.onload?.());
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get("hardwood")).toBeDefined();
    expect(result.current.get("marble")).toBeUndefined();

    act(() => FakeImage.find("marble")?.onload?.());
    await waitFor(() => expect(result.current.size).toBe(2));
  });

  it("leaves a failed texture absent, so its section degrades to the flat colour", async () => {
    const { result } = renderHook(() => useFloorTextures(["carpet", "tile"]));
    act(() => FakeImage.find("carpet")?.onerror?.());
    act(() => FakeImage.find("tile")?.onload?.());
    await waitFor(() => expect(result.current.get("tile")).toBeDefined());
    expect(result.current.has("carpet")).toBe(false);
  });

  it("hands out a new map each time instead of mutating the one already rendered", async () => {
    const { result } = renderHook(() => useFloorTextures(["hardwood", "marble"]));
    const first = result.current;
    act(() => FakeImage.find("hardwood")?.onload?.());
    await waitFor(() => expect(result.current).not.toBe(first));
    expect(first.size).toBe(0);
  });

  it("does not re-request a material already requested when the section list changes", () => {
    const { rerender } = renderHook(({ m }: { m: FloorMaterial[] }) => useFloorTextures(m), {
      initialProps: { m: ["hardwood"] as FloorMaterial[] },
    });
    rerender({ m: ["hardwood", "tile"] });
    rerender({ m: ["tile", "hardwood"] });
    expect(FakeImage.instances).toHaveLength(2);
  });

  it("requests nothing when no section has a material", () => {
    renderHook(() => useFloorTextures([]));
    expect(FakeImage.instances).toHaveLength(0);
  });

  it("ignores a load that resolves after unmount", async () => {
    const { result, unmount } = renderHook(() => useFloorTextures(["hardwood"]));
    const image = FakeImage.find("hardwood");
    unmount();
    act(() => image?.onload?.());
    expect(result.current.size).toBe(0);
  });
});
