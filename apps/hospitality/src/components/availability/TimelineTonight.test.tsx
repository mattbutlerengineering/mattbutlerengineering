import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";

type Query = {
  data: unknown;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};
const query = (over: Partial<Query> = {}): Query => ({
  data: undefined,
  error: null,
  isLoading: false,
  refetch: vi.fn(async () => ({ error: null })),
  ...over,
});
const hooks = vi.hoisted(() => ({ config: {} as unknown, team: {} as unknown }));

vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenueId: "venue-1",
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({ useAvailabilityConfig: () => hooks.config }));
vi.mock("../../hooks/useVenueTeam.js", () => ({ useVenueTeam: () => hooks.team }));
vi.mock("../../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [] }),
}));
vi.mock("../../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../../hooks/useNow.js", () => ({ useNow: () => new Date("2026-10-30T20:00:00Z") }));
vi.mock("./TonightControl.js", () => ({
  TonightControl: ({ defaultOpen }: { defaultOpen?: boolean }) => (
    <div>{defaultOpen ? "Tonight panel (open)" : "Tonight panel"}</div>
  ),
}));

import { TimelineTonight } from "./TimelineTonight.js";

function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter initialEntries={["/timeline"]}>{ui}</MemoryRouter>);
}

function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderAt(url: string) {
  return rtlRender(
    <MemoryRouter initialEntries={[url]}>
      <TimelineTonight />
      <SearchProbe />
    </MemoryRouter>
  );
}

const LOADED = { config: {}, version: 1, source: "rows" };

describe("TimelineTonight", () => {
  beforeEach(() => {
    hooks.config = query({ data: LOADED });
    hooks.team = query({ data: { viewerRole: "host", hostEmergencyClose: true } });
  });

  it("shows the panel once both reads have loaded", () => {
    render(<TimelineTonight />);
    expect(screen.getByText("Tonight panel")).toBeInTheDocument();
  });

  it("stays quiet while the reads are in flight", () => {
    hooks.config = query({ isLoading: true });
    const { container } = render(<TimelineTonight />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says so with Retry when the config read fails, naming Emergency close", () => {
    const failed = query({ error: new Error("boom") });
    hooks.config = failed;
    render(<TimelineTonight />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Emergency close/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it("says so with Retry when the Team read fails", () => {
    const failed = query({ error: new Error("boom") });
    hooks.team = failed;
    render(<TimelineTonight />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Emergency close/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the panel when a refresh fails over data already loaded", () => {
    hooks.config = query({ data: LOADED, error: new Error("boom") });
    render(<TimelineTonight />);
    expect(screen.getByText("Tonight panel")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("the Today line's deep link (?tonight=open)", () => {
    it("opens the panel and removes the param, keeping others, so a reload does not reopen it", () => {
      renderAt("/timeline?tonight=open&walkin=true");
      expect(screen.getByText("Tonight panel (open)")).toBeInTheDocument();
      expect(screen.getByTestId("search")).toHaveTextContent("?walkin=true");
    });

    it("stays closed without the param", () => {
      renderAt("/timeline");
      expect(screen.getByText("Tonight panel")).toBeInTheDocument();
      expect(screen.getByTestId("search")).toBeEmptyDOMElement();
    });

    it("ignores any other value", () => {
      renderAt("/timeline?tonight=1");
      expect(screen.getByText("Tonight panel")).toBeInTheDocument();
      expect(screen.getByTestId("search")).toHaveTextContent("?tonight=1");
    });
  });
});
