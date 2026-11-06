import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { applyChanges, collapseDayNamedSchedules } from "@mbe/availability";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, VenueTeam } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../utils/demo-week.fixture.js";

/** The calendar's regular-week line (ux.md F-CAL), through the real page with the config read faked. */
const read = vi.hoisted(() => ({
  config: null as unknown,
  source: "rows" as "rows" | "empty" | "legacy",
  migrated: false,
}));
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityDays: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useAvailabilityConfig: () => ({
    data: {
      config: read.config,
      version: 1,
      source: read.source,
      ...(read.migrated ? { migrated: true } : {}),
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
  AVAILABILITY_CONFIG_QUERY_KEY: "availabilityConfig",
  AVAILABILITY_DAYS_QUERY_KEY: "availabilityDays",
}));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureImpact: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Special dates, reached from the holiday nudge.
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: () => <section aria-label="Quick setup" />,
}));
vi.mock("../components/availability/AvailabilityHistoryDrawer.js", () => ({
  AvailabilityHistoryDrawer: () => null,
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: team.value, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => venue,
}));

import { AvailabilityPage } from "./AvailabilityPage.js";

function renderPage() {
  return render(
    <ToastProvider>
      <main>
        <AvailabilityPage />
      </main>
    </ToastProvider>
  );
}

describe("AvailabilityPage regular-week line", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T20:00:00Z") });
    read.config = DEMO_WEEK_CONFIG;
    read.source = "rows";
    read.migrated = false;
    team.value = { viewerRole: "manager" };
  });

  it.each(["manager", "host"] as const)("shows a %s the week as one line", (viewerRole) => {
    team.value = { viewerRole };
    renderPage();
    expect(
      screen.getByText(
        "Regular week: Lunch 11:30 AM–2:00 PM Mon–Fri · Dinner 5:00 PM–9:00 PM Tue–Sun, Fri–Sat until 10:00 PM · Brunch 10:00 AM–1:00 PM Sat–Sun"
      )
    ).toBeInTheDocument();
  });

  it("opens Details to seven weekdays, and lists no schedule or assignment", () => {
    renderPage();
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rows = within(screen.getByRole("list", { name: "Regular week" })).getAllByRole(
      "listitem"
    );
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("MondayLunch 11:30 AM – 2:00 PM");
    expect(rows[4]).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(screen.queryByText("demo-regular")).not.toBeInTheDocument();
  });

  it("has no Details for a uniform week", () => {
    const uniform: AvailabilityConfig = {
      ...DEMO_WEEK_CONFIG,
      venueServices: [DEMO_WEEK_CONFIG.venueServices[1]!],
      scheduleServices: [
        {
          ...DEMO_WEEK_CONFIG.scheduleServices[1]!,
          weekdays: [],
          dayHours: { version: 1, sets: [] },
        },
      ],
    };
    read.config = uniform;
    renderPage();
    expect(screen.getByText("Regular week: Dinner 5:00 PM–9:00 PM every day")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
  });

  it("tells a Manager the next unplanned holiday and takes them to Special dates", () => {
    localStorage.clear();
    renderPage();
    expect(
      screen.getByText("Thanksgiving is Thu, Nov 26 and isn't planned yet.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plan holidays" }));
    expect(screen.getByRole("radio", { name: "Special dates" })).toBeChecked();
  });

  it("says nothing of a holiday to a Host, or of one marked Open as usual", () => {
    team.value = { viewerRole: "host" };
    const { unmount } = renderPage();
    expect(screen.queryByText(/isn't planned yet/)).not.toBeInTheDocument();
    unmount();
    team.value = { viewerRole: "manager" };
    localStorage.setItem("mbe-availability-open-as-usual:venue-1", JSON.stringify(["2026-11-26"]));
    renderPage();
    expect(screen.queryByText(/Thanksgiving is/)).not.toBeInTheDocument();
    localStorage.clear();
  });

  it("shows a regular week saved for a later date before it takes over", () => {
    const old = DEMO_WEEK_CONFIG.schedules[0]!;
    const dinner = DEMO_WEEK_CONFIG.scheduleServices.find((r) => r.id === "demo-ss-dinner")!;
    read.config = {
      ...DEMO_WEEK_CONFIG,
      schedules: [
        { ...old, isRegular: false },
        { ...old, id: "next", isRegular: true },
      ],
      scheduleServices: [
        ...DEMO_WEEK_CONFIG.scheduleServices,
        {
          ...dinner,
          id: "next-dinner",
          scheduleId: "next",
          weekdays: [],
          dayHours: { version: 1, sets: [] },
        },
      ],
      assignments: [
        { ...DEMO_WEEK_CONFIG.assignments[0]!, endsOn: "2026-11-30" },
        {
          id: "as-next",
          scheduleId: "next",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          precedence: 1,
          startsOn: "2026-12-01",
        },
      ],
    };
    renderPage();
    expect(screen.getByText(/^Regular week: Lunch 11:30 AM–2:00 PM Mon–Fri/)).toBeInTheDocument();
    expect(screen.getByText("From Dec 1: Dinner 5:00 PM–9:00 PM every day")).toBeInTheDocument();
  });
});

/**
 * A venue migrated in the old shape: the regular week Mon–Wed and a day-named "Thu–Fri hours"
 * schedule that closes later, undated and ranked above it.
 */
function oldShapeMigrated(): AvailabilityConfig {
  const seating = { version: 1, interval: 15 } as const;
  const hours = { seating, bookingTypes: ["online", "phone"] as ("online" | "phone")[] };
  const none = { weekdays: [], dayHours: { version: 1 as const, sets: [] } };
  return {
    schedules: [
      { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
      { id: "thu-fri", name: "Thu–Fri hours", kind: "alternate", isRegular: false },
    ],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      {
        id: "ss-regular",
        scheduleId: "regular",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1320,
        ...hours,
        ...none,
      },
      {
        id: "ss-thu-fri",
        scheduleId: "thu-fri",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1320,
        closesAt: 1380,
        ...hours,
        ...none,
      },
    ],
    assignments: [
      { id: "as-regular", scheduleId: "regular", weekdays: [1, 2, 3], precedence: 0 },
      { id: "as-thu-fri", scheduleId: "thu-fri", weekdays: [4, 5], precedence: 1 },
    ],
    dateRules: [],
  };
}

function collapsed(): AvailabilityConfig {
  const before = oldShapeMigrated();
  let n = 0;
  const changes = collapseDayNamedSchedules(before, () => `fold-${++n}`);
  expect(changes).not.toBeNull();
  return applyChanges(before, changes!, "2026-11-04T00:00:00.000Z");
}

describe("AvailabilityPage on a migrated venue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T20:00:00Z") });
    read.source = "rows";
    read.migrated = false;
    team.value = { viewerRole: "manager" };
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("reads a collapsed venue as one regular week, with no day-named schedule and no Schedules tab", () => {
    read.config = collapsed();
    const { container } = renderPage();
    expect(
      screen.getByText("Regular week: Dinner 5:00 PM–9:00 PM Mon–Fri, Thu–Fri until 10:00 PM")
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Thu–Fri hours/);
    expect(screen.queryByRole("radio", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("opens Change regular week pre-filled from the collapsed week", () => {
    read.config = collapsed();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Change regular week…" }));
    const drawer = screen.getByRole("dialog", { name: "Change regular week" });
    expect(within(drawer).getByDisplayValue("Dinner")).toBeInTheDocument();
    // The Thu–Fri close is a block of different hours on the one Dinner row, not a schedule.
    const block = within(drawer).getByRole("group", { name: "Dinner: different hours" });
    expect(
      within(block)
        .getAllByRole("checkbox")
        .filter((c) => (c as HTMLInputElement).checked)
        .map((c) => c.closest("label")?.textContent)
    ).toEqual(["Thu", "Fri"]);
  });

  it("keeps the Schedules tab and the day-named schedule for a venue not yet collapsed", () => {
    read.config = oldShapeMigrated();
    renderPage();
    expect(screen.getByRole("radio", { name: "Schedules" })).toBeInTheDocument();
    expect(screen.getByText("Regular week: Dinner 5:00 PM–9:00 PM Mon–Wed")).toBeInTheDocument();
  });

  it("still tells a venue with rows and no change that its hours were carried over", () => {
    read.config = collapsed();
    read.migrated = true;
    renderPage();
    expect(screen.getByText(/Your hours were carried over/)).toBeInTheDocument();
  });
});

/** The demo week plus Summer hours: its services copied, run every day of November. */
function withDatedSchedule(): AvailabilityConfig {
  return {
    ...DEMO_WEEK_CONFIG,
    schedules: [
      ...DEMO_WEEK_CONFIG.schedules,
      { id: "summer", name: "Summer hours", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...DEMO_WEEK_CONFIG.scheduleServices,
      ...DEMO_WEEK_CONFIG.scheduleServices.map((s) => ({
        ...s,
        id: `${s.id}-summer`,
        scheduleId: "summer",
      })),
    ],
    assignments: [
      ...DEMO_WEEK_CONFIG.assignments,
      {
        id: "as-summer",
        scheduleId: "summer",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startsOn: "2026-11-01",
        endsOn: "2026-11-30",
        precedence: 1,
      },
    ],
  };
}

describe("AvailabilityPage: Edit on a dated schedule's layer (#7981)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T20:00:00Z") });
    read.source = "rows";
    read.migrated = false;
    team.value = { viewerRole: "manager" };
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    read.config = withDatedSchedule();
  });

  it("opens the schedule's editor over the page", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Friday, November 6/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Summer hours" }));
    const ask = screen.getByRole("dialog", { name: "Edit Summer hours" });
    fireEvent.click(within(ask).getByRole("radio", { name: "All dates Summer hours covers" }));
    fireEvent.click(within(ask).getByRole("button", { name: "Continue" }));
    const editor = screen.getByRole("dialog", { name: "Edit Summer hours" });
    expect(within(editor).getByLabelText(/Schedule name/)).toHaveValue("Summer hours");
  });
});
