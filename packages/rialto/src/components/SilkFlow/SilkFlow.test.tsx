import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { SilkFlow } from "./SilkFlow";

/**
 * `src/test/setup.ts` pins `useReducedMotion` to `true` for the whole suite.
 * This handle lets each test choose the branch it exercises.
 */
const motionPreference = vi.hoisted(() => ({ reduce: true }));

vi.mock("framer-motion", async () => {
  const actual =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() required for vi.importActual generic
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => motionPreference.reduce };
});

/* ── Canvas harness ─────────────────────────────────────────── */

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/** Records the paint state the engine drives, so frames can be asserted on. */
function createRecordingContext() {
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const alphas: number[] = [];
  const lineWidths: number[] = [];

  const ctx = {
    set fillStyle(value: string) {
      fillStyles.push(value);
    },
    set strokeStyle(value: string) {
      strokeStyles.push(value);
    },
    set globalAlpha(value: number) {
      alphas.push(value);
    },
    set lineWidth(value: number) {
      lineWidths.push(value);
    },
    lineCap: "butt",
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };

  return { ctx, fillStyles, strokeStyles, alphas, lineWidths };
}

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly notify: IntersectionCallback;

  constructor(callback: IntersectionCallback) {
    this.notify = (entries) => callback(entries);
    FakeIntersectionObserver.instances.push(this);
  }
}

function setIntersecting(isIntersecting: boolean) {
  for (const observer of FakeIntersectionObserver.instances) {
    observer.notify([{ isIntersecting } as IntersectionObserverEntry]);
  }
}

function stubClientSize(size: number, property: "clientWidth" | "clientHeight") {
  Object.defineProperty(HTMLCanvasElement.prototype, property, {
    configurable: true,
    get: () => size,
  });
}

let harness: ReturnType<typeof createRecordingContext>;
let frames: FrameRequestCallback[];
let cancelSpy: ReturnType<typeof vi.spyOn>;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

/** Runs the next queued animation frame. */
function step() {
  const frame = frames.shift();
  frame?.(performance.now());
}

beforeEach(() => {
  motionPreference.reduce = true;
  harness = createRecordingContext();
  frames = [];
  FakeIntersectionObserver.instances = [];

  HTMLCanvasElement.prototype.getContext = (() =>
    harness.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  stubClientSize(CANVAS_WIDTH, "clientWidth");
  stubClientSize(CANVAS_HEIGHT, "clientHeight");

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientHeight");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

/* ── Decorative contract ────────────────────────────────────── */

describe("SilkFlow", () => {
  it("is aria-hidden — decorative only", () => {
    const { container } = render(<SilkFlow />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes no role", () => {
    const { container } = render(<SilkFlow />);
    expect(container.firstElementChild).not.toHaveAttribute("role");
  });

  it("merges a consumer className onto the root", () => {
    const { container } = render(<SilkFlow className="hero-bg" />);
    expect(container.firstElementChild).toHaveClass("hero-bg");
  });

  /* ── Reduced motion ───────────────────────────────────────── */

  describe("prefers-reduced-motion", () => {
    it("renders a static poster instead of a canvas", () => {
      const { container } = render(<SilkFlow />);
      expect(container.querySelector("canvas")).toBeNull();
      expect(container.querySelector("[data-silk-poster]")).not.toBeNull();
    });

    it("never starts an animation frame loop", () => {
      render(<SilkFlow />);
      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("registers no observers", () => {
      render(<SilkFlow />);
      expect(FakeIntersectionObserver.instances).toHaveLength(0);
    });
  });

  /* ── Animated path ────────────────────────────────────────── */

  describe("animated", () => {
    beforeEach(() => {
      motionPreference.reduce = false;
    });

    it("mounts a canvas and starts the frame loop", () => {
      const { container } = render(<SilkFlow />);
      expect(container.querySelector("canvas")).not.toBeNull();
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("sizes the backing store by device pixel ratio, capped at 2", () => {
      vi.stubGlobal("devicePixelRatio", 3);
      const { container } = render(<SilkFlow />);
      const canvas = container.querySelector("canvas");
      expect(canvas?.width).toBe(CANVAS_WIDTH * 2);
      expect(canvas?.height).toBe(CANVAS_HEIGHT * 2);
    });

    it("paints an opaque surface wash on the first frame, then fades trails", () => {
      render(<SilkFlow />);
      step();
      const firstFrameAlpha = harness.alphas[0];
      harness.alphas.length = 0;
      step();
      expect(firstFrameAlpha).toBe(1);
      expect(harness.alphas[0]).toBeCloseTo(0.055);
    });

    it("strokes strands with the token colors, never hardcoded hex", () => {
      document.documentElement.style.setProperty("--rialto-surface", "#101010");
      document.documentElement.style.setProperty("--rialto-accent", "#c8a04a");
      document.documentElement.style.setProperty("--rialto-text-primary", "#e8e6e1");
      render(<SilkFlow />);
      step();
      expect(harness.fillStyles).toContain("#101010");
      expect(harness.strokeStyles).toContain("#e8e6e1");
      expect(harness.strokeStyles).toContain("#c8a04a");
    });

    it("releases every frame, listener and observer on unmount", () => {
      const removeWindowListener = vi.spyOn(window, "removeEventListener");
      const removeDocumentListener = vi.spyOn(document, "removeEventListener");
      const { unmount } = render(<SilkFlow />);
      const observer = FakeIntersectionObserver.instances[0];

      unmount();

      expect(cancelSpy).toHaveBeenCalled();
      expect(observer?.disconnect).toHaveBeenCalled();
      expect(removeWindowListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
      expect(removeWindowListener).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    });

    it("observes the canvas for viewport intersection", () => {
      const { container } = render(<SilkFlow />);
      const observer = FakeIntersectionObserver.instances[0];
      expect(observer?.observe).toHaveBeenCalledWith(container.querySelector("canvas"));
    });

    /* ── Playback gating ──────────────────────────────────── */

    it("pauses the loop while the canvas is off viewport, and resumes on return", () => {
      render(<SilkFlow />);
      setIntersecting(false);
      expect(cancelSpy).toHaveBeenCalled();

      const queuedBefore = frames.length;
      setIntersecting(true);
      expect(frames.length).toBeGreaterThan(queuedBefore);
    });

    it("pauses the loop while the tab is hidden", () => {
      render(<SilkFlow />);
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(cancelSpy).toHaveBeenCalled();
    });

    /* ── Theme reactivity ─────────────────────────────────── */

    it("re-reads the surface token when data-theme changes", async () => {
      document.documentElement.style.setProperty("--rialto-surface", "#f6f4f0");
      render(<SilkFlow />);
      step();
      expect(harness.fillStyles).toContain("#f6f4f0");

      document.documentElement.style.setProperty("--rialto-surface", "#161514");
      document.documentElement.setAttribute("data-theme", "dark");
      await vi.waitFor(() => {
        harness.fillStyles.length = 0;
        step();
        expect(harness.fillStyles).toContain("#161514");
      });
    });

    it("watches the document element for data-theme mutations only", () => {
      const observeSpy = vi.spyOn(MutationObserver.prototype, "observe");
      render(<SilkFlow />);
      expect(observeSpy).toHaveBeenCalledWith(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    });

    it("deepens strand opacity in the dark theme", () => {
      /** Peak stroke alpha of one frame, ignoring the leading surface wash. */
      function peakStrandAlpha(theme: string | null) {
        if (theme) document.documentElement.setAttribute("data-theme", theme);
        else document.documentElement.removeAttribute("data-theme");
        harness.alphas.length = 0;
        frames.length = 0;
        const { unmount } = render(<SilkFlow />);
        step();
        unmount();
        return Math.max(...harness.alphas.slice(1));
      }

      expect(peakStrandAlpha("dark")).toBeGreaterThan(peakStrandAlpha(null));
    });
  });
});
