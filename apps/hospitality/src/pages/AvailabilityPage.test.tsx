import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
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
const configSource = vi.hoisted(() => ({ value: "rows" as "rows" | "empty" }));
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const resolved = vi.hoisted(() => ({ services: [] as unknown[] }));
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
      data: {
        config: {
          schedules: [{ id: "s1", name: "Weeknight", kind: "regular", isRegular: true }],
          venueServices: [{ id: "vs1", name: "Dinner", position: 0 }],
          scheduleServices: [],
          assignments: [],
          dateRules: [],
        },
        version: 1,
        source: configSource.value,
      },
      isLoading: false,
      error: null,
      refetch,
    };
  },
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  AVAILABILITY_CONFIG_QUERY_KEY: "availabilityConfig",
  AVAILABILITY_DAYS_QUERY_KEY: "availabilityDays",
}));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureImpact: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: ({ venueId }: { venueId: string }) => (
    <section aria-label="Quick setup">{venueId}</section>
  ),
}));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: team.value, isLoading: false, error: null }),
}));
// The drawer's guest preview has its own suite (AvailabilityGuestPreview.test.tsx); here it idles.
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("@mbe/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof Engine>()),
  resolveDay: () => ({
    serviceDate: "2026-10-30",
    scheduleId: "s1",
    services: resolved.services,
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
    <ToastProvider>
      <main>
        <AvailabilityPage />
      </main>
    </ToastProvider>
  );
}

describe("AvailabilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    venue.selectedVenueId = "venue-1";
    configSource.value = "rows";
    team.value = { viewerRole: "manager" };
    resolved.services = [];
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

  describe("editing", () => {
    beforeAll(() => {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
      resolved.services = [
        {
          venueServiceId: "vs1",
          name: "Dinner",
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1320,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online"],
          scheduleServiceId: null,
        },
      ];
    });

    function openFriday() {
      fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    }

    function startDraft() {
      openFriday();
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
    }

    it("gives a Manager edit controls and a Host none", () => {
      const manager = renderPage();
      openFriday();
      expect(screen.getByRole("button", { name: "Edit Dinner" })).toBeInTheDocument();
      manager.unmount();

      team.value = { viewerRole: "host" };
      renderPage();
      openFriday();
      expect(screen.queryByRole("button", { name: "Edit Dinner" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add service" })).not.toBeInTheDocument();
    });

    it("marks the day with a draft dot while it holds unsaved edits", () => {
      const { container } = renderPage();
      openFriday();
      expect(container.querySelector("[data-draft-dot]")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      expect(container.querySelector("[data-draft-dot]")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
      expect(container.querySelector("[data-draft-dot]")).not.toBeNull();
    });

    it("closes straight away when nothing was changed", async () => {
      renderPage();
      openFriday();
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      // No discard prompt: the only thing left is the drawer leaving.
      expect(screen.queryByRole("dialog", { name: /Discard changes/ })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("asks before cancelling a draft, and Keep editing keeps it", () => {
      renderPage();
      startDraft();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        screen.getByRole("dialog", { name: /Discard changes to Friday, October 30\?/ })
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
    });

    it("Discard closes the drawer and clears the dot", async () => {
      const { container } = renderPage();
      startDraft();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(container.querySelector("[data-draft-dot]")).toBeNull();
    });

    it("asks before another day replaces the draft", () => {
      renderPage();
      startDraft();
      fireEvent.click(screen.getByRole("button", { name: /Thursday, October 29/ }));
      expect(
        screen.getByRole("dialog", { name: /Discard changes to Friday, October 30\?/ })
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
      expect(screen.getByRole("dialog", { name: /Thursday, October 29/ })).toBeTruthy();
    });

    function closeFromDrawer() {
      const drawer = screen.getByRole("dialog", { name: /Friday, October 30/ });
      fireEvent.click(within(drawer).getByRole("button", { name: "Close…" }));
    }

    it("asks before the drawer's Close… replaces a draft, and Keep editing opens nothing", () => {
      renderPage();
      startDraft();
      closeFromDrawer();
      expect(
        screen.getByRole("dialog", { name: /Discard changes to Friday, October 30\?/ })
      ).toBeTruthy();
      expect(screen.queryByRole("dialog", { name: "Close" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(screen.queryByRole("dialog", { name: "Close" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
    });

    it("opens the Close dialog once the draft is discarded", async () => {
      renderPage();
      startDraft();
      closeFromDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
      expect(screen.getByRole("dialog", { name: "Close" })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /Friday, October 30/ })).not.toBeInTheDocument()
      );
    });

    it("opens the Close dialog straight away with no draft", () => {
      renderPage();
      openFriday();
      closeFromDrawer();
      expect(screen.getByRole("dialog", { name: "Close" })).toBeInTheDocument();
    });
  });

  it("offers Retry when the days fail to load", () => {
    daysQuery.value = { data: undefined, isLoading: false, error: new Error("boom") };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load availability");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("lets a Manager open the Close dialog", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Close…" }));
    expect(screen.getByRole("dialog", { name: "Close" })).toBeInTheDocument();
  });

  it("hides Close from a Host", () => {
    team.value = { viewerRole: "host" };
    renderPage();
    expect(screen.queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
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
