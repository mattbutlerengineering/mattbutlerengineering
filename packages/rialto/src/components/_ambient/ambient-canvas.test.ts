import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAmbientCanvas } from "./ambient-canvas";

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

const setTransform = vi.fn();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let frames: FrameRequestCallback[];
let teardowns: Array<() => void> = [];
let cancelSpy: ReturnType<typeof vi.spyOn>;

function step() {
  frames.shift()?.(performance.now());
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  return canvas;
}

function start(
  canvas: HTMLCanvasElement,
  overrides: Partial<Parameters<typeof startAmbientCanvas>[1]> = {}
) {
  const onResize = vi.fn();
  const onFrame = vi.fn();
  const readPalette = vi.fn(() => "palette-1");
  const teardown = startAmbientCanvas(canvas, { onResize, onFrame, readPalette, ...overrides });
  teardowns.push(teardown);
  return { onResize, onFrame, readPalette, teardown };
}

beforeEach(() => {
  frames = [];
  FakeIntersectionObserver.instances = [];
  setTransform.mockClear();
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 300,
  });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  for (const teardown of teardowns) teardown();
  teardowns = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientHeight");
  Reflect.deleteProperty(document, "hidden");
  document.documentElement.removeAttribute("data-theme");
  document.body.innerHTML = "";
});

describe("startAmbientCanvas", () => {
  it("is a no-op teardown when the canvas has no 2d context", () => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const { onResize, teardown } = start(makeCanvas());
    expect(onResize).not.toHaveBeenCalled();
    expect(() => teardown()).not.toThrow();
  });

  it("sizes the backing store with a DPR capped at 2 and reports the size", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const canvas = makeCanvas();
    const { onResize } = start(canvas);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(onResize).toHaveBeenCalledWith(expect.objectContaining({ width: 400, height: 300 }));
  });

  it("re-runs onResize when the window resizes", () => {
    const { onResize } = start(makeCanvas());
    window.dispatchEvent(new Event("resize"));
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it("draws frames with the palette and pointer position relative to the canvas", () => {
    const canvas = makeCanvas();
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
    const { onFrame } = start(canvas);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 110, clientY: 70 }));
    step();
    const frame = onFrame.mock.calls[0]?.[0];
    expect(frame.palette).toBe("palette-1");
    expect(frame.pointer).toEqual({ x: 100, y: 50 });
    expect(frames).toHaveLength(1);
  });

  it("pauses when scrolled offscreen and resumes when back on screen", () => {
    start(makeCanvas());
    setIntersecting(false);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    frames = [];
    setIntersecting(true);
    expect(frames).toHaveLength(1);
  });

  it("pauses while the document is hidden", () => {
    start(makeCanvas());
    setDocumentHidden(true);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    frames = [];
    setDocumentHidden(false);
    expect(frames).toHaveLength(1);
  });

  it("re-reads the palette when data-theme flips", async () => {
    const readPalette = vi.fn().mockReturnValueOnce("light").mockReturnValue("dark");
    const { onFrame } = start(makeCanvas(), { readPalette });
    document.documentElement.setAttribute("data-theme", "dark");
    await Promise.resolve();
    step();
    expect(readPalette).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls[0]?.[0].palette).toBe("dark");
  });

  it("releases every listener and observer on teardown", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const disconnectMutation = vi.spyOn(MutationObserver.prototype, "disconnect");
    const { teardown, onFrame, onResize } = start(makeCanvas());
    teardown();
    expect(cancelSpy).toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances[0]?.disconnect).toHaveBeenCalled();
    expect(disconnectMutation).toHaveBeenCalled();
    expect(removeWindow).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    window.dispatchEvent(new Event("resize"));
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onFrame).not.toHaveBeenCalled();
  });
});
