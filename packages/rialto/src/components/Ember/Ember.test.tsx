import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Ember } from "./Ember";
import { GOLD_EVERY, SPARK_COUNT } from "./ember-spark";
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
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
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

describe("Ember", () => {
  it("is aria-hidden — decorative only", () => {
    const { container } = render(<Ember />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes no role", () => {
    const { container } = render(<Ember />);
    expect(container.firstElementChild).not.toHaveAttribute("role");
  });

  it("merges a consumer className onto the root", () => {
    const { container } = render(<Ember className="hero-bg" />);
    expect(container.firstElementChild).toHaveClass("hero-bg");
  });

  /* ── Reduced motion ───────────────────────────────────────── */

  describe("prefers-reduced-motion", () => {
    it("renders a static poster instead of a canvas", () => {
      const { container } = render(<Ember />);
      expect(container.querySelector("canvas")).toBeNull();
      expect(container.querySelector("[data-ember-poster]")).not.toBeNull();
    });

    it("never starts an animation frame loop", () => {
      render(<Ember />);
      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("registers no observers", () => {
      render(<Ember />);
      expect(FakeIntersectionObserver.instances).toHaveLength(0);
    });
  });

  /* ── Animated path ────────────────────────────────────────── */

  describe("animated", () => {
    beforeEach(() => {
      setMatchingMedia([]);
    });

    it("mounts a canvas and starts the frame loop", () => {
      const { container } = render(<Ember />);
      expect(container.querySelector("canvas")).not.toBeNull();
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("sizes the backing store by device pixel ratio, capped at 2", () => {
      vi.stubGlobal("devicePixelRatio", 3);
      const { container } = render(<Ember />);
      const canvas = container.querySelector("canvas");
      expect(canvas?.width).toBe(CANVAS_WIDTH * 2);
      expect(canvas?.height).toBe(CANVAS_HEIGHT * 2);
    });

    it("repaints an opaque surface every frame — sparks leave no trails", () => {
      render(<Ember />);
      step();
      step();
      expect(harness.alphas[0]).toBe(1);
      expect(harness.ctx.fillRect).toHaveBeenCalledTimes(2);
    });

    it("draws one spark per slot every frame", () => {
      render(<Ember />);
      step();
      expect(harness.ctx.arc).toHaveBeenCalledTimes(SPARK_COUNT);
      expect(harness.ctx.fill).toHaveBeenCalledTimes(SPARK_COUNT);
    });

    it("lights only the hottest 5% in the gold accent", () => {
      document.documentElement.style.setProperty("--rialto-surface", "#101010");
      document.documentElement.style.setProperty("--rialto-accent", "#c8a04a");
      document.documentElement.style.setProperty("--rialto-text-primary", "#e8e6e1");
      render(<Ember />);
      step();
      expect(harness.fillStyles).toContain("#101010");
      expect(harness.fillStyles.filter((color) => color === "#c8a04a")).toHaveLength(1);
      expect(harness.fillStyles.filter((color) => color === "#e8e6e1")).toHaveLength(1);
      // Gold is drawn last, so its sparks are the final SPARK_COUNT / GOLD_EVERY fills.
      expect(harness.fillStyles.at(-1)).toBe("#c8a04a");
      expect(SPARK_COUNT / GOLD_EVERY).toBe(SPARK_COUNT * 0.05);
    });

    it("keeps rising — the same spark is drawn higher a moment later", () => {
      render(<Ember />);
      step();
      const firstFrame = harness.ctx.arc.mock.calls.slice(0, 5);
      harness.ctx.arc.mockClear();
      step();
      expect(harness.ctx.arc.mock.calls.slice(0, 5)).not.toEqual(firstFrame);
    });

    it("releases every frame, listener and observer on unmount", () => {
      const removeWindowListener = vi.spyOn(window, "removeEventListener");
      const removeDocumentListener = vi.spyOn(document, "removeEventListener");
      const { unmount } = render(<Ember />);
      const observer = FakeIntersectionObserver.instances[0];

      unmount();

      expect(cancelSpy).toHaveBeenCalled();
      expect(observer?.disconnect).toHaveBeenCalled();
      expect(removeWindowListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
      expect(removeWindowListener).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    });

    it("observes the canvas for viewport intersection", () => {
      const { container } = render(<Ember />);
      const observer = FakeIntersectionObserver.instances[0];
      expect(observer?.observe).toHaveBeenCalledWith(container.querySelector("canvas"));
    });

    /* ── Playback gating ──────────────────────────────────── */

    it("pauses the loop while the canvas is off viewport, and resumes on return", () => {
      render(<Ember />);
      setIntersecting(false);
      expect(cancelSpy).toHaveBeenCalled();

      const queuedBefore = frames.length;
      setIntersecting(true);
      expect(frames.length).toBeGreaterThan(queuedBefore);
    });

    it("pauses the loop while the tab is hidden", () => {
      render(<Ember />);
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(cancelSpy).toHaveBeenCalled();
    });

    /* ── Pointer ──────────────────────────────────────────── */

    it("bends sparks near the pointer like a draft", () => {
      render(<Ember />);
      step();
      step();
      harness.ctx.arc.mockClear();
      step();
      const resting = harness.ctx.arc.mock.calls.map((call) => [call[0], call[1]]);
      cleanup();
      frames.length = 0;

      // Fresh run, same clock: the pointer sits mid-canvas, among the sparks.
      render(<Ember />);
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: CANVAS_WIDTH / 2,
          clientY: CANVAS_HEIGHT / 2,
        })
      );
      step();
      step();
      harness.ctx.arc.mockClear();
      step();
      const bent = harness.ctx.arc.mock.calls.map((call) => [call[0], call[1]]);

      expect(bent).not.toEqual(resting);
    });

    /* ── Theme reactivity ─────────────────────────────────── */

    it("re-reads the surface token when data-theme changes", async () => {
      document.documentElement.style.setProperty("--rialto-surface", "#f6f4f0");
      render(<Ember />);
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

    it("reads tokens from the nearest theme scope, not the document root", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.style.setProperty("--rialto-surface", "#161514");
      document.documentElement.style.setProperty("--rialto-accent", "#d4a23a");
      document.documentElement.style.setProperty("--rialto-text-primary", "#fdfcfa");

      const island = document.createElement("div");
      island.setAttribute("data-theme", "light");
      island.style.setProperty("--rialto-surface", "#f8f6f3");
      island.style.setProperty("--rialto-accent", "#b0841e");
      island.style.setProperty("--rialto-text-primary", "#1a1918");
      document.body.appendChild(island);

      try {
        render(<Ember />, { container: island });
        step();
        expect(harness.fillStyles).toContain("#f8f6f3");
        expect(harness.fillStyles).toContain("#1a1918");
        expect(harness.fillStyles).toContain("#b0841e");
        expect(harness.fillStyles).not.toContain("#161514");
        expect(harness.fillStyles).not.toContain("#fdfcfa");
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
              <Ember />
            </div>
          </div>
        );
        step();
        expect(harness.fillStyles[0]).toBe("#f8f6f3");
        expect(harness.fillStyles).toContain("#b0841e");
        expect(harness.fillStyles).not.toContain("#d4a23a");
      } finally {
        style.remove();
      }
    });

    it("deepens spark opacity in the dark theme", () => {
      /** Peak spark alpha of one frame, ignoring the leading surface fill. */
      function peakAlpha(theme: string | null) {
        if (theme) document.documentElement.setAttribute("data-theme", theme);
        else document.documentElement.removeAttribute("data-theme");
        harness.alphas.length = 0;
        frames.length = 0;
        const { unmount } = render(<Ember />);
        step();
        unmount();
        return Math.max(...harness.alphas.slice(1));
      }

      expect(peakAlpha("dark")).toBeGreaterThan(peakAlpha(null));
    });
  });
});
