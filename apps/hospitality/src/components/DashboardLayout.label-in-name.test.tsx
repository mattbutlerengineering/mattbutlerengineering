import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DashboardLayout } from "./DashboardLayout.js";

// WCAG 2.5.3 Label in Name: the sidebar command-palette hint renders the visible text
// "<modifier> K Search"; its accessible name must contain those words in order.

vi.mock("../contexts/VenueContext.js", () => ({
  VenueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useVenue: () => ({
    venues: [{ id: "v1", name: "Test Venue" }],
    selectedVenueId: "v1",
    selectedVenue: { id: "v1", name: "Test Venue" },
    setVenueId: vi.fn(),
    isLoading: false,
    isMultiVenue: false,
    venuesError: null,
    refetchVenues: vi.fn(),
  }),
}));

vi.mock("../hooks/useVenueReadiness.js", () => ({
  useVenueReadiness: vi.fn(() => ({
    status: "operational",
    completedSteps: [],
    nextStep: null,
    progress: 1,
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

vi.mock("../hooks/useArrivalAlerts.js", () => ({ useArrivalAlerts: vi.fn() }));
vi.mock("../hooks/useIsAdmin.js", () => ({ useIsAdmin: () => false }));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: undefined }) }));
vi.mock("../hooks/useRefreshingChatStream.js", () => ({
  useRefreshingChatStream: () => vi.fn(),
}));

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/timeline"]}>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            <Route path="timeline" element={<div>Timeline Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DashboardLayout command-palette hint: label in name", () => {
  // Strict assertions, not axe: in jsdom axe's `label-content-name-mismatch` throws in its
  // icon-ligature probe (no canvas) and reports `incomplete`, so it can never fail here.
  it("keeps the visible words apart and names the button with exactly them", () => {
    const { container } = renderLayout();
    const hint = container.querySelector(".commandHint");
    expect(hint).not.toBeNull();
    // jsdom is not a Mac, so the modifier is "Ctrl".
    expect(hint?.textContent).toBe("Ctrl K Search");
    expect(hint).not.toHaveAttribute("aria-label");
    expect(hint).toHaveAccessibleName(/^Ctrl ?K Search$/);
  });
});
