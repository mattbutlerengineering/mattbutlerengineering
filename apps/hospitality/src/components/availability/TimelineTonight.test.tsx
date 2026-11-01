import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
vi.mock("../../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../../hooks/useNow.js", () => ({ useNow: () => new Date("2026-10-30T20:00:00Z") }));
vi.mock("./TonightControl.js", () => ({ TonightControl: () => <div>Tonight panel</div> }));

import { TimelineTonight } from "./TimelineTonight.js";

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
});
