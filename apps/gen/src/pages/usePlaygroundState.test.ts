import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaygroundState } from "./usePlaygroundState.js";

describe("usePlaygroundState", () => {
  it("starts in generate mode with all overlays closed and not fullscreen", () => {
    const { result } = renderHook(() => usePlaygroundState());
    expect(result.current.mode).toBe("generate");
    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.galleryOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(false);
  });

  it("enterRefinement / exitRefinement switch mode", () => {
    const { result } = renderHook(() => usePlaygroundState());
    act(() => result.current.enterRefinement());
    expect(result.current.mode).toBe("refine");
    act(() => result.current.exitRefinement());
    expect(result.current.mode).toBe("generate");
  });

  it("open/close/toggle gallery", () => {
    const { result } = renderHook(() => usePlaygroundState());
    act(() => result.current.openGallery());
    expect(result.current.galleryOpen).toBe(true);
    act(() => result.current.closeGallery());
    expect(result.current.galleryOpen).toBe(false);
    act(() => result.current.toggleGallery());
    expect(result.current.galleryOpen).toBe(true);
    act(() => result.current.toggleGallery());
    expect(result.current.galleryOpen).toBe(false);
  });

  it("open/close/toggle shortcuts", () => {
    const { result } = renderHook(() => usePlaygroundState());
    act(() => result.current.openShortcuts());
    expect(result.current.shortcutsOpen).toBe(true);
    act(() => result.current.closeShortcuts());
    expect(result.current.shortcutsOpen).toBe(false);
    act(() => result.current.toggleShortcuts());
    expect(result.current.shortcutsOpen).toBe(true);
    act(() => result.current.toggleShortcuts());
    expect(result.current.shortcutsOpen).toBe(false);
  });

  it("toggleFullscreen flips fullscreen and closes any open overlays", () => {
    const { result } = renderHook(() => usePlaygroundState());
    act(() => {
      result.current.openGallery();
      result.current.openShortcuts();
    });
    expect(result.current.galleryOpen).toBe(true);
    expect(result.current.shortcutsOpen).toBe(true);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    // entering fullscreen dismisses overlays
    expect(result.current.galleryOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(false);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
  });

  it("exposes stable transition callback identities across renders", () => {
    const { result, rerender } = renderHook(() => usePlaygroundState());
    const first = result.current.toggleFullscreen;
    rerender();
    expect(result.current.toggleFullscreen).toBe(first);
  });
});
