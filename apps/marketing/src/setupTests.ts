import "@testing-library/jest-dom";

// jsdom lacks matchMedia + IntersectionObserver; Rialto (useDeviceContext,
// useReducedMotion, useScrollReveal/useInView) relies on both. Stub them so
// components render in tests without throwing.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom has no canvas 2D implementation and logs a "Not implemented" notice on
// every getContext call. Rialto's decorative SilkFlow canvas already treats a
// null context as "skip the animation", so return null quietly.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  // Minimal no-op stub — the DOM `IntersectionObserver` interface keeps growing
  // (scrollMargin, etc.), so cast rather than `implements` the full contract.
  class MockIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}
