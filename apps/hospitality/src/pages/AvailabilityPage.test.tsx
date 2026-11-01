import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type * as Engine from "@mbe/availability";
import type * as Format from "../utils/format.js";
import type * as Drawer from "../components/availability/AvailabilityDayDrawer.js";
import type { AvailabilityDaySummary, VenueTeam } from "@mbe/types";

const daysQuery = vi.hoisted(() => ({
  value: { data: undefined, isLoading: false, error: null } as {
    data: AvailabilityDaySummary[] | null | undefined;
    isLoading: boolean;
    error: Error | null;
  },
}));
const device = vi.hoisted(() => ({ zone: "America/Los_Angeles" }));
const daysHook = vi.hoisted(() => vi.fn());
const configHook = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());
const configSource = vi.hoisted(() => ({
  value: "rows" as "rows" | "empty" | "legacy",
  migrated: false,
}));
const configError = vi.hoisted(() => ({ value: null as Error | null }));
/** No config has ever loaded: the read failed the first time. */
const configAbsent = vi.hoisted(() => ({ value: false }));
const teamError = vi.hoisted(() => ({ value: null as Error | null }));
const teamRefetch = vi.hoisted(() => vi.fn());
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const resolved = vi.hoisted(() => ({
  services: [] as unknown[],
  /** Hours for one date, where it differs from `services`. */
  byDate: {} as Record<string, unknown[]>,
}));
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
    if (configAbsent.value) {
      return { data: undefined, isLoading: false, error: configError.value, refetch };
    }
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
        ...(configSource.migrated ? { migrated: true } : {}),
      },
      isLoading: false,
      error: configError.value,
      refetch,
    };
  },
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
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
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../utils/format.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Format>()),
  deviceTimeZone: () => device.zone,
}));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({
    data: team.value,
    isLoading: false,
    error: teamError.value,
    refetch: teamRefetch,
  }),
}));
// The drawer's guest preview has its own suite (AvailabilityGuestPreview.test.tsx); here it idles.
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("@mbe/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof Engine>()),
  resolveDay: (_context: unknown, date: string) => ({
    serviceDate: date,
    scheduleId: "s1",
    services: resolved.byDate[date] ?? resolved.services,
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
    services: [],
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
    configSource.migrated = false;
    configError.value = null;
    configAbsent.value = false;
    teamError.value = null;
    team.value = { viewerRole: "manager" };
    resolved.services = [];
    resolved.byDate = {};
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
    expect(
      screen.getByRole("grid", { name: "Availability calendar, October 2026" })
    ).toBeInTheDocument();
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

  it("names the month next to the controls and follows Next", () => {
    renderPage();
    expect(screen.getByText("October 2026")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("November 2026")).toBeVisible();
    expect(
      screen.getByRole("grid", { name: "Availability calendar, November 2026" })
    ).toBeVisible();
  });

  it("names the date range in week view", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Week" }));
    expect(screen.getByRole("grid", { name: /Oct 26 – Nov 1, 2026/ })).toBeVisible();
  });

  describe("a read that failed (#7979)", () => {
    const retry = () =>
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));

    it("gives a failed config read a banner with Retry, and no controls that cannot open", () => {
      configAbsent.value = true;
      configError.value = new Error("Network down");
      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load availability");
      expect(screen.queryByRole("button", { name: /^Close…/ })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Pause online booking" })
      ).not.toBeInTheDocument();
      retry();
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("gives a failed Team read a banner with Retry", () => {
      team.value = undefined;
      teamError.value = new Error("Network down");
      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load availability");
      retry();
      expect(teamRefetch).toHaveBeenCalledTimes(1);
      expect(refetch).not.toHaveBeenCalled();
    });

    it("replaces the endless Skeleton on a venue with no hours when the Team read fails", () => {
      configSource.value = "empty";
      team.value = undefined;
      teamError.value = new Error("Network down");
      const { container } = renderPage();
      expect(container.querySelector('[class*="skeleton" i]')).toBeNull();
      retry();
      expect(teamRefetch).toHaveBeenCalledTimes(1);
    });

    it("retries each read that failed, under one banner", () => {
      daysQuery.value = { data: undefined, isLoading: false, error: new Error("Network down") };
      team.value = undefined;
      teamError.value = new Error("Network down");
      renderPage();
      retry();
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(teamRefetch).toHaveBeenCalledTimes(1);
    });

    it("stops the cells' skeletons when the days read fails", () => {
      daysQuery.value = { data: undefined, isLoading: false, error: new Error("Network down") };
      const { container } = renderPage();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(container.querySelector('[class*="skeleton" i]')).toBeNull();
    });

    it("leaves the page alone when a refresh fails over a config already loaded", () => {
      configError.value = new Error("Network down");
      renderPage();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Close…/ })).toBeInTheDocument();
    });
  });

  describe("venue time note", () => {
    const deviceZone = (zone: string) => {
      device.zone = zone;
    };

    it("shows when the device zone differs from the venue's", () => {
      deviceZone("America/New_York");
      renderPage();
      expect(screen.getByText(/^Venue time \(Pacific/)).toBeInTheDocument();
    });

    it("hides when the device is on venue time", () => {
      deviceZone("America/Los_Angeles");
      renderPage();
      expect(screen.queryByText(/^Venue time/)).not.toBeInTheDocument();
    });
  });

  it("summarises the week from the loaded days", () => {
    daysQuery.value = {
      data: [
        summaryFor("2026-10-28"),
        {
          ...summaryFor("2026-10-29"),
          closures: [{ ruleId: "r1", targetKind: "venue", from: 1320, to: 1380 }],
        },
        { ...summaryFor("2026-10-30"), label: "Closed", scheduleId: null, serviceCount: 0 },
      ],
      isLoading: false,
      error: null,
    };
    renderPage();
    expect(
      screen.getByText("This week: open 2 days · 1 closure · online booking on")
    ).toBeInTheDocument();
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

    // After the backfill the venue reads rows; the server marks them as not yet saved over.
    configSource.value = "rows";
    configSource.migrated = true;
    const backfilled = renderPage();
    expect(screen.getByText(/Your hours were carried over/)).toBeInTheDocument();
    backfilled.unmount();

    configSource.migrated = false;
    renderPage();
    expect(screen.queryByText(/Your hours were carried over/)).not.toBeInTheDocument();
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

    it("keeps the draft, with the error above it, when a background refetch of the config fails", () => {
      const view = renderPage();
      startDraft();
      configError.value = new Error("Network down");
      view.rerender(
        <ToastProvider>
          <main>
            <AvailabilityPage />
          </main>
        </ToastProvider>
      );
      expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t check for newer hours");
    });

    it("makes Copy wait as soon as an editor is open, even before any change", () => {
      renderPage();
      openFriday();
      const copy = () => screen.getByRole("button", { name: "Copy to other days…" });
      expect(copy()).not.toHaveAttribute("aria-disabled");
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      expect(copy()).toHaveAttribute("aria-disabled", "true");
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

  describe("multi-select", () => {
    const pick = (re: RegExp) =>
      fireEvent.click(screen.getByRole("button", { name: re }), { ctrlKey: true });

    it("selects the weekday's dates from the Select… menu, skipping the past ones", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Every Wednesday in October" }));
      // Today is Wed Oct 28; the 7th, 14th and 21st are behind us.
      expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
    });

    it("skips past dates when a range is Shift-clicked across them", () => {
      renderPage();
      pick(/Monday, October 26/);
      fireEvent.click(screen.getByRole("button", { name: /Thursday, October 29/ }), {
        shiftKey: true,
      });
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
    });

    it("keeps the selection bar out of the page until a drag across today ends", () => {
      renderPage();
      const cell = (re: RegExp) => screen.getByRole("button", { name: re });
      fireEvent.mouseDown(cell(/Monday, October 26/), { button: 0 });
      fireEvent.mouseEnter(cell(/Tuesday, October 27/), { buttons: 1 });
      fireEvent.mouseEnter(cell(/Wednesday, October 28/), { buttons: 1 });
      fireEvent.mouseEnter(cell(/Thursday, October 29/), { buttons: 1 });
      // Mid-drag nothing is announced and nothing mounts that could move the grid.
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.queryByRole("button", { name: "Edit hours" })).not.toBeInTheDocument();
      fireEvent.mouseUp(window);
      // Today and later only; the two past days are dropped.
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
      expect(screen.getByRole("button", { name: "Edit hours" })).toBeInTheDocument();
    });

    it("keeps a showing selection bar as it was until a drag ends, so the grid does not move", () => {
      renderPage();
      const cell = (re: RegExp) => screen.getByRole("button", { name: re });
      pick(/Wednesday, October 28/);
      pick(/Thursday, October 29/);
      fireEvent.mouseDown(cell(/Thursday, October 29/), { button: 0 });
      fireEvent.mouseEnter(cell(/Friday, October 30/), { buttons: 1 });
      fireEvent.mouseEnter(cell(/Saturday, October 31/), { buttons: 1 });
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
      expect(screen.getByRole("button", { name: "Edit hours" })).toBeInTheDocument();
      fireEvent.mouseUp(window);
      expect(screen.getByRole("status")).toHaveTextContent("3 dates selected");
    });

    describe("when the picked dates have different hours", () => {
      const dinner = (closesAt: number) => ({
        venueServiceId: "vs1",
        name: "Dinner",
        opensAt: 1020,
        lastSeatingAt: closesAt - 60,
        closesAt,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online"],
        scheduleServiceId: null,
      });

      beforeEach(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
      });

      it("takes the rows from a date that has a service, not from a closed first date", () => {
        resolved.byDate = { "2026-10-28": [], "2026-10-30": [dinner(1380)] };
        renderPage();
        pick(/Wednesday, October 28/);
        pick(/Friday, October 30/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        const drawer = screen.getByRole("dialog", { name: "2 dates selected" });
        expect(within(drawer).getByRole("button", { name: "Edit Dinner" })).toBeInTheDocument();
        expect(drawer).toHaveTextContent("The rows below are from Friday, October 30.");
      });

      it("names the date the rows came from when two open dates close at different times", () => {
        resolved.byDate = { "2026-10-29": [dinner(1320)], "2026-10-30": [dinner(1380)] };
        renderPage();
        pick(/Thursday, October 29/);
        pick(/Friday, October 30/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        expect(screen.getByRole("dialog", { name: "2 dates selected" })).toHaveTextContent(
          "The rows below are from Thursday, October 29."
        );
      });

      it("says nothing about differing hours when the dates agree", () => {
        resolved.services = [dinner(1380)];
        renderPage();
        pick(/Thursday, October 29/);
        pick(/Friday, October 30/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        expect(screen.queryByText(/different hours/)).not.toBeInTheDocument();
      });

      it("marks every selected date with the draft dot and names the selection in the prompt", () => {
        resolved.services = [dinner(1380)];
        const { container } = renderPage();
        pick(/Thursday, October 29/);
        pick(/Friday, October 30/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
        expect(container.querySelectorAll("[data-draft-dot]")).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(
          screen.getByRole("dialog", { name: "Discard changes to the 2 selected dates?" })
        ).toBeInTheDocument();
      });
    });

    it("announces the count and opens the drawer for the first date with a fixed scope", () => {
      renderPage();
      pick(/Friday, October 30/);
      pick(/Thursday, October 29/);
      expect(screen.getByRole("status")).toHaveTextContent("2 dates selected");
      fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
      expect(screen.getByRole("dialog", { name: "2 dates selected" })).toBeInTheDocument();
      expect(drawerProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          date: "2026-10-29",
          editing: expect.objectContaining({ fixedDates: ["2026-10-29", "2026-10-30"] }),
        })
      );
    });

    describe("after a bulk edit of hours (#7980)", () => {
      const finish = (saved: boolean) => {
        const props = drawerProps.mock.lastCall?.[0] as {
          editing: { onFinished: (saved: boolean) => void };
        };
        act(() => props.editing.onFinished(saved));
      };

      it("a save clears the selection, like the other bulk actions, and focus lands on a day", () => {
        renderPage();
        pick(/Friday, October 30/);
        pick(/Thursday, October 29/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        finish(true);
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
        expect(screen.getByRole("button", { name: /Thursday, October 29/ })).toHaveFocus();
      });

      it("a discarded draft keeps the selection", () => {
        renderPage();
        pick(/Friday, October 30/);
        fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
        finish(false);
        expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
      });
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

  describe("on a phone (#7980)", () => {
    beforeEach(() => {
      window.matchMedia = vi.fn((query: string) => {
        const max = /\(max-width:\s*(\d+)px\)/.exec(query);
        return {
          media: query,
          matches: max ? 375 <= Number(max[1]) : false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        };
      }) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      Reflect.deleteProperty(window, "matchMedia");
    });

    it("keeps secondary actions in one menu", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Select…" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      const menu = screen.getByRole("menu");
      for (const name of ["History", "Select days", "Change regular week…"]) {
        expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
      }
    });

    it("gives a Host only what a Host can do", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      const menu = screen.getByRole("menu");
      expect(within(menu).getByRole("menuitem", { name: "History" })).toBeInTheDocument();
      expect(within(menu).queryByRole("menuitem", { name: /^Close…/ })).not.toBeInTheDocument();
      expect(
        within(menu).queryByRole("menuitem", { name: "Change regular week…" })
      ).not.toBeInTheDocument();
    });
  });

  it("hands focus to the calendar when quick setup's save removes the focused button (#7980)", () => {
    configSource.value = "empty";
    const { rerender } = renderPage();
    configSource.value = "rows";
    rerender(
      <ToastProvider>
        <main>
          <AvailabilityPage />
        </main>
      </ToastProvider>
    );
    expect(document.activeElement).toHaveAttribute("data-date");
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = renderPage();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
