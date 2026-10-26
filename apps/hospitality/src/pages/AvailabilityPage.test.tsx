import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type * as Engine from "@mbe/availability";
import type { AvailabilityDaySummary, VenueTeam } from "@mbe/types";

const daysQuery = vi.hoisted(() => ({
  value: { data: undefined, isLoading: false, error: null } as {
    data: AvailabilityDaySummary[] | null | undefined;
    isLoading: boolean;
    error: Error | null;
  },
}));
const daysHook = vi.hoisted(() => vi.fn());
const configHook = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());
const configSource = vi.hoisted(() => ({ value: "rows" as "rows" | "empty" | "legacy" }));
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityDays: (params: unknown) => {
    daysHook(params);
    return { ...daysQuery.value, refetch };
  },
  useAvailabilityConfig: (params: unknown) => {
    configHook(params);
    return {
      data: { config: {}, version: 1, source: configSource.value },
      isLoading: false,
      error: null,
      refetch,
    };
  },
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: ({ venueId }: { venueId: string }) => (
    <section aria-label="Quick setup">{venueId}</section>
  ),
}));
vi.mock("../components/availability/AvailabilityHistoryDrawer.js", () => ({
  AvailabilityHistoryDrawer: ({
    open,
    onOpenDay,
  }: {
    open: boolean;
    onOpenDay: (date: string) => void;
  }) =>
    open ? (
      <section aria-label="History drawer">
        <button type="button" onClick={() => onOpenDay("2026-10-30")}>
          Go to day
        </button>
      </section>
    ) : null,
}));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: team.value, isLoading: false, error: null }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("@mbe/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof Engine>()),
  resolveDay: () => ({
    serviceDate: "2026-10-30",
    scheduleId: "s1",
    services: [],
    closures: [],
    bookingOpen: { online: true, phone: true, waitlist: true },
    explanation: [],
  }),
}));

import { AvailabilityPage } from "./AvailabilityPage.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function summaryFor(date: string): AvailabilityDaySummary {
  return {
    serviceDate: date,
    label: "Weeknight",
    scheduleId: "s1",
    serviceCount: 1,
    closures: [],
    bookingOpen: { online: true, phone: true, waitlist: true },
  };
}

function renderPage() {
  return render(
    <main>
      <AvailabilityPage />
    </main>
  );
}

describe("AvailabilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    venue.selectedVenueId = "venue-1";
    configSource.value = "rows";
    team.value = { viewerRole: "manager" };
    daysQuery.value = {
      data: ["2026-10-29", "2026-10-30"].map(summaryFor),
      isLoading: false,
      error: null,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the month grid's whole range, Monday-first", () => {
    renderPage();
    expect(daysHook).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", from: "2026-09-28", to: "2026-11-01" })
    );
    expect(screen.getByRole("heading", { level: 1, name: "Availability" })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Availability calendar" })).toBeInTheDocument();
  });

  it("switches to the week view and its range", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Week" }));
    expect(daysHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2026-10-26", to: "2026-11-01" })
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
  });

  it("steps forward and back, and returns to today", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(daysHook).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-10-26" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(daysHook).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-09-28" }));
  });

  it("opens the day drawer from a cell", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    const dialog = screen.getByRole("dialog", { name: /Friday, October 30/ });
    expect(within(dialog).getByText(/Closed\./)).toBeInTheDocument();
  });

  describe("a venue with no hours", () => {
    beforeEach(() => {
      configSource.value = "empty";
    });

    it("shows a Manager the quick-setup card instead of the calendar", () => {
      renderPage();
      expect(screen.getByRole("region", { name: "Quick setup" })).toHaveTextContent("venue-1");
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    it("tells a Host a manager sets the week, with no card", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      expect(screen.getByText(/A manager sets the regular week here/)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Quick setup" })).not.toBeInTheDocument();
    });

    it("waits for the viewer's role rather than flashing the Host note", () => {
      team.value = undefined;
      renderPage();
      expect(screen.queryByRole("region", { name: "Quick setup" })).not.toBeInTheDocument();
      expect(screen.queryByText(/A manager sets the regular week here/)).not.toBeInTheDocument();
    });

    it("has no axe violations", async () => {
      const { container } = renderPage();
      expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
    });
  });

  it("keeps the calendar, with no card, once the venue has hours", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "Quick setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("shows a Host the view-only note and a Manager nothing extra", () => {
    team.value = { viewerRole: "host" };
    const host = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    expect(screen.getByText(/Only managers change hours/)).toBeInTheDocument();
    host.unmount();

    team.value = { viewerRole: "manager" };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    expect(screen.queryByText(/Only managers change hours/)).not.toBeInTheDocument();
  });

  it("opens History from the toolbar and lets an entry open its day", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "History drawer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "History drawer" })).getByRole("button", {
        name: "Go to day",
      })
    );
    expect(screen.queryByRole("region", { name: "History drawer" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /Friday, October 30/ })).toBeInTheDocument();
  });

  it("tells a migrated venue its hours were carried over, and no one else", () => {
    window.localStorage.clear();
    configSource.value = "legacy";
    const legacy = renderPage();
    expect(screen.getByText(/Your hours were carried over/)).toBeInTheDocument();
    legacy.unmount();

    configSource.value = "rows";
    renderPage();
    expect(screen.queryByText(/Your hours were carried over/)).not.toBeInTheDocument();
  });

  it("offers Retry when the days fail to load", () => {
    daysQuery.value = { data: undefined, isLoading: false, error: new Error("boom") };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load availability");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("asks for a venue when none is selected", () => {
    venue.selectedVenueId = null;
    renderPage();
    expect(screen.getByText("Select a venue to see its availability.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = renderPage();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
