import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type * as Engine from "@mbe/availability";
import type * as Format from "../utils/format.js";
import type * as Drawer from "../components/availability/AvailabilityDayDrawer.js";
import type * as Venues from "../hooks/useVenues.js";
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
/** The venue's sections; undefined until that read answers. */
const sections = vi.hoisted(() => ({
  value: [{ id: "sec-bar", name: "Bar" }] as Array<{ id: string; name: string }> | undefined,
}));
const teamError = vi.hoisted(() => ({ value: null as Error | null }));
/** The role read has not answered. */
const teamLoading = vi.hoisted(() => ({ value: false }));
/** Date rules the config carries (a pause, for the paused banner). */
const extraRules = vi.hoisted(() => ({ value: [] as unknown[] }));
const teamRefetch = vi.hoisted(() => vi.fn());
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const resolved = vi.hoisted(() => ({
  services: [] as unknown[],
  /** Hours for one date, where it differs from `services`. */
  byDate: {} as Record<string, unknown[]>,
}));
const serviceList = vi.hoisted(() => ({
  value: [{ id: "vs1", name: "Dinner", position: 0 }] as Array<{
    id: string;
    name: string;
    position: number;
    archivedAt?: string | null;
  }>,
}));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: sections.value,
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
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
          venueServices: serviceList.value,
          scheduleServices: [],
          assignments: [],
          dateRules: extraRules.value,
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
vi.mock("../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
}));
vi.mock("../hooks/useVenues.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Venues>()),
  useUpdateVenue: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpact: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: ({ venueId }: { venueId: string }) => (
    <section aria-label="Quick setup">{venueId}</section>
  ),
}));
vi.mock("../components/availability/TodayLine.js", () => ({
  TodayLine: ({ venueId, bannerShowsOnline }: { venueId: string; bannerShowsOnline: boolean }) => (
    <section aria-label="Today line" data-venue={venueId} data-banner={String(bannerShowsOnline)} />
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
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  // The calendar popover is not what these tests are about: a plain input stands in for it.
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../utils/format.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Format>()),
  deviceTimeZone: () => device.zone,
}));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({
    data: team.value,
    isLoading: teamLoading.value,
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

/** The URL the router holds, for the entry contract's "param removed after mount". */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function page(url = "/availability?tab=calendar") {
  return (
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <main>
          <AvailabilityPage />
        </main>
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>
  );
}

// Dialog and Popover exits are real-time springs in jsdom (~0.75 s to unmount), which put
// the Go to date tests right at waitFor's 1 s limit. Reduced motion makes them instant; no
// other media query matches, so the layout stays desktop.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

function renderPage(url?: string) {
  return render(page(url));
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
    serviceList.value = [{ id: "vs1", name: "Dinner", position: 0 }];
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

  async function openGoToDate() {
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Go to date" }));
    const dialog = await screen.findByRole("dialog", { name: "Go to date" });
    // The dialog's DOM lands before React runs its passive effects, and one of them registers
    // the Escape listener: an Escape sent in that gap is lost and the dialog never closes (seen
    // under CPU load, #8723). The focus trap moves focus in from the same effect pass, so
    // focus inside the dialog means it is interactive.
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  }
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  it("goes to a chosen date in the month on show, from the More actions menu (Go to date)", async () => {
    renderPage();
    await openGoToDate();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-28");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("March 2027")).toBeVisible();
    expect(daysHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2027-03-01", to: "2027-04-04" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Go to date" })).not.toBeInTheDocument()
    );
  });

  it("keeps the wide row to one line: the menu trigger is an icon with a name, not a label", () => {
    renderPage();
    const more = screen.getByRole("button", { name: "More actions" });
    // Visible text is the glyph alone; the name comes from aria-label.
    expect(more).toHaveTextContent(/^⋯$/);
    expect(more).toHaveAttribute("aria-label", "More actions");
    expect(more).toHaveAttribute("aria-haspopup", "menu");
  });

  it("opens the dialog only after the menu has closed and returned its focus", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Go to date" }));
    // Opened in the same frame, the dialog would lose its focus to the menu's restore.
    expect(screen.queryByRole("dialog", { name: "Go to date" })).not.toBeInTheDocument();
    await screen.findByRole("dialog", { name: "Go to date" });
  });

  it("starts the picker on the calendar's date, not on today", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await openGoToDate();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-28");
  });

  it("puts focus on the day it went to, after the dialog has handed focus back", async () => {
    renderPage();
    await openGoToDate();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Go to date" })).not.toBeInTheDocument()
    );
    await frame();
    await frame();
    expect(document.activeElement).toHaveAttribute("data-date", "2027-03-15");
  });

  it("leaves focus on the menu button when Go to date is dismissed", async () => {
    renderPage();
    // A pointer click does not focus in jsdom; a real one does.
    screen.getByRole("button", { name: "More actions" }).focus();
    await openGoToDate();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Go to date" })).not.toBeInTheDocument()
    );
    await frame();
    await frame();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More actions" }));
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

  it("names a section closure by its section on the calendar cell", () => {
    daysQuery.value = {
      data: [
        {
          ...summaryFor("2026-10-29"),
          closures: [
            { ruleId: "r-bar", targetKind: "tables", sectionId: "sec-bar", from: 0, to: 2880 },
          ],
        },
      ] as AvailabilityDaySummary[],
      isLoading: false,
      error: null,
    };
    sections.value = undefined;
    const view = renderPage();
    // The sections read answers after the days: the cell is renamed, not left on "Tables blocked".
    sections.value = [{ id: "sec-bar", name: "Bar" }];
    view.rerender(page());
    expect(screen.getByRole("button", { name: /Thursday, October 29/ })).toHaveAccessibleName(
      /Bar closed all day/
    );
  });

  it("opens the day drawer from a cell", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    const dialog = screen.getByRole("dialog", { name: /Friday, October 30/ });
    expect(within(dialog).getByText(/Closed\./)).toBeInTheDocument();
  });

  describe("the entry contract (?tab=, ?closeSection=, ?from=setup)", () => {
    const schedulesTab = () => screen.queryByRole("radio", { name: "Schedules" });

    it("shows a Manager the Schedules tab on a one-schedule venue", () => {
      renderPage();
      expect(schedulesTab()).toBeInTheDocument();
    });

    it("does not show a Host the Schedules tab", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      expect(schedulesTab()).not.toBeInTheDocument();
    });

    it("opens Schedules for ?tab=schedules", () => {
      renderPage("/availability?tab=schedules");
      expect(schedulesTab()).toBeChecked();
      expect(screen.getByRole("heading", { level: 2, name: "Regular week" })).toBeInTheDocument();
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    it("gives a Host the calendar for ?tab=schedules", () => {
      team.value = { viewerRole: "host" };
      renderPage("/availability?tab=schedules");
      expect(screen.getByRole("grid")).toBeInTheDocument();
      expect(schedulesTab()).not.toBeInTheDocument();
    });

    it("renders the default page for garbage params", () => {
      renderPage("/availability?tab=%00&closeSection=&from=nowhere&x=1");
      // No valid tab: a Manager lands on Schedules.
      expect(screen.getByRole("radio", { name: "Schedules" })).toBeChecked();
      expect(screen.queryByRole("link", { name: "Venue Setup" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows the Venue Setup back-link only for ?from=setup", () => {
      const view = renderPage("/availability?from=setup");
      expect(screen.getByRole("link", { name: "Venue Setup" })).toHaveAttribute("href", "/setup");
      view.unmount();
      renderPage();
      expect(screen.queryByRole("link", { name: "Venue Setup" })).not.toBeInTheDocument();
    });

    it("opens a Manager's Close dialog on the section ?closeSection= names", () => {
      renderPage("/availability?closeSection=sec-bar");
      const dialog = screen.getByRole("dialog", { name: /^Close$/ });
      expect(within(dialog).getByRole("radio", { name: "One section" })).toBeChecked();
      expect(within(dialog).getByRole("combobox", { name: "Section" })).toHaveTextContent("Bar");
    });

    it("opens the Close dialog with no preselection for a section the venue lacks", () => {
      renderPage("/availability?closeSection=gone");
      const dialog = screen.getByRole("dialog", { name: /^Close$/ });
      expect(within(dialog).getByRole("radio", { name: "Whole venue" })).toBeChecked();
      expect(within(dialog).getByRole("radio", { name: "One section" })).not.toBeChecked();
    });

    it("opens no Close dialog for a Host", () => {
      team.value = { viewerRole: "host" };
      renderPage("/availability?closeSection=sec-bar");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("removes closeSection from the URL after mount and keeps the other params", () => {
      renderPage("/availability?tab=schedules&closeSection=sec-1&from=setup");
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/availability?tab=schedules&from=setup"
      );
    });

    it("opens the seeded schedule editor on Schedules for ?action=addSchedule, once", async () => {
      renderPage("/availability?action=addSchedule&from=setup");
      expect(await screen.findByRole("dialog", { name: "New schedule" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Schedules" })).toBeChecked();
      expect(screen.getByLabelText("Starting")).toHaveValue("");
      expect(screen.getByTestId("location")).toHaveTextContent("/availability?from=setup");
    });

    it("opens no editor for ?action=addSchedule on another layer", () => {
      renderPage("/availability?tab=calendar&action=addSchedule");
      expect(screen.queryByRole("dialog", { name: "New schedule" })).not.toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/availability?tab=calendar");
    });

    it("does not hold ?action=addSchedule back on a venue with no hours until quick setup saves", () => {
      configSource.value = "empty";
      const view = renderPage("/availability?action=addSchedule");
      configSource.value = "rows";
      view.rerender(page("/availability?action=addSchedule"));
      expect(screen.queryByRole("dialog", { name: "New schedule" })).not.toBeInTheDocument();
    });

    it("opens no editor for a Host who follows ?action=addSchedule", () => {
      team.value = { viewerRole: "host" };
      renderPage("/availability?action=addSchedule");
      expect(screen.queryByRole("dialog", { name: "New schedule" })).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Calendar" })).toBeChecked();
    });
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

    it("has no Today line: the setup form is the page", () => {
      renderPage();
      expect(screen.queryByRole("region", { name: "Today line" })).not.toBeInTheDocument();
    });

    it("tells a Host a manager sets the week, with no card", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      expect(screen.getByText(/A manager sets the regular week here/)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Quick setup" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: "Guest preview" })
      ).not.toBeInTheDocument();
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

  it("opens History from the More actions menu and lets an entry open its day", async () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "History drawer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "History" }));
    const history = await screen.findByRole("region", { name: "History drawer" });
    fireEvent.click(within(history).getByRole("button", { name: "Go to day" }));
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
      expect(
        screen.queryByRole("alertdialog", { name: /Discard changes/ })
      ).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("asks before cancelling a draft, and Keep editing keeps it", () => {
      renderPage();
      startDraft();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        screen.getByRole("alertdialog", { name: /Discard changes to Friday, October 30\?/ })
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
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(container.querySelector("[data-draft-dot]")).toBeNull();
    });

    it("asks before another day replaces the draft", () => {
      renderPage();
      startDraft();
      fireEvent.click(screen.getByRole("button", { name: /Thursday, October 29/ }));
      expect(
        screen.getByRole("alertdialog", { name: /Discard changes to Friday, October 30\?/ })
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
      expect(screen.getByRole("dialog", { name: /Thursday, October 29/ })).toBeTruthy();
    });

    it("keeps the draft, with the error above it, when a background refetch of the config fails", () => {
      const view = renderPage();
      startDraft();
      configError.value = new Error("Network down");
      view.rerender(page());
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
        screen.getByRole("alertdialog", { name: /Discard changes to Friday, October 30\?/ })
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
      await waitFor(
        () =>
          expect(
            screen.queryByRole("dialog", { name: /Friday, October 30/ })
          ).not.toBeInTheDocument(),
        { timeout: 5000 }
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

    it("opens Close from the selection bar on the selected dates, one closure each (#7981)", () => {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      renderPage();
      pick(/Thursday, October 29/);
      pick(/Friday, October 30/);
      const bar = screen.getByRole("group", { name: "Selected dates" });
      fireEvent.click(within(bar).getByRole("button", { name: "Close…" }));
      const dialog = screen.getByRole("dialog", { name: "Close" });
      expect(within(dialog).getByRole("radio", { name: "Several dates" })).toBeChecked();
      expect(within(dialog).getByText("Thu, Oct 29")).toBeInTheDocument();
      expect(within(dialog).getByText("Fri, Oct 30")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Close 2 dates" })).toBeInTheDocument();
    });

    it("hides Close… from the selection bar for a Host", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      pick(/Thursday, October 29/);
      const bar = screen.getByRole("group", { name: "Selected dates" });
      expect(within(bar).queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
    });

    it("selects the weekday's dates from the Select… menu, skipping the past ones", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Every Wednesday in October" }));
      // Today is Wed Oct 28; the 7th, 14th and 21st are behind us.
      expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
    });

    it("offers Select days on the grid too, where a plain click then picks a day", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Select days" }));
      expect(screen.getByRole("status")).toHaveTextContent(
        "Click the days you want, or drag across them"
      );
      fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
      expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
      expect(screen.queryByRole("dialog", { name: /Friday, October 30/ })).not.toBeInTheDocument();
    });

    it("says so when a Ctrl-click on a past date selects nothing", () => {
      renderPage();
      pick(/Monday, October 26/);
      expect(screen.getByRole("status")).toHaveTextContent("Past dates can’t be selected.");
    });

    it("drops the message when the Manager moves to another month", () => {
      renderPage();
      pick(/Monday, October 26/);
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.queryByText("Past dates can’t be selected.")).not.toBeInTheDocument();
    });

    it("says so when Shift+Arrow extends from today onto a past date", () => {
      renderPage();
      fireEvent.keyDown(screen.getByRole("button", { name: /Wednesday, October 28/ }), {
        key: "ArrowLeft",
        shiftKey: true,
      });
      expect(screen.getByRole("status")).toHaveTextContent("Past dates can’t be selected.");
    });

    it("announces again when the same gesture repeats on another past date", () => {
      renderPage();
      const space = (re: RegExp) =>
        fireEvent.keyDown(screen.getByRole("button", { name: re }), { key: " " });
      space(/Monday, October 26/);
      const first = screen.getByText("Past dates can’t be selected.");
      space(/Tuesday, October 27/);
      // A new node, so the live region speaks again.
      expect(screen.getByText("Past dates can’t be selected.")).not.toBe(first);
    });

    it("says so when Space on a past date selects nothing", () => {
      renderPage();
      fireEvent.keyDown(screen.getByRole("button", { name: /Monday, October 26/ }), { key: " " });
      expect(screen.getByText("Past dates can’t be selected.")).toBeInTheDocument();
    });

    it("drops the message once a selection lands entirely on future dates", () => {
      renderPage();
      pick(/Monday, October 26/);
      pick(/Thursday, October 29/);
      expect(screen.queryByText("Past dates can’t be selected.")).not.toBeInTheDocument();
    });

    it("offers no weekday entry in a month that is already over, and no empty menu", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      // The anchor is Mon Sep 28; every Monday in September is behind us, and nothing else is on offer.
      expect(screen.queryByRole("button", { name: "Select…" })).not.toBeInTheDocument();
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
          screen.getByRole("alertdialog", { name: "Discard changes to the 2 selected dates?" })
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
        screen.getByRole("alertdialog", { name: /Discard changes to Friday, October 30\?/ })
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

    it("keeps the page's actions in one ⋯ and the calendar's picking in Select…", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close…" })).toBeInTheDocument();
      // Pause online booking sits first in ⋯ on a phone (two interactions).
      expect(
        screen.queryByRole("button", { name: "Pause online booking" })
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      const menu = screen.getByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent)
      ).toEqual([
        "Pause online booking",
        "Booking rules…",
        "Compare services",
        "Duplicate regular week…",
        "History",
        "Go to date",
      ]);
    });

    it("the calendar's phone menu is Select… and holds only the ways to pick days", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Select…" }));
      const select = screen.getByRole("menu");
      expect(within(select).getByRole("menuitem", { name: "Select days" })).toBeInTheDocument();
      expect(
        within(select).queryByRole("menuitem", { name: "Go to date" })
      ).not.toBeInTheDocument();
      expect(within(select).queryByRole("menuitem", { name: "History" })).not.toBeInTheDocument();
    });

    it("goes to a date from the phone menu", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Go to date" }));
      expect(await screen.findByRole("dialog", { name: "Go to date" })).toBeInTheDocument();
    });

    it("gives a Host a ⋯ with History and Go to date only, and the calendar's Select…", () => {
      team.value = { viewerRole: "host" };
      renderPage();
      expect(screen.queryByRole("button", { name: /^Close…/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      expect(
        within(screen.getByRole("menu"))
          .getAllByRole("menuitem")
          .map((item) => item.textContent)
      ).toEqual(["History", "Go to date"]);
    });
  });

  it("hands focus to the calendar when quick setup's save lands on a layer with no Regular week heading", () => {
    configSource.value = "empty";
    const { rerender } = renderPage("/availability?tab=calendar");
    configSource.value = "rows";
    rerender(page("/availability?tab=calendar"));
    expect(document.activeElement).toHaveAttribute("data-date");
  });

  it("hands focus to the Regular week heading when quick setup's save removes the focused button (#7980)", () => {
    configSource.value = "empty";
    const { rerender } = renderPage("/availability");
    configSource.value = "rows";
    rerender(page("/availability"));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: "Regular week" })
    );
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = renderPage();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});

describe("AvailabilityPage Services filter (#7981)", () => {
  const lunch = {
    venueServiceId: "vs0",
    name: "Lunch",
    opensAt: 690,
    lastSeatingAt: 810,
    closesAt: 870,
  };
  const dinner = {
    venueServiceId: "vs1",
    name: "Dinner",
    opensAt: 1020,
    lastSeatingAt: 1260,
    closesAt: 1380,
  };
  const twoServices = [
    { id: "vs1", name: "Dinner", position: 1 },
    { id: "vs0", name: "Lunch", position: 0 },
  ];
  const day = (date: string, services: (typeof lunch)[]): AvailabilityDaySummary => ({
    ...summaryFor(date),
    serviceCount: services.length,
    services,
  });

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    venue.selectedVenueId = "venue-1";
    configSource.value = "rows";
    configError.value = null;
    configAbsent.value = false;
    teamError.value = null;
    team.value = { viewerRole: "manager" };
    resolved.services = [];
    resolved.byDate = {};
    serviceList.value = twoServices;
    daysQuery.value = {
      data: [
        day("2026-10-26", [lunch]),
        day("2026-10-27", [lunch, dinner]),
        day("2026-10-28", [lunch, dinner]),
        day("2026-10-29", [lunch, dinner]),
      ],
      isLoading: false,
      error: null,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sits beside the week summary, not in the toolbar that has no width to spare", () => {
    renderPage();
    const filter = screen.getByRole("combobox", { name: "Services" });
    const summary = screen.getByText(/This week: open/);
    expect(summary.parentElement).toContainElement(filter);
    expect(
      screen.getByRole("radio", { name: "Week" }).closest("div")?.parentElement
    ).not.toContainElement(filter);
  });

  describe("on a phone", () => {
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

    it("sits in the toolbar, once", () => {
      renderPage();
      expect(screen.getAllByRole("combobox", { name: "Services" })).toHaveLength(1);
      const summary = screen.getByText(/This week: open/);
      expect(summary.parentElement).not.toContainElement(
        screen.getByRole("combobox", { name: "Services" })
      );
    });
  });

  it("is not offered to a venue with one service", () => {
    serviceList.value = [{ id: "vs1", name: "Dinner", position: 0 }];
    renderPage();
    expect(screen.queryByRole("combobox", { name: "Services" })).not.toBeInTheDocument();
  });

  it("narrows every cell and the week summary to the chosen service", () => {
    renderPage();
    // Month cells are quiet (a date and one chip); the week view lists each cell's services.
    fireEvent.click(screen.getByRole("radio", { name: "Week" }));
    const monday = () => screen.getByRole("button", { name: /Monday, October 26/ });
    expect(monday()).toHaveTextContent("Lunch");
    expect(screen.getByText(/This week: open 4 days/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Services" }));
    fireEvent.click(screen.getByRole("option", { name: "Dinner" }));

    expect(monday()).toHaveTextContent("No Dinner");
    expect(monday()).not.toHaveTextContent("Lunch");
    expect(screen.getByText(/This week, Dinner: open 3 days/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Services" }));
    fireEvent.click(screen.getByRole("option", { name: "All services" }));
    expect(screen.getByText(/This week: open 4 days/)).toBeInTheDocument();
  });

  it("goes back to All on another venue", () => {
    const view = renderPage();
    fireEvent.click(screen.getByRole("combobox", { name: "Services" }));
    fireEvent.click(screen.getByRole("option", { name: "Dinner" }));
    expect(screen.getByText(/This week, Dinner/)).toBeInTheDocument();
    venue.selectedVenueId = "venue-2";
    view.rerender(page());
    expect(screen.getByText(/This week: open/)).toBeInTheDocument();
  });
});

describe("AvailabilityPage layers", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    venue.selectedVenueId = "venue-1";
    configSource.value = "rows";
    configSource.migrated = false;
    configError.value = null;
    configAbsent.value = false;
    teamError.value = null;
    teamLoading.value = false;
    extraRules.value = [];
    sections.value = [{ id: "sec-bar", name: "Bar" }];
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
    teamLoading.value = false;
    extraRules.value = [];
    vi.useRealTimers();
  });

  const layerRadio = (name: string) => screen.getByRole("radio", { name });
  const headerButton = (name: string) => screen.getByRole("button", { name });

  it("shows the skeleton, and no calendar or layer control, while the role is pending", () => {
    teamLoading.value = true;
    team.value = undefined;
    renderPage("/availability?tab=calendar");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(headerButton("Close…")).toBeDisabled();
  });

  it("lands a Manager on Schedules", () => {
    renderPage("/availability");
    expect(layerRadio("Schedules")).toBeChecked();
    expect(screen.getByTestId("week-panel")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("lands a Host on Calendar, with no Schedules layer and only History and Go to date in ⋯", () => {
    team.value = { viewerRole: "host" };
    renderPage("/availability");
    expect(layerRadio("Calendar")).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Schedules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause online booking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a schedule…" })).not.toBeInTheDocument();
    fireEvent.click(headerButton("More actions"));
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["History", "Go to date"]);
  });

  it("opens Calendar for ?tab=calendar, and lists the layers in order", () => {
    renderPage("/availability?tab=calendar");
    expect(layerRadio("Calendar")).toBeChecked();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(
      within(screen.getByRole("radiogroup", { name: "Availability view" }))
        .getAllByRole("radio")
        .map((r) => r.textContent)
    ).toEqual(["Schedules", "Calendar", "Special dates"]);
  });

  it("first paint for a Manager on a one-schedule venue has 8 controls outside the week panel", () => {
    renderPage("/availability");
    const panel = screen.getByTestId("week-panel");
    const controls = Array.from(
      document.body.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")
    ).filter((el) => !panel.contains(el));
    expect(controls.map((el) => el.textContent || el.getAttribute("aria-label"))).toEqual([
      "Close…",
      "Pause online booking",
      "⋯",
      "Schedules",
      "Calendar",
      "Special dates",
      "Add a schedule…",
      "Booking: not set up yet · Set up",
    ]);
  });

  describe.each([["schedules"], ["calendar"], ["special"]] as const)("from the %s layer", (tab) => {
    it("opens Close… and Pause online booking from the header", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("Close…"));
      expect(await screen.findByRole("dialog", { name: /Close/ })).toBeInTheDocument();
    });

    it("opens Pause online booking from the header", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("Pause online booking"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("opens Booking rules… from ⋯", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("More actions"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Booking rules…" }));
      expect(await screen.findByLabelText(/How far ahead guests can book/)).toBeInTheDocument();
    });

    it("opens History from ⋯", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("More actions"));
      fireEvent.click(screen.getByRole("menuitem", { name: "History" }));
      expect(await screen.findByRole("region", { name: "History drawer" })).toBeInTheDocument();
    });

    it("goes to Calendar, then opens Go to date from ⋯", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("More actions"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Go to date" }));
      expect(await screen.findByRole("dialog", { name: "Go to date" })).toBeInTheDocument();
      expect(layerRadio("Calendar")).toBeChecked();
    });

    it("goes to Schedules and opens Compare services from ⋯", async () => {
      renderPage(`/availability?tab=${tab}`);
      fireEvent.click(headerButton("More actions"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Compare services" }));
      expect(await screen.findByRole("heading", { name: "Compare services" })).toBeInTheDocument();
      expect(layerRadio("Schedules")).toBeChecked();
    });

    it("shows the paused banner above the layer control", () => {
      extraRules.value = [
        {
          id: "pause-1",
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          startsOn: "2026-10-28",
          endsOn: null,
        },
      ];
      renderPage(`/availability?tab=${tab}`);
      expect(screen.getByText("Online booking paused")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Pause online booking" })
      ).not.toBeInTheDocument();
    });

    it("mounts the Today line after the header and before the banner, told the banner is up", () => {
      extraRules.value = [
        {
          id: "pause-1",
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          startsOn: "2026-10-28",
          endsOn: null,
        },
      ];
      renderPage(`/availability?tab=${tab}`);
      const line = screen.getByRole("region", { name: "Today line" });
      expect(line).toHaveAttribute("data-venue", "venue-1");
      expect(line).toHaveAttribute("data-banner", "true");
      const banner = screen.getByText("Online booking paused");
      expect(line.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("tells the Today line there is no banner when nothing is paused", () => {
      renderPage(`/availability?tab=${tab}`);
      expect(screen.getByRole("region", { name: "Today line" })).toHaveAttribute(
        "data-banner",
        "false"
      );
    });
  });

  it("Duplicate regular week… opens the schedule editor from ⋯", async () => {
    renderPage("/availability?tab=calendar");
    fireEvent.click(headerButton("More actions"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate regular week…" }));
    expect(await screen.findByRole("textbox", { name: /Schedule name/ })).toHaveValue(
      "Weeknight (copy)"
    );
  });

  it("asks before leaving Schedules with an edited week, and stays on Keep editing", () => {
    renderPage("/availability");
    const closes = screen.getAllByLabelText("Closes")[0] as HTMLInputElement;
    expect(closes).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    fireEvent.click(layerRadio("Calendar"));
    const ask = screen.getByRole("alertdialog", { name: "Discard your changes?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(layerRadio("Schedules")).toBeChecked();
    fireEvent.click(layerRadio("Calendar"));
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "Discard your changes?" })).getByRole(
        "button",
        {
          name: "Discard",
        }
      )
    );
    expect(layerRadio("Calendar")).toBeChecked();
  });

  it("leaves no day target behind when Keep editing answers the guard after History → open day", async () => {
    renderPage("/availability");
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    fireEvent.click(headerButton("More actions"));
    fireEvent.click(screen.getByRole("menuitem", { name: "History" }));
    fireEvent.click(await screen.findByRole("button", { name: "Go to day" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "Discard your changes?" })).getByRole(
        "button",
        {
          name: "Keep editing",
        }
      )
    );
    expect(layerRadio("Schedules")).toBeChecked();
    // Later, a plain visit to Calendar opens no day.
    fireEvent.click(layerRadio("Calendar"));
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "Discard your changes?" })).getByRole(
        "button",
        {
          name: "Discard",
        }
      )
    );
    expect(layerRadio("Calendar")).toBeChecked();
    expect(screen.queryByRole("dialog", { name: /October 30/ })).not.toBeInTheDocument();
  });

  it("goes to the Calendar day from History opened on another layer", async () => {
    renderPage("/availability");
    fireEvent.click(headerButton("More actions"));
    fireEvent.click(screen.getByRole("menuitem", { name: "History" }));
    fireEvent.click(await screen.findByRole("button", { name: "Go to day" }));
    expect(layerRadio("Calendar")).toBeChecked();
  });
});
