import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Telemetry } from "./Telemetry";

// jsdom has no matchMedia; rialto's device context and framer-motion both read it.
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

function renderRoute(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/demos/telemetry${search}`]}>
      <Telemetry />
    </MemoryRouter>
  );
}

describe("Telemetry HUD", () => {
  it("renders all four regions", () => {
    renderRoute("?frozen=1");

    expect(screen.getByRole("banner", { name: "Session status" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Zone times" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vitals" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "Event feed" })).toBeInTheDocument();
  });

  it("marks the current zone, and only that zone", () => {
    renderRoute("?frozen=1");

    // Frame 0's active zone is the first of the session's zones.
    expect(screen.getByLabelText("Pit Exit is the current zone")).toBeInTheDocument();
    expect(screen.queryByLabelText("Main Straight is the current zone")).not.toBeInTheDocument();
  });

  describe("with ?frozen=1", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("is live immediately and never advances", () => {
      const { container } = renderRoute("?frozen=1");

      expect(container.querySelector("[data-feed-state]")).toHaveAttribute(
        "data-feed-state",
        "live"
      );
      const before = screen.getByRole("region", { name: "Zone times" }).textContent;

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.getByRole("region", { name: "Zone times" }).textContent).toBe(before);
    });
  });

  it("shows the connecting state before the first frame arrives", () => {
    const { container } = renderRoute();

    expect(container.querySelector("[data-feed-state]")).toHaveAttribute(
      "data-feed-state",
      "connecting"
    );
  });
});
