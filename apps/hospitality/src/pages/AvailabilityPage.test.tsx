import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type * as Engine from "@mbe/availability";
import type * as Drawer from "../components/availability/AvailabilityDayDrawer.js";
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
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: ({ venueId }: { venueId: string }) => (
    <section aria-label="Quick setup">{venueId}</section>
  ),
}));
const drawerProps = vi.hoisted(() => vi.fn());
vi.mock("../components/availability/AvailabilityDayDrawer.js", async (importOriginal) => {
  const real = await importOriginal<typeof Drawer>();
  return {
    AvailabilityDayDrawer: (props: Parameters<typeof real.AvailabilityDayDrawer>[0]) => {
      drawerProps(props);
      return real.AvailabilityDayDrawer(props);
    },
  };
});
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: team.value, isLoading: false, error: null }),
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

  describe("multi-select", () => {
    const pick = (re: RegExp) =>
      fireEvent.click(screen.getByRole("button", { name: re }), { ctrlKey: true });

    it("announces the count and opens the drawer for the first date with a fixed scope", () => {
      renderPage();
      pick(/Friday, October 30/);
      pick(/Thursday, October 29/);
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
      fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
      expect(screen.getByRole("dialog", { name: /Thursday, October 29/ })).toBeInTheDocument();
      expect(drawerProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          date: "2026-10-29",
          editing: expect.objectContaining({ fixedDates: ["2026-10-29", "2026-10-30"] }),
        })
      );
    });

    it("drops the fixed scope when a single day is opened afterwards", () => {
      renderPage();
      pick(/Friday, October 30/);
      fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
      fireEvent.click(screen.getByRole("button", { name: /Thursday, October 29/ }));
      expect(drawerProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          date: "2026-10-29",
          editing: expect.objectContaining({ fixedDates: undefined }),
        })
      );
    });

    it("keeps the selection when Keep editing answers the discard prompt of a plain click", () => {
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
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      renderPage();
      pick(/Friday, October 30/);
      pick(/Thursday, October 29/);
      fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
      fireEvent.click(screen.getByRole("button", { name: /Wednesday, October 28/ }));
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
    });

    it("clears the selection once a plain click is allowed to open the day", () => {
      renderPage();
      pick(/Friday, October 30/);
      fireEvent.click(screen.getByRole("button", { name: /Wednesday, October 28/ }));
      expect(screen.queryByRole("button", { name: "Edit hours" })).not.toBeInTheDocument();
    });

    it("clears the selection", () => {
      renderPage();
      pick(/Friday, October 30/);
      fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
      expect(screen.queryByRole("button", { name: "Edit hours" })).not.toBeInTheDocument();
    });

    it("selects every weekday of the month from the Select… menu", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Every Wednesday in October" }));
      expect(screen.getByRole("status")).toHaveTextContent("4 dates selected");
    });

    it("selects the loaded dates that use the anchor day's schedule", () => {
      daysQuery.value = {
        data: ["2026-10-28", "2026-10-29", "2026-10-30"].map(summaryFor),
        isLoading: false,
        error: null,
      };
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "All dates using Weeknight" }));
      expect(screen.getByRole("status")).toHaveTextContent("3 dates selected");
    });

    it("names the schedule from the config, not the day's label", () => {
      daysQuery.value = {
        data: ["2026-10-28", "2026-10-29"].map((d) => ({ ...summaryFor(d), label: "Closed" })),
        isLoading: false,
        error: null,
      };
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      expect(screen.getByRole("menuitem", { name: "All dates using Weeknight" })).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: /Closed/ })).not.toBeInTheDocument();
    });

    it("hides the schedule item when the schedule is not in the loaded config", () => {
      daysQuery.value = {
        data: ["2026-10-28", "2026-10-29"].map((d) => ({ ...summaryFor(d), scheduleId: "gone" })),
        isLoading: false,
        error: null,
      };
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      expect(screen.queryByRole("menuitem", { name: /All dates using/ })).not.toBeInTheDocument();
    });

    it("asks before Edit hours replaces a dirty draft", () => {
      daysQuery.value = {
        data: ["2026-10-29", "2026-10-30"].map(summaryFor),
        isLoading: false,
        error: null,
      };
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
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
      pick(/Thursday, October 29/);
      fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
      expect(
        screen.getByRole("dialog", { name: /Discard changes to Friday, October 30\?/ })
      ).toBeTruthy();
      // The draft is still the open one until the Manager answers.
      expect(drawerProps).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-10-30" }));
    });

    it("gives a Host selection but no Edit hours", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      pick(/Friday, October 30/);
      expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
      expect(screen.queryByRole("button", { name: "Edit hours" })).not.toBeInTheDocument();
    });
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = renderPage();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
