import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startFactoryScene } from "./factory-scene.js";

interface FakeDisposable {
  dispose: ReturnType<typeof vi.fn>;
}

interface FakeRenderer extends FakeDisposable {
  render: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
}

interface FakeMaterial extends FakeDisposable {
  uniforms: Record<string, { value: unknown }>;
  blending: number;
}

/**
 * A stand-in for the parts of three the scene touches. jsdom has no WebGL, so
 * the real renderer can never be constructed here — but the lifecycle contract
 * (draw only when visible, release everything on teardown) is exactly what must
 * not regress, so the constructors are faked and their disposals observed.
 */
const built = vi.hoisted(() => ({
  renderers: [] as FakeRenderer[],
  geometries: [] as FakeDisposable[],
  materials: [] as FakeMaterial[],
}));

vi.mock("three", () => {
  class WebGLRenderer {
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setClearColor = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    constructor() {
      built.renderers.push(this);
    }
  }
  class Scene {
    add = vi.fn();
  }
  class OrthographicCamera {}
  class BufferGeometry {
    setAttribute = vi.fn();
    dispose = vi.fn();
    constructor() {
      built.geometries.push(this);
    }
  }
  class PlaneGeometry extends BufferGeometry {}
  class BufferAttribute {
    constructor(
      public array: Float32Array,
      public itemSize: number
    ) {}
  }
  class ShaderMaterial {
    uniforms: Record<string, { value: unknown }>;
    blending = 1;
    needsUpdate = false;
    dispose = vi.fn();
    constructor(parameters: { uniforms?: Record<string, { value: unknown }> }) {
      this.uniforms = parameters.uniforms ?? {};
      built.materials.push(this);
    }
  }
  class Mesh {
    frustumCulled = true;
  }
  class Points {
    frustumCulled = true;
  }

  return {
    AdditiveBlending: 2,
    NormalBlending: 1,
    BufferAttribute,
    BufferGeometry,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Points,
    Scene,
    ShaderMaterial,
    WebGLRenderer,
  };
});

const INPUTS = { agentShare: 0.66, particleCount: 400 };

interface ObserverProbe {
  readonly disconnect: ReturnType<typeof vi.fn>;
  emit(isIntersecting: boolean): void;
}

let observers: ObserverProbe[] = [];
let frames = new Map<number, FrameRequestCallback>();
let nextFrameHandle = 0;
let cancelled: number[] = [];

/** A canvas that reports a live WebGL context. */
function mountCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.getContext = vi.fn(() => ({})) as unknown as HTMLCanvasElement["getContext"];
  document.body.append(canvas);
  return canvas;
}

/** Advances the loop by one frame, honouring any cancellation. */
function runFrame(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const frame of pending) frame(performance.now());
}

function drawCount(): number {
  return built.renderers[0]!.render.mock.calls.length;
}

beforeEach(() => {
  observers = [];
  frames = new Map();
  nextFrameHandle = 0;
  cancelled = [];
  built.renderers.length = 0;
  built.geometries.length = 0;
  built.materials.length = 0;

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = () => [];
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          disconnect: this.disconnect,
          emit: (isIntersecting) =>
            callback(
              [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
              this as unknown as IntersectionObserver
            ),
        });
      }
    }
  );

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrameHandle += 1;
    frames.set(nextFrameHandle, callback);
    return nextFrameHandle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    cancelled.push(handle);
    frames.delete(handle);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("startFactoryScene", () => {
  it("skips the scene when the browser gives no WebGL context, without throwing", () => {
    const canvas = document.createElement("canvas");
    canvas.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement["getContext"];

    const stop = startFactoryScene(canvas, INPUTS);

    expect(built.renderers).toHaveLength(0);
    expect(() => stop()).not.toThrow();
  });

  it("draws a frame while the canvas is on screen", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);

    runFrame();

    expect(drawCount()).toBeGreaterThan(0);
    stop();
  });

  it("stops requesting frames once the canvas scrolls off screen", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);
    runFrame();
    const drawnWhileVisible = drawCount();

    observers[0]!.emit(false);
    runFrame();
    runFrame();

    expect(drawCount()).toBe(drawnWhileVisible);
    stop();
  });

  it("resumes when the canvas scrolls back into view", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);
    observers[0]!.emit(false);
    runFrame();
    const drawnWhileHidden = drawCount();

    observers[0]!.emit(true);
    runFrame();

    expect(drawCount()).toBeGreaterThan(drawnWhileHidden);
    stop();
  });

  it("disposes the renderer, every geometry and every material on teardown", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);
    expect(built.geometries.length).toBeGreaterThan(0);
    expect(built.materials.length).toBeGreaterThan(0);

    stop();

    expect(built.renderers[0]!.dispose).toHaveBeenCalledTimes(1);
    for (const geometry of built.geometries) expect(geometry.dispose).toHaveBeenCalledTimes(1);
    for (const material of built.materials) expect(material.dispose).toHaveBeenCalledTimes(1);
  });

  it("releases the WebGL context so repeated mounts do not leak one", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);

    stop();

    expect(built.renderers[0]!.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending frame and disconnects its observers on teardown", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);
    runFrame();

    stop();

    expect(cancelled.length).toBeGreaterThan(0);
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalled();
  });

  it("survives being torn down twice", () => {
    const stop = startFactoryScene(mountCanvas(), INPUTS);
    stop();

    expect(() => stop()).not.toThrow();
    expect(built.renderers[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it("feeds the measured agent share to the shader rather than a hardcoded ratio", () => {
    const stop = startFactoryScene(mountCanvas(), { agentShare: 0.42, particleCount: 250 });

    const shares = built.materials.map((material) => material.uniforms["uAgentShare"]?.value);

    expect(shares).toContain(0.42);
    stop();
  });

  it("repaints in the theme of the surrounding scope", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const stop = startFactoryScene(mountCanvas(), INPUTS);

    const darkFlags = built.materials.map((material) => material.uniforms["uIsDark"]?.value);

    expect(darkFlags.every((flag) => flag === 1)).toBe(true);
    stop();
    document.documentElement.removeAttribute("data-theme");
  });
});
