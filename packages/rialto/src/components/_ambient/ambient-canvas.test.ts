import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAX_DPR, startAmbientCanvas } from "./ambient-canvas";

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observe = vi.fn();
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

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

const ctx = { setTransform: vi.fn() };
let canvas: HTMLCanvasElement;
let frames: FrameRequestCallback[];
let teardowns: Array<() => void> = [];
let cancelSpy: ReturnType<typeof vi.spyOn>;

function stubClientSize(property: "clientWidth" | "clientHeight", size: number) {
  Object.defineProperty(canvas, property, { configurable: true, get: () => size });
}

beforeEach(() => {
  ctx.setTransform = vi.fn();
  frames = [];
  teardowns = [];
  FakeIntersectionObserver.instances = [];
  canvas = document.createElement("canvas");
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
  stubClientSize("clientWidth", 400);
  stubClientSize("clientHeight", 300);
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  for (const teardown of teardowns) teardown();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "hidden");
  document.documentElement.removeAttribute("data-theme");
});

function start(overrides: Partial<Parameters<typeof startAmbientCanvas>[1]> = {}) {
  const options = {
    readPalette: vi.fn(() => ({ tone: "a" })),
    onResize: vi.fn(),
    onFrame: vi.fn(),
    ...overrides,
  };
  const teardown = startAmbientCanvas(canvas, options);
  teardowns.push(teardown);
  return { options, teardown };
}

describe("startAmbientCanvas", () => {
  it("returns a no-op teardown and observes nothing without a 2d context", () => {
    canvas.getContext = (() => null) as unknown as typeof canvas.getContext;
    const { teardown } = start();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(() => teardown()).not.toThrow();
  });

  it("sizes the canvas to the DPR, capped at MAX_DPR, and reports CSS size", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const { options } = start();
    expect(canvas.width).toBe(400 * MAX_DPR);
    expect(canvas.height).toBe(300 * MAX_DPR);
    expect(ctx.setTransform).toHaveBeenCalledWith(MAX_DPR, 0, 0, MAX_DPR, 0, 0);
    expect(options.onResize).toHaveBeenCalledWith({ width: 400, height: 300 });
  });

  it("uses a sub-cap DPR as-is and re-runs onResize on window resize", () => {
    vi.stubGlobal("devicePixelRatio", 1.5);
    const { options } = start();
    expect(canvas.width).toBe(600);
    window.dispatchEvent(new Event("resize"));
    expect(options.onResize).toHaveBeenCalledTimes(2);
  });

  it("runs frames with the palette, size, ctx and pointer", () => {
    const { options } = start();
    expect(frames).toHaveLength(1);
    frames.shift()?.(0);
    const frame = vi.mocked(options.onFrame).mock.calls[0]?.[0];
    expect(frame).toMatchObject({ ctx, palette: { tone: "a" }, width: 400, height: 300 });
    expect(frames).toHaveLength(1);
  });

  it("tracks the pointer relative to the canvas", () => {
    const { options } = start();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 110, clientY: 70 }));
    frames.shift()?.(0);
    const frame = vi.mocked(options.onFrame).mock.calls[0]?.[0];
    expect(frame?.pointer).toEqual({ x: 100, y: 50 });
  });

  it("pauses when scrolled offscreen and resumes when visible again", () => {
    start();
    setIntersecting(false);
    expect(cancelSpy).toHaveBeenCalled();
    const queued = frames.length;
    setIntersecting(true);
    expect(frames.length).toBe(queued + 1);
  });

  it("pauses while the document is hidden and resumes when shown", () => {
    start();
    setDocumentHidden(true);
    expect(cancelSpy).toHaveBeenCalled();
    const queued = frames.length;
    setDocumentHidden(false);
    expect(frames.length).toBe(queued + 1);
  });

  it("re-reads the palette when data-theme changes", async () => {
    const { options } = start();
    expect(options.readPalette).toHaveBeenCalledTimes(1);
    document.documentElement.setAttribute("data-theme", "dark");
    await Promise.resolve();
    await vi.waitFor(() => expect(options.readPalette).toHaveBeenCalledTimes(2));
  });

  it("teardown releases every listener and observer", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const { options, teardown } = start();
    teardown();

    expect(cancelSpy).toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances[0]?.disconnect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(removeWindow).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    window.dispatchEvent(new Event("resize"));
    expect(options.onResize).toHaveBeenCalledTimes(1);
  });
});
