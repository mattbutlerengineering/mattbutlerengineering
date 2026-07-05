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
