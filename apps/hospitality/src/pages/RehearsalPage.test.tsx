import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { FloorPlan, Table } from "@mbe/types";
import type * as SimulateServiceModule from "../components/rehearsal/simulate-service";

const mocks = vi.hoisted(() => ({
  tables: vi.fn(),
  floorPlans: vi.fn(),
  report: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("../hooks/useTables", () => ({ useTables: mocks.tables }));
vi.mock("../hooks/useFloorPlans", () => ({ useFloorPlans: mocks.floorPlans }));
vi.mock("../contexts/VenueContext", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1", selectedVenue: { id: "venue-1" } }),
}));
vi.mock("@mbe/sentry/react", () => ({ handleErrorBoundary: mocks.report }));
vi.mock("../components/rehearsal/RehearsalWorkspace", () => ({
  RehearsalWorkspace: (props: { floorPlan: { id: string }; seed: number; onLeave: () => void }) => {
    mocks.workspace(props);
    return (
      <div data-testid="workspace" data-plan={props.floorPlan.id} data-seed={props.seed}>
        <button type="button" onClick={props.onLeave}>
          leave
        </button>
      </div>
    );
  },
}));
vi.mock("../components/rehearsal/simulate-service", async (importOriginal) => {
  const actual = await importOriginal<typeof SimulateServiceModule>();
  return { ...actual, simulateService: vi.fn(actual.simulateService) };
});

import { RehearsalPage } from "./RehearsalPage";
import { simulateService } from "../components/rehearsal/simulate-service";

function table(id: string, capacity: number, floorPlanId: string, isActive = true): Table {
  return {
    id,
    name: `Table ${id}`,
    tableNumber: id,
    capacity,
    minCovers: 1,
    maxCovers: capacity,
    location: null,
    isActive,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}
const plan = (id: string, isActive: boolean): FloorPlan => ({
  id,
  venueId: "venue-1",
  name: id,
  isActive,
  layoutJson: { width: 800, height: 600 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const TABLES = [table("a", 2, "fp-1"), table("b", 4, "fp-1"), table("c", 4, "fp-2")];
const PLANS = [plan("fp-1", true), plan("fp-2", false)];

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="probe" data-path={location.pathname}>
      {JSON.stringify(location.state)}
    </div>
  );
}

function renderAt(state: unknown, entries?: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={entries ?? [{ pathname: "/rehearsal", state }]}>
      <Routes>
        <Route
          path="/rehearsal"
          element={
            <>
              <RehearsalPage />
              <Probe />
            </>
          }
        />
        <Route path="/timeline" element={<div>Timeline marker</div>} />
        <Route path="/floor-plans" element={<div>Floor plans marker</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const refetch = vi.fn(async () => ({ error: null }));
const ready = (tables: Table[] = TABLES, plans: FloorPlan[] = PLANS) => {
  mocks.tables.mockReturnValue({ data: tables, isLoading: false, error: null, refetch });
  mocks.floorPlans.mockReturnValue({ data: plans, isLoading: false, error: null, refetch });
};

beforeEach(() => {
  vi.clearAllMocks();
  ready();
});

describe("RehearsalPage state gate", () => {
  it("redirects to /timeline with replace when there is no navigation state", () => {
    renderAt(undefined);
    expect(screen.getByText("Timeline marker")).toBeInTheDocument();
  });

  it("redirects on invalid state", () => {
    renderAt({ profile: "friday", seed: 1.5 });
    expect(screen.getByText("Timeline marker")).toBeInTheDocument();
  });

  it("does not simulate on a redirect", () => {
    renderAt(undefined);
    expect(simulateService).not.toHaveBeenCalled();
  });
});

describe("RehearsalPage loading and load errors", () => {
  it("shows the skeleton and does not simulate while tables load", () => {
    mocks.tables.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch });
    renderAt({ profile: "friday", seed: 3 });
    expect(screen.getByTestId("timeline-skeleton")).toBeInTheDocument();
    expect(simulateService).not.toHaveBeenCalled();
    expect(screen.getByRole("note", { name: "Rehearsal notice" })).toBeInTheDocument();
  });

  it("shows the skeleton while floor plans load", () => {
    mocks.floorPlans.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch });
    renderAt({ profile: "friday", seed: 3 });
    expect(screen.getByTestId("timeline-skeleton")).toBeInTheDocument();
    expect(simulateService).not.toHaveBeenCalled();
  });

  it("shows the tables load error with a retry", async () => {
    mocks.tables.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });
    renderAt({ profile: "friday", seed: 3 });
    expect(screen.getByText("Your tables couldn't be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
    expect(simulateService).not.toHaveBeenCalled();
  });
});

describe("RehearsalPage not enough tables", () => {
  it("renders the not-enough copy for zero active tables", () => {
    ready([table("x", 4, "fp-1", false)]);
    renderAt({ profile: "friday", seed: 3 });
    expect(screen.getByText("Not enough tables")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Floor plans" })).toHaveAttribute(
      "href",
      "/floor-plans"
    );
    expect(screen.queryByTestId("workspace")).toBeNull();
  });

  it("renders it when no table is big enough for any party", () => {
    ready([{ ...table("tiny", 1, "fp-1"), minCovers: 1, maxCovers: 1 }]);
    renderAt({ profile: "friday", seed: 3 });
    expect(screen.getByText("Not enough tables")).toBeInTheDocument();
  });
});

describe("RehearsalPage simulator failure (UX Screen 7)", () => {
  it("shows the failure state, reports once, and retries with a fresh seed", async () => {
    const failure = new Error("sim exploded");
    vi.mocked(simulateService).mockImplementationOnce(() => {
      throw failure;
    });
    renderAt({ profile: "friday", seed: 3, floorPlanId: "fp-1" });
    expect(screen.getByText("Couldn't set up the rehearsal.")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Rehearsal notice" })).toBeInTheDocument();
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.report.mock.calls[0]?.[0]).toBe(failure);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const state = JSON.parse(screen.getByTestId("probe").textContent ?? "{}") as {
      seed: number;
      profile: string;
      floorPlanId?: string;
    };
    expect(state.profile).toBe("friday");
    expect(state.floorPlanId).toBe("fp-1");
    expect(state.seed).not.toBe(3);
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });
});

describe("RehearsalPage workspace", () => {
  it("simulates once and hands the requested floor plan to the workspace", () => {
    renderAt({ profile: "friday", seed: 9, floorPlanId: "fp-2" });
    expect(simulateService).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-plan", "fp-2");
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-seed", "9");
  });

  it("falls back to the active plan with the most active tables", () => {
    renderAt({ profile: "friday", seed: 9 });
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-plan", "fp-1");
  });

  it("passes the profile's fixed hours", () => {
    renderAt({ profile: "weeknight", seed: 9 });
    const props = mocks.workspace.mock.calls[0]?.[0] as { openMinute: number; closeMinute: number };
    expect(props.openMinute).toBe(17 * 60);
    expect(props.closeMinute).toBe(22 * 60);
  });
});

describe("RehearsalPage leave", () => {
  it("goes back one entry when there is history", async () => {
    renderAt(undefined, [
      "/timeline",
      { pathname: "/rehearsal", state: { profile: "friday", seed: 1 } },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(screen.getByText("Timeline marker")).toBeInTheDocument();
  });

  it("falls back to /timeline when the rehearsal was the first entry", async () => {
    renderAt({ profile: "friday", seed: 1 });
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(screen.getByText("Timeline marker")).toBeInTheDocument();
  });
});
