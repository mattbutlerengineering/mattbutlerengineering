import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RialtoProvider } from "@mattbutlerengineering/rialto";
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

// The route always renders inside DemoLayout's provider in production, and it
// reads the resolved theme from that environment.
function renderRoute(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/demos/telemetry${search}`]}>
      <RialtoProvider theme="dark">
        <Telemetry />
      </RialtoProvider>
    </MemoryRouter>
  );
}

function hudVibeStyle(container: HTMLElement): string {
  const hud = container.querySelector("[data-feed-state]");
  return hud?.closest("div[style]")?.getAttribute("style") ?? "";
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

describe("route-local vibe switch", () => {
  it("lands under the game vibe", () => {
    const { container } = renderRoute("?frozen=1");

    expect(screen.getByRole("radio", { name: "Game" })).toBeChecked();
    expect(hudVibeStyle(container)).toContain("0.09s");
  });

  it("swaps the vibe immediately, with no confirmation step", async () => {
    const user = userEvent.setup();
    const { container } = renderRoute("?frozen=1");

    await user.click(screen.getByRole("radio", { name: "Default" }));

    expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
    expect(hudVibeStyle(container)).not.toContain("0.09s");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the choice off storage and out of every other route", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoute("?frozen=1");

    await user.click(screen.getByRole("radio", { name: "Default" }));

    expect(window.localStorage.length).toBe(0);

    // Navigating away and back is a fresh mount — the switch does not survive it.
    unmount();
    renderRoute("?frozen=1");

    expect(screen.getByRole("radio", { name: "Game" })).toBeChecked();
  });
});
