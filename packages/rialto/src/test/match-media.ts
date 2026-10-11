/**
 * Test helper — choose which media queries match for this test file.
 *
 * `useDeviceContext()` (and through it `useMotionPreset()`, the one
 * reduced-motion signal Rialto components read — ADR-025) builds its snapshot
 * from `window.matchMedia` the first time a component subscribes. The global
 * setup reports `prefers-reduced-motion: reduce`, so tests run reduced by
 * default. Call this at module top level — before anything renders — to run a
 * file under a different device, e.g. `stubMatchMedia([])` for full motion.
 */

export const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function stubMatchMedia(matching: readonly string[]): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
