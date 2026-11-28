import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, DateRule, VenueTeam } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../utils/demo-week.fixture.js";

/** "Next 7 days" under the page header (#9933), through the real page with the reads faked. */
const read = vi.hoisted(() => ({ config: null as unknown }));
const team = vi.hoisted(() => ({
  value: undefined as Partial<VenueTeam> | undefined,
  isLoading: false,
}));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: [{ id: "sec-patio", name: "Patio" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityDays: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useAvailabilityConfig: () => ({
    data: { config: read.config, version: 1, source: "rows" },
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
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
}));
vi.mock("../components/availability/AvailabilityHistoryDrawer.js", () => ({
  AvailabilityHistoryDrawer: () => null,
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({
    data: team.value,
    isLoading: team.isLoading,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => venue,
}));

import { AvailabilityPage } from "./AvailabilityPage.js";

const SCOPE = { openClose: vi.fn(), openPause: vi.fn() };

function renderPage(url = "/availability") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <main>
          <Routes>
            <Route element={<Outlet context={SCOPE} />}>
              <Route path="*" element={<AvailabilityPage />} />
            </Route>
          </Routes>
        </main>
      </ToastProvider>
    </MemoryRouter>
  );
}

const closure = (id: string, date: string, extra: Partial<DateRule> = {}) =>
  ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    window: null,
    ...extra,
  }) as DateRule;

const withRules = (...dateRules: DateRule[]): AvailabilityConfig => ({
  ...DEMO_WEEK_CONFIG,
  dateRules,
});

/** Dinner 5:00 PM to 2:00 AM (next day) every day: the service date stays yesterday until 2:00 AM. */
const overnightDinner = (): AvailabilityConfig => ({
  schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-dinner",
      scheduleId: "regular",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1440,
      closesAt: 1560,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [
    { id: "as-regular", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
});

const week = () => screen.getByRole("region", { name: "Next 7 days" });

describe("AvailabilityPage: Next 7 days", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Noon on Wed Nov 4 in Los Angeles: the week is Nov 5 to 11, Thanksgiving is past it.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T20:00:00Z") });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    read.config = withRules(closure("sat", "2026-11-07"));
    team.value = { viewerRole: "manager" };
    team.isLoading = false;
  });

  it("shows a Manager, on the Schedules tab they land on, a closure 3 days out", () => {
    renderPage();
    expect(screen.getByRole("radio", { name: "Seasonal hours" })).toBeChecked();
    expect(
      within(week()).getByRole("button", { name: "Sat, Nov 7 · Closed, show the day" })
    ).toBeInTheDocument();
  });

  it("switches to Calendar with that day's drawer open when a row is tapped", () => {
    renderPage();
    fireEvent.click(
      within(week()).getByRole("button", { name: "Sat, Nov 7 · Closed, show the day" })
    );
    expect(screen.getByRole("radio", { name: "Calendar" })).toBeChecked();
    expect(screen.getByRole("dialog", { name: /November 7/ })).toBeInTheDocument();
  });

  it("opens the day from Special dates too", () => {
    renderPage("/availability?tab=special");
    fireEvent.click(
      within(week()).getByRole("button", { name: "Sat, Nov 7 · Closed, show the day" })
    );
    expect(screen.getByRole("radio", { name: "Calendar" })).toBeChecked();
    expect(screen.getByRole("dialog", { name: /November 7/ })).toBeInTheDocument();
  });

  it("names a section closure by its section", () => {
    read.config = withRules(
      closure("patio", "2026-11-07", {
        targetKind: "tables",
        sectionId: "sec-patio",
        tableIds: ["t1"],
      } as Partial<DateRule>)
    );
    renderPage();
    expect(within(week()).getByText("Sat, Nov 7 · Patio closed")).toBeInTheDocument();
  });

  it("sends Plan holidays to Special dates", () => {
    // Noon on Mon Nov 23: Thanksgiving, undecided, falls in the week.
    vi.setSystemTime(new Date("2026-11-23T20:00:00Z"));
    read.config = withRules();
    renderPage();
    fireEvent.click(within(week()).getByRole("button", { name: "Plan holidays" }));
    expect(screen.getByRole("radio", { name: "Special dates" })).toBeChecked();
  });

  it("hands a holiday 7 days out to the calendar's nudge at 00:30 in an overnight service", () => {
    // 00:30 on Thu Nov 19 in Los Angeles, Dinner runs to 2:00 AM: the service date is Nov 18,
    // so Next 7 days is Nov 19 to 25 and Thanksgiving (Nov 26) is the nudge's.
    vi.setSystemTime(new Date("2026-11-19T08:30:00Z"));
    read.config = overnightDinner();
    renderPage("/availability?tab=calendar");
    expect(
      screen.getByText("Thanksgiving is Thu, Nov 26 and isn't planned yet.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next 7 days" })).not.toBeInTheDocument();
  });

  it("is not shown while the viewer's role is still being read", () => {
    team.value = undefined;
    team.isLoading = true;
    renderPage();
    expect(screen.queryByRole("region", { name: "Next 7 days" })).not.toBeInTheDocument();
  });
});
