import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import type { ReactNode } from "react";
import { DashboardLayout } from "./DashboardLayout.js";

const refetchVenues = vi.fn(() => Promise.resolve());

// A failed /venues fetch: no venues, but an error. useVenueReadiness reports
// "no-venue" for this state — which used to redirect an existing operator
// into onboarding.
vi.mock("../contexts/VenueContext.js", () => ({
  VenueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useVenue: () => ({
    venues: [],
    selectedVenueId: null,
    selectedVenue: null,
    setVenueId: vi.fn(),
    isLoading: false,
    isMultiVenue: false,
    venuesError: new Error("Network error"),
    refetchVenues,
  }),
}));

vi.mock("../hooks/useVenueReadiness.js", () => ({
  useVenueReadiness: vi.fn(() => ({
    status: "no-venue",
    completedSteps: [],
    nextStep: null,
    progress: 0,
  })),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ signIn: vi.fn(), signOut: vi.fn(), accessToken: "t" }),
  useAccessToken: () => ({ accessToken: "t", refreshError: null }),
}));

vi.mock("../hooks/useSSESync.js", () => ({
  SSESyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSSESync: vi.fn(() => ({ reconnect: vi.fn() })),
}));

vi.mock("../hooks/useIsAdmin.js", () => ({ useIsAdmin: () => false }));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: undefined }) }));
vi.mock("../hooks/useRefreshingChatStream.js", () => ({
  useRefreshingChatStream: () => vi.fn(),
}));

describe("DashboardLayout when the venues fetch fails", () => {
  it("does not redirect to /onboarding and shows an error with a Retry action", async () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Routes>
          <Route path="onboarding" element={<div>Onboarding Content</div>} />
          <Route path="/" element={<DashboardLayout />}>
            <Route path="timeline" element={<div>Timeline Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Onboarding Content")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchVenues).toHaveBeenCalledTimes(1);
  });
});
