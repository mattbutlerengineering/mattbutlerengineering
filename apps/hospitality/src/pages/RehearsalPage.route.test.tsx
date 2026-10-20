import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import type { FloorPlan, Table } from "@mbe/types";
import type { VenueReadiness } from "../hooks/useVenueReadiness";

/**
 * Architect open item (architecture.md "Surfaced"): DashboardLayout's readiness redirects were not
 * read in depth. This renders the real layout with the real page and workspace for an onboarded
 * venue with zero reservations, and for a venue still in setup, and proves neither bounces
 * /rehearsal away.
 */
const readiness = vi.hoisted(() => ({ current: null as unknown as VenueReadiness }));

vi.mock("../contexts/VenueContext.js", () => ({
  VenueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useVenue: () => ({
    venues: [],
    selectedVenueId: "venue-1",
    selectedVenue: { id: "venue-1", name: "Test Venue" },
    setVenueId: vi.fn(),
    isLoading: false,
    isMultiVenue: false,
    venuesError: null,
    refetchVenues: vi.fn(),
  }),
}));
vi.mock("../hooks/useVenueReadiness.js", () => ({ useVenueReadiness: () => readiness.current }));
vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ signIn: vi.fn(), signOut: vi.fn(), accessToken: "t" }),
  useAccessToken: () => ({ accessToken: "t", refreshError: null }),
}));
vi.mock("../hooks/useSSESync.js", () => ({
  SSESyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSSESync: vi.fn(() => ({ reconnect: vi.fn() })),
}));
vi.mock("../hooks/useIsAdmin.js", () => ({ useIsAdmin: () => false }));
vi.mock("../components/LocalePicker/index.js", () => ({ LocalePicker: () => null }));

const data = vi.hoisted(() => ({ tables: [] as unknown[], plans: [] as unknown[] }));
vi.mock("../hooks/useTables", () => ({
  useTables: () => ({
    data: data.tables,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/useFloorPlans", () => ({
  useFloorPlans: () => ({
    data: data.plans,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("react-konva", () => ({
  Stage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

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
vi.stubGlobal("requestAnimationFrame", () => 1);
vi.stubGlobal("cancelAnimationFrame", () => undefined);

import { DashboardLayout } from "../components/DashboardLayout.js";
import { RehearsalPage } from "./RehearsalPage";

const table = (id: string, capacity: number): Table => ({
  id,
  name: `Table ${id}`,
  tableNumber: id,
  capacity,
  minCovers: 1,
  maxCovers: capacity,
  location: null,
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
const plan: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function renderRoute() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/rehearsal", state: { profile: "friday", seed: 5 } }]}
    >
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route path="rehearsal" element={<RehearsalPage />} />
          <Route path="timeline" element={<div>Timeline Content</div>} />
          <Route path="setup" element={<div>Setup Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  data.tables = [table("a", 2), table("b", 4), table("c", 4)];
  data.plans = [plan];
});

describe("/rehearsal inside DashboardLayout", () => {
  it.each<VenueReadiness["status"]>(["operational", "setup"])(
    "renders the workspace for a %s venue and does not redirect",
    (status) => {
      readiness.current = {
        status,
        completedSteps: [],
        nextStep: status === "setup" ? "floor-plan" : null,
        progress: 100,
      };
      renderRoute();
      const layout = screen.getByTestId("dashboard-layout");
      expect(within(layout).getByTestId("rehearsal-workspace")).toBeInTheDocument();
      expect(within(layout).getByRole("note", { name: "Rehearsal notice" })).toBeInTheDocument();
      expect(screen.queryByText("Timeline Content")).toBeNull();
      expect(screen.queryByText("Setup Content")).toBeNull();
    }
  );
});
