import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";

vi.mock("../hooks/useNow.js", () => ({ useNow: () => new Date("2026-11-12T18:00:00Z") }));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("../components/availability/SpecialDatesTab.js", () => ({
  SpecialDatesTab: (props: { isManager: boolean }) => (
    <div>Special dates list {props.isManager ? "manager" : "host"}</div>
  ),
}));

import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { venue, TODAY } from "../components/availability/hub/hub-rows-test-helpers.js";
import { AvailabilitySpecialDatesPage } from "./AvailabilitySpecialDatesPage.js";

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: { config: venue([]), version: 7, source: "rows" as const },
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh: vi.fn(),
    offerUndo: vi.fn(),
    openClose: vi.fn(),
    openPause: vi.fn(),
    ...rest,
  };
}

function renderPage(scope: AvailabilityScope) {
  const router = createMemoryRouter(
    [
      {
        path: "availability",
        element: <Outlet context={scope} />,
        children: [
          { index: true, element: <div>Hub page</div> },
          { path: "special-dates", element: <AvailabilitySpecialDatesPage /> },
        ],
      },
    ],
    { initialEntries: ["/availability/special-dates"] }
  );
  render(
    <ToastProvider>
      <main>
        <RouterProvider router={router} />
      </main>
    </ToastProvider>
  );
}

describe("AvailabilitySpecialDatesPage", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("is headed Special dates, takes focus there, and links back to Availability", () => {
    renderPage(scopeOf());
    expect(screen.getByRole("heading", { level: 1, name: "Special dates" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability"
    );
  });

  it("hands the list the role, so a Host reads it without edit controls", () => {
    renderPage(scopeOf());
    expect(screen.getByText("Special dates list manager")).toBeInTheDocument();
  });

  it("passes a Host through as not a manager", () => {
    renderPage(scopeOf({ isManager: false }));
    expect(screen.getByText("Special dates list host")).toBeInTheDocument();
  });

  it("shows loading until the config answers", () => {
    renderPage(scopeOf({ state: null, load: "loading" }));
    expect(screen.getByRole("status", { name: "Special dates" })).toBeInTheDocument();
  });
});
