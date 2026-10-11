/**
 * Test helper — choose which media queries match for this test file.
 *
 * `useDeviceContext()` (and through it `useMotionPreset()`, the one
 * reduced-motion signal Rialto components read — ADR-025) builds its snapshot
 * from `window.matchMedia` the first time a component subscribes. The global
 * setup reports `prefers-reduced-motion: reduce`, so tests run reduced by
 * default. Call this at module top level — before anything renders — to run a
 * file under a different device, e.g. `stubMatchMedia([])` for full motion.
 *
 * To switch device per test inside one file, call {@link setMatchingMedia}:
 * it flips the stubbed queries and fires `change` the way a real OS toggle
 * does, so the device store re-reads them.
 */

export const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type ChangeListener = () => void;

let matchingQueries: readonly string[] = [];
const changeListeners = new Set<ChangeListener>();

export function stubMatchMedia(matching: readonly string[]): void {
  matchingQueries = matching;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return matchingQueries.includes(query);
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_type: string, listener: ChangeListener) => changeListeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) =>
      changeListeners.delete(listener),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/**
 * Change which queries match after {@link stubMatchMedia}, notifying every
 * subscribed media-query listener. Wrap in `act()` if a component is mounted.
 */
export function setMatchingMedia(matching: readonly string[]): void {
  matchingQueries = matching;
  changeListeners.forEach((listener) => listener());
}
