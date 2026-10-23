import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { renderHook, render, screen, act, waitFor } from "@testing-library/react";
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

/**
 * Consumes the hook from inside a real tree, so the StrictMode case can be
 * driven through `render` rather than `renderHook` — measured: `renderHook`'s
 * `wrapper` does not put the hook's host inside StrictMode, so effects there
 * run once and a <StrictMode> wrapper would assert nothing.
 */
function TextureProbe({ materials }: { materials: FloorMaterial[] }) {
  const textures = useFloorTextures(materials);
  return <span data-testid="loaded">{[...textures.keys()].sort().join(",")}</span>;
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

  it("publishes a texture whose load lands after the section list already changed", async () => {
    const { result, rerender } = renderHook(
      ({ m }: { m: FloorMaterial[] }) => useFloorTextures(m),
      {
        initialProps: { m: ["hardwood"] as FloorMaterial[] },
      }
    );
    const inFlight = FakeImage.find("hardwood");

    // The operator adds a section while hardwood's PNG is still downloading.
    // The request was deduped against the component's lifetime, so tearing down
    // this effect run must not discard the load it already started — nothing
    // would ever ask for it again.
    rerender({ m: ["hardwood", "tile"] });
    act(() => inFlight?.onload?.());

    await waitFor(() => expect(result.current.get("hardwood")).toBeDefined());
  });

  it("renders textures under StrictMode's double-invoked mount effect, which is what dev runs", async () => {
    // `main.tsx` wraps the app in <StrictMode>, so every dev mount really is
    // effect -> cleanup -> effect (measured here, not assumed — the length
    // assertion below is what keeps this test exercising that sequence).
    render(
      <StrictMode>
        <TextureProbe materials={["hardwood"]} />
      </StrictMode>
    );

    // One request across both effect runs: the dedupe guard spans the
    // component's lifetime, which is exactly why the first run's load must not
    // be thrown away — nothing will ever ask for it again.
    expect(FakeImage.instances).toHaveLength(1);

    act(() => FakeImage.find("hardwood")?.onload?.());

    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("hardwood"));
  });

  it("requests nothing when no section has a material", () => {
    renderHook(() => useFloorTextures([]));
    expect(FakeImage.instances).toHaveLength(0);
  });

  it("survives a load that resolves after unmount without throwing or warning", async () => {
    // The hook keeps no cancel flag (see its comment), so this is the case that
    // justifies that: a `setState` from a post-unmount load is a React no-op,
    // not an error, and nothing is rendered from it.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useFloorTextures(["hardwood"]));
    const image = FakeImage.find("hardwood");
    unmount();

    expect(() => act(() => image?.onload?.())).not.toThrow();
    expect(result.current.size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
