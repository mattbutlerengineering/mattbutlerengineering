import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityLayout } from "./AvailabilityLayout.js";

const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles" } as {
    id: string;
    ianaTimezone: string;
  } | null,
}));
const config = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as Error | null,
  refetch: vi.fn(),
  params: vi.fn(),
}));
const access = vi.hoisted(() => ({ isManager: true, isPending: false }));

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityConfig: (params: unknown) => {
    config.params(params);
    return { data: config.data, isLoading: false, error: config.error, refetch: config.refetch };
  },
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/useIsManager.js", () => ({ useManagerAccess: () => access }));

const STATE = {
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  version: 7,
  source: "rows",
} as unknown as AvailabilityConfigState;

/** A child route that prints the scope it was given. */
function ScopeProbe() {
  const scope = useAvailabilityScope();
  return (
    <div>
      <output aria-label="venue">{String(scope.venueId)}</output>
      <output aria-label="timezone">{scope.timezone}</output>
      <output aria-label="today">{scope.today}</output>
      <output aria-label="version">{String(scope.state?.version ?? null)}</output>
      <output aria-label="manager">{String(scope.isManager)}</output>
      <output aria-label="load">{scope.load}</output>
      <output aria-label="load error">{String(scope.loadError)}</output>
      <output aria-label="role pending">{String(scope.rolePending)}</output>
      <button type="button" onClick={scope.refresh}>
        refresh
      </button>
    </div>
  );
}

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: "availability",
        element: <AvailabilityLayout />,
        children: [{ path: "calendar", element: <ScopeProbe /> }],
      },
    ],
    { initialEntries: ["/availability/calendar"] }
  );
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

const read = (name: string) => screen.getByRole("status", { name }).textContent;

describe("AvailabilityLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 20:00 UTC on Oct 28 is 13:00 the same day in Los Angeles, and Oct 29 in Auckland.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    venue.selectedVenueId = "venue-1";
    venue.selectedVenue = { id: "venue-1", ianaTimezone: "America/Los_Angeles" };
    config.data = STATE;
    config.error = null;
    access.isManager = true;
    access.isPending = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives a child the venue, its time zone, the venue's today, the config and the role", () => {
    renderLayout();
    expect(read("venue")).toBe("venue-1");
    expect(read("timezone")).toBe("America/Los_Angeles");
    expect(read("today")).toBe("2026-10-28");
    expect(read("version")).toBe("7");
    expect(read("manager")).toBe("true");
    expect(config.params).toHaveBeenCalledWith({ venueId: "venue-1" });
  });

  it("reads today in the venue's time zone, not the device's", () => {
    venue.selectedVenue = { id: "venue-1", ianaTimezone: "Pacific/Auckland" };
    renderLayout();
    expect(read("today")).toBe("2026-10-29");
  });

  it("tells a Host apart from a Manager", () => {
    access.isManager = false;
    renderLayout();
    expect(read("manager")).toBe("false");
  });

  it("gives no state until the config has loaded, and still renders the child", () => {
    config.data = undefined;
    config.error = new Error("503");
    renderLayout();
    expect(read("version")).toBe("null");
  });

  it("tells a config still loading from one that failed and one that loaded", () => {
    config.data = undefined;
    config.error = null;
    const loading = renderLayout();
    expect(read("load")).toBe("loading");
    loading.unmount();

    config.error = new Error("503");
    const failed = renderLayout();
    expect(read("load")).toBe("error");
    // The reason, as a sentence a person can read.
    expect(read("load error")).toMatch(/\w+ \w+/);
    failed.unmount();

    config.data = STATE;
    renderLayout();
    // A refetch failing over a config on hand is not a load failure.
    expect(read("load")).toBe("ready");
    expect(read("load error")).toBe("null");
  });

  it("reads hours nobody can read as a load failure", () => {
    config.data = { ...STATE, source: "unreadable" };
    renderLayout();
    expect(read("load")).toBe("error");
  });

  it("says when the role is still being read", () => {
    access.isManager = false;
    access.isPending = true;
    renderLayout();
    expect(read("manager")).toBe("false");
    expect(read("role pending")).toBe("true");
  });

  it("gives no venue when none is selected", () => {
    venue.selectedVenueId = null;
    venue.selectedVenue = null;
    renderLayout();
    expect(read("venue")).toBe("null");
    expect(read("timezone")).toBe("");
  });

  it("refetches the config on refresh", () => {
    renderLayout();
    screen.getByRole("button", { name: "refresh" }).click();
    expect(config.refetch).toHaveBeenCalledTimes(1);
  });
});
