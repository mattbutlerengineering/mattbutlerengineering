import "@testing-library/jest-dom/vitest";
import * as matchers from "vitest-axe/matchers";
expect.extend(matchers);

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", async () => {
  const actual =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() required for vi.importActual generic
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

// Stub canvas getContext for jsdom (axe-core uses it for contrast checks)
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

// Mock matchMedia for jsdom
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
