import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { FactoryCanvas } from "./FactoryCanvas.js";
import { startFactoryScene } from "./factory-scene.js";
import { factorySceneInputs } from "./pipeline-stages.js";
import { REPO_STATS } from "../../data/repo-stats.js";

const stopScene = vi.fn();

/** Long enough for a pending dynamic import to settle, so a late start shows up. */
const MODULE_SETTLE_MS = 20;

vi.mock("./factory-scene.js", () => ({
  startFactoryScene: vi.fn(() => stopScene),
}));

interface ObserverProbe {
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly observed: Element[];
  emit(isIntersecting: boolean): void;
}

let observers: ObserverProbe[] = [];

beforeEach(() => {
  // Cleared here, not in `afterEach`: Testing Library's auto-cleanup unmounts
  // after this file's hooks run, so a teardown call would otherwise be counted
  // against the following test.
  vi.clearAllMocks();
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = () => [];
      observed: Element[] = [];
      observe = (element: Element) => this.observed.push(element);
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          disconnect: this.disconnect,
          observed: this.observed,
          emit: (isIntersecting) =>
            callback(
              [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
              this as unknown as IntersectionObserver
            ),
        });
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FactoryCanvas", () => {
  it("is decorative: the scene carries no information the DOM does not", () => {
    const { container } = render(<FactoryCanvas />);
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  });

  it("does not load the scene until the canvas comes into view", () => {
    render(<FactoryCanvas />);
    expect(startFactoryScene).not.toHaveBeenCalled();
  });

  it("starts the scene on the measured repo figures once the canvas is in view", async () => {
    const { container } = render(<FactoryCanvas />);

    observers[0]!.emit(true);

    await waitFor(() => expect(startFactoryScene).toHaveBeenCalledTimes(1));
    expect(startFactoryScene).toHaveBeenCalledWith(
      container.querySelector("canvas"),
      factorySceneInputs(REPO_STATS)
    );
  });

  it("watches the canvas itself, so the scene starts as it reaches the viewport", () => {
    const { container } = render(<FactoryCanvas />);
    expect(observers[0]!.observed).toEqual([container.querySelector("canvas")]);
  });

  it("only ever starts one scene, however many intersections arrive", async () => {
    render(<FactoryCanvas />);

    observers[0]!.emit(true);
    observers[0]!.emit(true);

    await waitFor(() => expect(startFactoryScene).toHaveBeenCalledTimes(1));
  });

  it("tears the scene down on unmount", async () => {
    const { unmount } = render(<FactoryCanvas />);
    observers[0]!.emit(true);
    await waitFor(() => expect(startFactoryScene).toHaveBeenCalled());

    unmount();

    expect(stopScene).toHaveBeenCalledTimes(1);
  });

  it("never starts a scene that unmounted while its module was still loading", async () => {
    const { unmount } = render(<FactoryCanvas />);
    observers[0]!.emit(true);

    unmount();
    await new Promise((resolve) => setTimeout(resolve, MODULE_SETTLE_MS));

    expect(startFactoryScene).not.toHaveBeenCalled();
    expect(stopScene).not.toHaveBeenCalled();
  });
});
