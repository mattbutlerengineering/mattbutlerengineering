import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { SilkFlow } from "./SilkFlow";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../../test/match-media";

/**
 * Each test chooses its branch through the device signal `useMotionPreset()`
 * reads: reduced by default (as `src/test/setup.ts` is), full motion in the
 * "animated" block.
 */
stubMatchMedia([PREFERS_REDUCED_MOTION]);

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

/** Installs the real generated token stylesheet so nested scopes resolve. */
function installTokenStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(__dirname, "../../tokens/colors.css"), "utf8");
  document.head.appendChild(style);
  return style;
}

beforeEach(() => {
  setMatchingMedia([PREFERS_REDUCED_MOTION]);
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
      setMatchingMedia([]);
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

    it("reads tokens from the nearest theme scope, not the document root", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.style.setProperty("--rialto-surface", "#161514");
      document.documentElement.style.setProperty("--rialto-accent", "#d4a23a");
      document.documentElement.style.setProperty("--rialto-text-primary", "#fdfcfa");

      // Inline on the island, so this locks the engine's read target even
      // before the stylesheet re-declares the light palette.
      const island = document.createElement("div");
      island.setAttribute("data-theme", "light");
      island.style.setProperty("--rialto-surface", "#f8f6f3");
      island.style.setProperty("--rialto-accent", "#b0841e");
      island.style.setProperty("--rialto-text-primary", "#1a1918");
      document.body.appendChild(island);

      try {
        render(<SilkFlow />, { container: island });
        step();
        expect(harness.fillStyles).toContain("#f8f6f3");
        expect(harness.strokeStyles).toContain("#1a1918");
        expect(harness.strokeStyles).toContain("#b0841e");
        expect(harness.fillStyles).not.toContain("#161514");
        // Light gold alpha is 0.4; the dark theme deepens it to 0.5.
        expect(Math.max(...harness.alphas.slice(1))).toBeCloseTo(0.4);
      } finally {
        island.remove();
      }
    });

    it("paints a light island with the light surface while the document is dark", () => {
      const style = installTokenStyles();
      try {
        document.documentElement.setAttribute("data-theme", "dark");
        render(
          <div data-theme="dark">
            <div data-theme="light">
              <SilkFlow />
            </div>
          </div>
        );
        step();
        expect(harness.fillStyles[0]).toBe("#f8f6f3");
        expect(harness.strokeStyles).toContain("#1a1918");
        expect(harness.strokeStyles).toContain("#b0841e");
        expect(harness.strokeStyles).not.toContain("#d4a23a");
        // Light silk is fainter than dark silk (0.11 vs 0.16). The gold accent
        // is the peak, and the light theme keeps it at 0.4 rather than 0.5.
        expect(Math.max(...harness.alphas.slice(1))).toBeCloseTo(0.4);
      } finally {
        style.remove();
      }
    });

    it("keeps that light island light when the document theme flips to dark", async () => {
      const style = installTokenStyles();
      const computed = vi.spyOn(window, "getComputedStyle");
      try {
        document.documentElement.setAttribute("data-theme", "light");
        render(
          <div data-theme="light">
            <SilkFlow />
          </div>
        );
        step();
        expect(harness.fillStyles[0]).toBe("#f8f6f3");

        const readsBeforeFlip = computed.mock.calls.length;
        document.documentElement.setAttribute("data-theme", "dark");
        // The observer re-reads on a microtask. Wait until that read happens,
        // then paint — a frame from before the flip is still the light color
        // and would hide a regression.
        await vi.waitFor(() => {
          expect(computed.mock.calls.length).toBeGreaterThan(readsBeforeFlip);
        });
        harness.fillStyles.length = 0;
        step();
        expect(harness.fillStyles[0]).toBe("#f8f6f3");
      } finally {
        computed.mockRestore();
        style.remove();
      }
    });

    it("paints a dark island with the dark surface while the document is light", () => {
      const style = installTokenStyles();
      try {
        document.documentElement.setAttribute("data-theme", "light");
        render(
          <div data-theme="light">
            <div data-theme="dark">
              <SilkFlow />
            </div>
          </div>
        );
        step();
        expect(harness.fillStyles[0]).toBe("#1e1c1a");
        expect(Math.max(...harness.alphas.slice(1))).toBeCloseTo(0.5);
      } finally {
        style.remove();
      }
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
