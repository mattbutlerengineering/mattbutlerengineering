import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom has no matchMedia; rialto's device context and framer-motion both read
// it. A single global polyfill keeps every page test from redefining it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
