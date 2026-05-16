import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelLayout } from "./usePanelLayout.js";

// Mock matchMedia — returns false for all queries (desktop breakpoint)
function makeMockMatchMedia(mobileMatches: boolean, tabletMatches: boolean) {
  return vi.fn().mockImplementation((query: string) => {
    let matches = false;
    if (query === "(max-width: 767px)") matches = mobileMatches;
    if (query === "(min-width: 768px) and (max-width: 1024px)") matches = tabletMatches;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
}

beforeEach(() => {
  localStorage.clear();
  // Default: desktop (no query matches)
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: makeMockMatchMedia(false, false),
  });
});

describe("usePanelLayout — desktop defaults", () => {
  it("defaults to desktop breakpoint with both panels visible", () => {
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.breakpoint).toBe("desktop");
    expect(result.current.historyVisible).toBe(true);
    expect(result.current.inspectorVisible).toBe(true);
  });
});

describe("usePanelLayout — mobile defaults", () => {
  it("defaults to mobile breakpoint with both panels hidden", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMockMatchMedia(true, false),
    });
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.breakpoint).toBe("mobile");
    expect(result.current.historyVisible).toBe(false);
    expect(result.current.inspectorVisible).toBe(false);
  });
});

describe("usePanelLayout — tablet defaults", () => {
  it("defaults to tablet breakpoint with inspector visible, history hidden", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMockMatchMedia(false, true),
    });
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.breakpoint).toBe("tablet");
    expect(result.current.historyVisible).toBe(false);
    expect(result.current.inspectorVisible).toBe(true);
  });
});

describe("usePanelLayout — toggles", () => {
  it("toggleHistory flips historyVisible", () => {
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.historyVisible).toBe(true);
    act(() => {
      result.current.toggleHistory();
    });
    expect(result.current.historyVisible).toBe(false);
    act(() => {
      result.current.toggleHistory();
    });
    expect(result.current.historyVisible).toBe(true);
  });

  it("toggleInspector flips inspectorVisible", () => {
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.inspectorVisible).toBe(true);
    act(() => {
      result.current.toggleInspector();
    });
    expect(result.current.inspectorVisible).toBe(false);
    act(() => {
      result.current.toggleInspector();
    });
    expect(result.current.inspectorVisible).toBe(true);
  });

  it("closeOverlays hides both panels on mobile", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMockMatchMedia(true, false),
    });
    const { result } = renderHook(() => usePanelLayout());
    // Manually open both panels first via toggle
    act(() => {
      result.current.toggleHistory();
    });
    act(() => {
      result.current.toggleInspector();
    });
    expect(result.current.historyVisible).toBe(true);
    expect(result.current.inspectorVisible).toBe(true);

    act(() => {
      result.current.closeOverlays();
    });
    expect(result.current.historyVisible).toBe(false);
    expect(result.current.inspectorVisible).toBe(false);
  });

  it("closeOverlays does not change panels on desktop", () => {
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.historyVisible).toBe(true);
    expect(result.current.inspectorVisible).toBe(true);

    act(() => {
      result.current.closeOverlays();
    });
    expect(result.current.historyVisible).toBe(true);
    expect(result.current.inspectorVisible).toBe(true);
  });
});

describe("usePanelLayout — localStorage persistence", () => {
  it("persists state to localStorage after toggle", () => {
    const { result } = renderHook(() => usePanelLayout());
    act(() => {
      result.current.toggleHistory();
    });
    const stored = JSON.parse(localStorage.getItem("gen-panel-prefs") ?? "{}") as Record<
      string,
      { historyVisible: boolean; inspectorVisible: boolean }
    >;
    expect(stored["desktop"]).toEqual({ historyVisible: false, inspectorVisible: true });
  });

  it("loads saved prefs from localStorage on mount", () => {
    localStorage.setItem(
      "gen-panel-prefs",
      JSON.stringify({ desktop: { historyVisible: false, inspectorVisible: false } })
    );
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.historyVisible).toBe(false);
    expect(result.current.inspectorVisible).toBe(false);
  });
});
