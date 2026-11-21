import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { VenuesPage } from "./VenuesPage.js";
import { BRIEFING_LINES, SCENES } from "../data/service-night.js";

// Rialto reads reduced motion through its own device store over `matchMedia`
// (a module singleton), so flip the query and fire `change` the way a real OS
// toggle does. Same approach as `HomePage.motion.test.tsx`.
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
  prefersReducedMotion = reduced;
  act(() =>
    reducedMotionListeners.forEach((listener) =>
      listener({ matches: reduced, media: REDUCED_MOTION_QUERY })
    )
  );
}

function renderVenuesPage() {
  return render(
    <RialtoProvider vibe="presenting">
      <ToastProvider>
        <MemoryRouter>
          <VenuesPage />
        </MemoryRouter>
      </ToastProvider>
    </RialtoProvider>
  );
}

describe("VenuesPage entrance choreography", () => {
  afterEach(() => {
    setPrefersReducedMotion(false);
  });

  it("wraps every scene after the hero in a stagger reveal", () => {
    const { container } = renderVenuesPage();
    const revealed = [...container.querySelectorAll("[data-reveal]")].map((node) =>
      node.getAttribute("data-reveal")
    );
    const expected = [...SCENES.slice(1).map((scene) => scene.id), "rush-chart"];
    expect([...revealed].sort()).toEqual([...expected].sort());
  });

  it("leaves no revealed content hidden under prefers-reduced-motion", async () => {
    setPrefersReducedMotion(true);
    const { container } = renderVenuesPage();

    await waitFor(() => {
      const hidden = [...container.querySelectorAll("[data-reveal], [data-reveal] *")].filter(
        (node) => (node as HTMLElement).style.opacity === "0"
      );
      expect(hidden).toEqual([]);
    });
  });

  it("shows the briefing as still text and the final totals under prefers-reduced-motion", () => {
    setPrefersReducedMotion(true);
    renderVenuesPage();
    expect(screen.getByText(BRIEFING_LINES[0] ?? "")).toBeInTheDocument();
    const covers = screen.getAllByLabelText("Covers served").map((node) => node.textContent);
    expect(covers.some((text) => text?.includes("84"))).toBe(true);
  });
});
