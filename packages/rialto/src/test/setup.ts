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

// axe's label-content-name-mismatch (WCAG 2.5.3), and color-contrast's text matcher,
// measure glyphs on a 2D canvas to skip icon-font ligatures. jsdom has no canvas; a
// `null` context made the rule throw, land in `incomplete`, and every `violations`
// assertion for it pass vacuously. This stub reports ordinary text (width grows with
// length, uniform ink), so the rule evaluates names the way it does in a browser for
// text fonts. Only axe's measuring request (`getContext("2d", { willReadFrequently: true })`)
// gets the stub; component canvases (SilkFlow) still get `null`, as before, so their
// no-canvas fallbacks keep running under jsdom. Pinned by src/test/axe-label-in-name.test.tsx.
const LIGATURE_FREE_CONTEXT_KEY = Symbol("ligature-free-2d-context");
type CanvasWithStub = HTMLCanvasElement & { [LIGATURE_FREE_CONTEXT_KEY]?: object };
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext =
    ligatureFreeGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
function ligatureFreeGetContext(
  this: CanvasWithStub,
  contextId: string,
  options?: { willReadFrequently?: boolean }
) {
  if (contextId !== "2d" || options?.willReadFrequently !== true) return null;
  this[LIGATURE_FREE_CONTEXT_KEY] ??= {
    canvas: this,
    font: "",
    textAlign: "left",
    textBaseline: "top",
    measureText: (text: string) => ({ width: 10 * text.length }),
    fillText: () => {},
    clearRect: () => {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, Math.ceil(width) * Math.ceil(height)) * 4).fill(1),
    }),
  };
  return this[LIGATURE_FREE_CONTEXT_KEY];
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
