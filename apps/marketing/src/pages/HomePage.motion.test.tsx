import { describe, it, expect, afterEach, vi } from "vitest";
import type * as FramerMotion from "framer-motion";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { HomePage } from "./HomePage.js";

// Structure-level checks on the landing page's entrance choreography. Rendering
// uses the real Rialto primitives so the reveal wrappers under test are the ones
// the browser ships, not mocks. Timing and easing live in the Rialto motion
// tokens (guarded by `src/landing-motion.test.ts`); what this file pins is that
// every scrolled-to section is actually wrapped, and that a reduced-motion
// visitor is never left with content the reveal forgot to un-hide.

// Framer Motion resolves `(prefers-reduced-motion: reduce)` once into a
// module-level singleton, so a per-test `matchMedia` stub is read only by
// whichever test renders first. Mock the hook itself instead — everything
// downstream (Rialto's `useScrollReveal` included) reads the same module.
const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn<() => boolean>(() => false),
}));

vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof FramerMotion>()),
  useReducedMotion: mockUseReducedMotion,
}));

// Rialto's `useScrollReveal` reads reduced motion through `useMotionPreset`,
// i.e. Rialto's own device store over `matchMedia` — not Framer's hook. That
// store is also a module singleton, so flip the query and fire `change` the
// way a real OS toggle does rather than re-stubbing per test.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
let prefersReducedMotion = false;
type MediaChangeListener = (event: Pick<MediaQueryListEvent, "matches" | "media">) => void;
const reducedMotionListeners = new Set<MediaChangeListener>();

window.matchMedia = (query: string) =>
  ({
    get matches() {
      return query === REDUCED_MOTION_QUERY && prefersReducedMotion;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: MediaChangeListener) => {
      if (query === REDUCED_MOTION_QUERY) reducedMotionListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaChangeListener) => {
      reducedMotionListeners.delete(listener);
    },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

function setPrefersReducedMotion(reduced: boolean) {
  mockUseReducedMotion.mockReturnValue(reduced);
  prefersReducedMotion = reduced;
  act(() =>
    reducedMotionListeners.forEach((listener) =>
      listener({ matches: reduced, media: REDUCED_MOTION_QUERY })
    )
  );
}

function renderHomePage() {
  return render(
    <RialtoProvider vibe="presenting">
      <ToastProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ToastProvider>
    </RialtoProvider>
  );
}

/** Every landing section that enters on scroll, named by its `data-reveal` value. */
const SCROLL_REVEALED_SECTIONS = ["proof", "projects", "machinery", "contact"];

describe("HomePage entrance choreography", () => {
  afterEach(() => {
    setPrefersReducedMotion(false);
  });

  it("wraps every scroll-entered landing section in a stagger reveal, once each", () => {
    const { container } = renderHomePage();
    const revealed = [...container.querySelectorAll("[data-reveal]")].map((node) =>
      node.getAttribute("data-reveal")
    );
    expect([...revealed].sort()).toEqual([...SCROLL_REVEALED_SECTIONS].sort());
  });

  it("animates the hero on load rather than gating it behind a scroll", () => {
    const { container } = renderHomePage();
    const hero = container.querySelector("h1")?.closest("section");
    expect(hero).not.toBeNull();
    expect(hero?.querySelector("[data-reveal]")).toBeNull();
  });

  it("leaves no revealed content hidden under prefers-reduced-motion", async () => {
    setPrefersReducedMotion(true);
    const { container } = renderHomePage();

    // `controls.set("visible")` writes through Framer's motion values, which
    // land in the DOM on the next render frame rather than synchronously.
    await waitFor(() => {
      const hidden = [...container.querySelectorAll("[data-reveal], [data-reveal] *")].filter(
        (node) => (node as HTMLElement).style.opacity === "0"
      );
      expect(hidden).toEqual([]);
    });
  });
});
