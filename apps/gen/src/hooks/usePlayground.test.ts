import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Spec } from "@json-render/react";

// -----------------------------------------------------------------------------
// Module mocks — hoisted state so the hook's own choreography is exercised
// without the session internals or the DOM-heavy shell tree.
// -----------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  toast: vi.fn(),
  toggleTheme: vi.fn(),
  reset: vi.fn(),
  toggleGallery: vi.fn(),
  toggleShortcuts: vi.fn(),
  openGallery: vi.fn(),
  downloadJson: vi.fn(),
  sessionError: null as Error | null,
  capturedOnComplete: undefined as (() => void) | undefined,
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ signOut: h.signOut }),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  useToast: () => ({ toast: h.toast }),
}));

vi.mock("../contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: h.toggleTheme }),
}));

vi.mock("../utils/downloadJson.js", () => ({
  downloadJson: h.downloadJson,
}));

vi.mock("../pages/usePlaygroundSession.js", () => ({
  usePlaygroundSession: (options?: { onGenerationComplete?: () => void }) => {
    h.capturedOnComplete = options?.onGenerationComplete;
    return {
      reset: h.reset,
      error: h.sessionError,
      toggleGallery: h.toggleGallery,
      toggleShortcuts: h.toggleShortcuts,
      openGallery: h.openGallery,
      isFullscreen: false,
    };
  },
}));

import {
  usePlayground,
  buildPlaygroundCommandItems,
  type PlaygroundCommandDeps,
} from "./usePlayground.js";

const fakeSpec = { type: "Box", props: {} } as unknown as Spec;

function makeCommandDeps(overrides: Partial<PlaygroundCommandDeps> = {}): PlaygroundCommandDeps {
  return {
    isStreaming: false,
    displaySpec: null,
    reset: vi.fn(),
    toggleFullscreen: vi.fn(),
    stop: vi.fn(),
    openGallery: vi.fn(),
    openShortcuts: vi.fn(),
    copy: vi.fn(),
    toggleTheme: vi.fn(),
    onSignOut: vi.fn(),
    closePalette: vi.fn(),
    toggleHistory: vi.fn(),
    toggleInspector: vi.fn(),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// buildPlaygroundCommandItems — pure, no DOM, no React.
// -----------------------------------------------------------------------------

describe("buildPlaygroundCommandItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the base action/panel/setting items when idle", () => {
    const items = buildPlaygroundCommandItems(makeCommandDeps());
    expect(items.map((i) => i.id)).toEqual([
      "new-generation",
      "toggle-fullscreen",
      "open-templates",
      "toggle-history",
      "toggle-inspector",
      "keyboard-shortcuts",
      "toggle-theme",
      "sign-out",
    ]);
  });

  it("adds Stop Generation only while streaming, right after fullscreen", () => {
    const items = buildPlaygroundCommandItems(makeCommandDeps({ isStreaming: true }));
    const ids = items.map((i) => i.id);
    expect(ids).toContain("stop-generation");
    expect(ids.indexOf("stop-generation")).toBe(ids.indexOf("toggle-fullscreen") + 1);
  });

  it("adds the export items only when a spec is on screen", () => {
    const idle = buildPlaygroundCommandItems(makeCommandDeps()).map((i) => i.id);
    expect(idle).not.toContain("export-spec");
    expect(idle).not.toContain("copy-spec-json");

    const withSpec = buildPlaygroundCommandItems(makeCommandDeps({ displaySpec: fakeSpec }));
    const exportItems = withSpec.filter((i) => i.group === "Export").map((i) => i.id);
    expect(exportItems).toEqual(["export-spec", "copy-spec-json"]);
  });

  it("closes the palette then runs the verb for each item", () => {
    const deps = makeCommandDeps({ isStreaming: true, displaySpec: fakeSpec });
    const items = buildPlaygroundCommandItems(deps);
    const run = (id: string) => {
      const item = items.find((i) => i.id === id);
      expect(item, `missing command item: ${id}`).toBeDefined();
      item?.onSelect?.();
    };

    run("new-generation");
    expect(deps.reset).toHaveBeenCalledTimes(1);

    run("toggle-fullscreen");
    expect(deps.toggleFullscreen).toHaveBeenCalledTimes(1);

    run("stop-generation");
    expect(deps.stop).toHaveBeenCalledTimes(1);

    run("open-templates");
    expect(deps.openGallery).toHaveBeenCalledTimes(1);

    run("toggle-history");
    expect(deps.toggleHistory).toHaveBeenCalledTimes(1);

    run("toggle-inspector");
    expect(deps.toggleInspector).toHaveBeenCalledTimes(1);

    run("keyboard-shortcuts");
    expect(deps.openShortcuts).toHaveBeenCalledTimes(1);

    run("toggle-theme");
    expect(deps.toggleTheme).toHaveBeenCalledTimes(1);

    run("sign-out");
    expect(deps.onSignOut).toHaveBeenCalledTimes(1);

    // Every selection dismisses the palette first.
    expect(deps.closePalette).toHaveBeenCalledTimes(9);
  });

  it("downloads and copies the on-screen spec JSON via the export items", () => {
    const deps = makeCommandDeps({ displaySpec: fakeSpec });
    const items = buildPlaygroundCommandItems(deps);

    items.find((i) => i.id === "export-spec")?.onSelect?.();
    expect(h.downloadJson).toHaveBeenCalledWith(fakeSpec);

    items.find((i) => i.id === "copy-spec-json")?.onSelect?.();
    expect(deps.copy).toHaveBeenCalledWith(JSON.stringify(fakeSpec, null, 2));
  });
});

// -----------------------------------------------------------------------------
// usePlayground — hook choreography (session isolated via mock).
// -----------------------------------------------------------------------------

describe("usePlayground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sessionError = null;
    h.capturedOnComplete = undefined;
  });

  it("resets the session and signs out on onSignOut", () => {
    const { result } = renderHook(() => usePlayground());
    act(() => result.current.onSignOut());
    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it("resets the session on onLogoClick", () => {
    const { result } = renderHook(() => usePlayground());
    act(() => result.current.onLogoClick());
    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("opens the template gallery on onTemplatesOpen", () => {
    const { result } = renderHook(() => usePlayground());
    act(() => result.current.onTemplatesOpen());
    expect(h.openGallery).toHaveBeenCalledTimes(1);
  });

  it("exposes toggleTheme from the theme context", () => {
    const { result } = renderHook(() => usePlayground());
    act(() => result.current.toggleTheme());
    expect(h.toggleTheme).toHaveBeenCalledTimes(1);
  });

  it("toasts a success on generation complete", () => {
    renderHook(() => usePlayground());
    expect(h.capturedOnComplete).toBeDefined();
    act(() => h.capturedOnComplete?.());
    expect(h.toast).toHaveBeenCalledWith({
      title: "Generation complete",
      variant: "success",
      duration: 3000,
    });
  });

  it("does not toast an error while the session is healthy", () => {
    renderHook(() => usePlayground());
    expect(h.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Generation failed" })
    );
  });

  it("toasts an error when the session reports one", () => {
    const { rerender } = renderHook(() => usePlayground());
    h.sessionError = new Error("boom");
    act(() => rerender());
    expect(h.toast).toHaveBeenCalledWith({
      title: "Generation failed",
      description: "boom",
      variant: "error",
      duration: 5000,
    });
  });

  it("toggles the gallery on Cmd/Ctrl+T", () => {
    renderHook(() => usePlayground());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "t", metaKey: true }));
    });
    expect(h.toggleGallery).toHaveBeenCalledTimes(1);
  });

  it("toggles the shortcuts help on '?'", () => {
    renderHook(() => usePlayground());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });
    expect(h.toggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("ignores '?' while typing in a form field", () => {
    renderHook(() => usePlayground());
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });
    expect(h.toggleShortcuts).not.toHaveBeenCalled();
    input.remove();
  });
});
