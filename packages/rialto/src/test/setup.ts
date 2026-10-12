/// <reference types="@testing-library/jest-dom/vitest" />
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(jestDomMatchers);
expect.extend(axeMatchers);

// framer-motion's `useReducedMotion` is a tripwire: rialto reads reduced
// motion only through `useMotionPreset().reduced` (ADR-025), so any component
// that renders a call to framer's hook fails its own tests here. Guarded by
// test/motion/no-framer-reduced-motion.test.tsx.
vi.mock("framer-motion", async () => {
  const actual =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() required for vi.importActual generic
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => {
      throw new Error(
        "framer-motion useReducedMotion() is banned in rialto — read useMotionPreset().reduced (ADR-025)"
      );
    },
  };
});

// Stub canvas getContext for jsdom (axe-core uses it for contrast checks)
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}

// Mock matchMedia for jsdom. `prefers-reduced-motion: reduce` matches, so
// `useDeviceContext()` — and through it `useMotionPreset()`, the one reduced-
// motion signal components read (ADR-025) — reports reduced: tests run reduced
// by default. To exercise the animated path, call `stubMatchMedia([])` from
// `test/match-media.ts` (and `setMatchingMedia` to switch per test).
if (typeof window !== "undefined")
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
