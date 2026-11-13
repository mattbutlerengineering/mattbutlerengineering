import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MemoryRouter, useLocation } from "react-router";
import type {
  AvailabilityConfig,
  DateRule,
  FloorPlan,
  FloorPlanSection,
  Table,
  VenueSettings,
} from "@mbe/types";
import type { VenueReadiness } from "../hooks/useVenueReadiness.js";

interface Read<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
}

const reads = vi.hoisted(() => ({
  config: undefined as unknown as Read<{ config: AvailabilityConfig; version: number }>,
  plans: undefined as unknown as Read<FloorPlan[]>,
  sections: undefined as unknown as Read<FloorPlanSection[]>,
  tables: undefined as unknown as Read<Table[]>,
}));
const viewer = vi.hoisted(() => ({ isManager: true }));
const readiness = vi.hoisted(() => ({ value: undefined as unknown as VenueReadiness }));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1",
  selectedVenue: {
    id: "venue-1",
    name: "Bistro 42",
    ianaTimezone: "America/Chicago",
    currencyCode: "USD",
    settings: null as VenueSettings | null,
  },
}));

vi.mock("../hooks/useAvailability.js", () => ({ useAvailabilityConfig: () => reads.config }));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useFloorPlans: () => reads.plans,
  useVenueFloorPlanSections: () => reads.sections,
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => reads.tables }));
vi.mock("../hooks/useIsManager.js", () => ({ useIsManager: () => viewer.isManager }));
vi.mock("../hooks/useVenueReadiness.js", () => ({ useVenueReadiness: () => readiness.value }));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../hooks/useNow.js", () => ({ useNow: () => new Date("2026-11-07T18:00:00Z") }));
vi.mock("../components/availability/BookingRulesDrawer.js", () => ({
  BookingRulesDrawer: ({ onClose }: { onClose: () => void }) => (
    <section aria-label="Booking rules editor">
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </section>
  ),
}));
// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

import { SetupPage } from "./SetupPage.js";

const HOURS = {
  opensAt: 690,
  lastSeatingAt: 810,
  closesAt: 870,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const],
  dayHours: { version: 1 as const, sets: [] },
};

const EMPTY: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const WEEK: AvailabilityConfig = {
  ...EMPTY,
  schedules: [{ id: "sch-reg", name: "Regular week", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-reg",
      venueServiceId: "vs-lunch",
      ...HOURS,
      weekdays: [2, 3, 4, 5],
    },
    {
      id: "ss-2",
      scheduleId: "sch-reg",
      venueServiceId: "vs-dinner",
      ...HOURS,
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      weekdays: [2, 3, 4, 5, 6],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-reg", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
};

const plan: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main floor",
  isActive: true,
  layoutJson: { width: 800, height: 600 } as FloorPlan["layoutJson"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const section = (id: string, name: string, displayOrder: number): FloorPlanSection => ({
  id,
  venueId: "venue-1",
  floorPlanId: "fp-1",
  name,
  color: "#fff",
  displayOrder,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
const table = (id: string, name: string, sectionId: string | null): Table =>
  ({
    id,
    name,
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "fp-1",
    sectionId,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }) as Table;

function read<T>(data: T | undefined, extra: Partial<Read<T>> = {}): Read<T> {
  return { data, isLoading: false, error: null, refetch: vi.fn(), ...extra };
}

function setConfig(config: AvailabilityConfig) {
  reads.config = read({ config, version: 1 });
}
function setSit(floorPlans: FloorPlan[], sections: FloorPlanSection[], tables: Table[]) {
  reads.plans = read(floorPlans);
  reads.sections = read(sections);
  reads.tables = read(tables);
}

function Where() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/setup"]}>
      <SetupPage />
      <Where />
    </MemoryRouter>
  );
}

const OPERATIONAL: VenueReadiness = {
  status: "operational",
  completedSteps: ["onboarding", "operating-hours", "floor-plan"],
  nextStep: null,
  progress: 100,
};
const EMPTY_SETUP: VenueReadiness = {
  status: "setup",
  completedSteps: ["onboarding"],
  nextStep: "operating-hours",
  progress: 33,
};

beforeEach(() => {
  viewer.isManager = true;
  readiness.value = OPERATIONAL;
  venue.selectedVenue.settings = null;
  setConfig(EMPTY);
  setSit([], [], []);
});

describe("Venue Setup: an empty venue", () => {
  it("is one page with the two groups, whatever the venue's readiness", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "When you're open" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Where guests sit" })).toBeInTheDocument();
    expect(screen.getByText("Bistro 42")).toBeInTheDocument();
  });

  it("marks each resource type 'Not set up' and says what it is", () => {
    renderPage();
    const week = screen.getByRole("listitem", { name: /Regular week/ });
    expect(within(week).getByText("Not set up")).toBeInTheDocument();
    expect(within(week).getByText("The days and services guests can book.")).toBeInTheDocument();
    const special = screen.getByRole("listitem", { name: /Special dates/ });
    expect(within(special).getByText("Not set up")).toBeInTheDocument();
    expect(within(special).getByText(/Closures and special hours/)).toBeInTheDocument();
    const booking = screen.getByRole("listitem", { name: /^Booking/ });
    expect(within(booking).getByText("Not set up")).toBeInTheDocument();
    expect(within(booking).getByText(/How far ahead, how much notice/)).toBeInTheDocument();
    const floor = screen.getByRole("listitem", { name: /Floor plan/ });
    expect(within(floor).getByText("Not set up")).toBeInTheDocument();
    expect(within(floor).getByText(/Where tables sit/)).toBeInTheDocument();
    expect(
      screen.getByText("Sections and tables appear here once you add a floor plan")
    ).toBeInTheDocument();
  });

  it("offers each node's one editor, and nothing is disabled", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Set up regular week" }));
    // The hub, which sends a Manager on to the first-setup card when no hours are set.
    expect(screen.getByLabelText("location")).toHaveTextContent("/availability?from=setup");
  });

  it("opens the floor plan list from Add floor plan", async () => {
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add floor plan" }));
    expect(screen.getByLabelText("location")).toHaveTextContent("/floor-plans");
  });

  it("opens Booking rules in place", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Booking rules…" }));
    expect(screen.getByRole("region", { name: "Booking rules editor" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByRole("region", { name: "Booking rules editor" })).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderPage();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});

describe("Venue Setup: schedules and services", () => {
  it("shows the schedule level for a one-schedule venue, with its services and days", () => {
    setConfig(WEEK);
    renderPage();
    const schedules = screen.getByRole("listitem", { name: /Schedules/ });
    expect(within(schedules).getByText("1 schedule")).toBeInTheDocument();
    const week = within(schedules).getByRole("listitem", { name: /Regular week/ });
    expect(within(week).getByText("Schedule")).toBeInTheDocument();
    const lunch = within(week).getByRole("listitem", { name: /Lunch/ });
    expect(within(lunch).getByText("Service")).toBeInTheDocument();
    expect(within(lunch).getByText(/11:30 AM/)).toBeInTheDocument();
    expect(within(week).getByRole("listitem", { name: /Dinner/ })).toBeInTheDocument();
  });

  it("updates the node when the config changes after an editor saves", () => {
    const view = renderPage();
    expect(screen.getByRole("button", { name: "Set up regular week" })).toBeInTheDocument();
    setConfig(WEEK);
    view.rerender(
      <MemoryRouter initialEntries={["/setup"]}>
        <SetupPage />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: "Set up regular week" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change regular week…" })).toBeInTheDocument();
    expect(screen.getByText("1 schedule")).toBeInTheDocument();
  });

  it("links Change regular week and Add a schedule… to the Schedules layer", async () => {
    setConfig(WEEK);
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Change regular week…" }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/availability/calendar?tab=schedules&from=setup"
    );
  });

  it("sends Add a schedule… to the seeded editor on the Schedules layer", async () => {
    setConfig(WEEK);
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add a schedule…" }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/availability/calendar?tab=schedules&action=addSchedule&from=setup"
    );
  });
});

describe("Venue Setup: special dates", () => {
  const rules: DateRule[] = [
    {
      id: "r1",
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    } as DateRule,
    {
      id: "r2",
      kind: "closure",
      targetKind: "service",
      venueServiceId: "vs-dinner",
      startsOn: "2026-12-31",
      endsOn: "2026-12-31",
    } as DateRule,
    {
      id: "r3",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2027-01-01",
      endsOn: "2027-01-01",
    } as DateRule,
  ];

  it("lists upcoming dates with their target, a section by name", () => {
    setConfig({ ...WEEK, dateRules: rules });
    setSit([plan], [section("sec-bar", "Bar", 0)], [table("t1", "B1", "sec-bar")]);
    renderPage();
    const special = screen.getByRole("listitem", { name: /Special dates/ });
    expect(within(special).getByText("3 upcoming")).toBeInTheDocument();
    expect(within(special).getByText(/Dec 24.*Bar closed/)).toBeInTheDocument();
    expect(within(special).getByText(/Dec 31.*Dinner closed/)).toBeInTheDocument();
    expect(within(special).getByText(/Jan 1.*Whole venue closed/)).toBeInTheDocument();
  });

  it("opens the calendar and the Special dates tab", async () => {
    setConfig({ ...WEEK, dateRules: rules });
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open Special dates" }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/availability/calendar?tab=special&from=setup"
    );
  });
});

describe("Venue Setup: booking", () => {
  it("shows the venue's booking rules after the editor saves them", () => {
    const view = renderPage();
    expect(
      within(screen.getByRole("listitem", { name: /^Booking/ })).getByText("Not set up")
    ).toBeInTheDocument();
    venue.selectedVenue.settings = {
      maxAdvanceBooking: 60,
      minAdvanceBooking: 2,
      maxPartySize: 8,
    } as VenueSettings;
    view.rerender(
      <MemoryRouter initialEntries={["/setup"]}>
        <SetupPage />
      </MemoryRouter>
    );
    const booking = screen.getByRole("listitem", { name: /^Booking/ });
    expect(within(booking).getByText(/60 days ahead/)).toBeInTheDocument();
    expect(within(booking).getByText(/2 hours notice/)).toBeInTheDocument();
    expect(within(booking).getByText(/parties up to 8 online/)).toBeInTheDocument();
  });

  it("counts closures per booking channel", () => {
    setConfig({
      ...WEEK,
      dateRules: [
        {
          id: "c1",
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          startsOn: "2026-12-01",
          endsOn: "2026-12-01",
        } as DateRule,
      ],
    });
    renderPage();
    const booking = screen.getByRole("listitem", { name: /^Booking/ });
    expect(within(booking).getByText("Online booking")).toBeInTheDocument();
    expect(within(booking).getByText("closed on 1 upcoming date")).toBeInTheDocument();
  });
});

describe("Venue Setup: floor plan, sections and tables", () => {
  beforeEach(() => {
    setSit(
      [plan],
      [section("sec-bar", "Bar", 0), section("sec-main", "Main Dining", 1)],
      [
        table("t1", "B1", "sec-bar"),
        table("t2", "B2", "sec-bar"),
        table("t3", "M1", "sec-main"),
        table("t4", "Loose", null),
      ]
    );
  });

  it("shows the floor plan's counts and its sections", () => {
    renderPage();
    const floor = screen.getByRole("listitem", { name: /Main floor/ });
    expect(within(floor).getByText("2 sections · 4 tables")).toBeInTheDocument();
    const bar = within(floor).getByRole("listitem", { name: /Bar/ });
    expect(within(bar).getByText("Section")).toBeInTheDocument();
    expect(within(bar).getByText("2 tables")).toBeInTheDocument();
    expect(within(floor).getByRole("listitem", { name: /No section/ })).toBeInTheDocument();
  });

  it("starts with tables collapsed and opens them from the section's disclosure", async () => {
    renderPage();
    const toggle = screen.getByRole("button", { name: /^Bar/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("B1")).not.toBeInTheDocument();
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("B1")).toBeInTheDocument();
    expect(screen.getByLabelText("location")).toHaveTextContent("/setup");
  });

  it("offers Close for a date… on a section and Move to a section on No section", async () => {
    renderPage();
    const user = userEvent.setup();
    expect(screen.getAllByRole("button", { name: /^Close for a date…/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Close for a date… Bar" }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/availability/calendar?closeSection=sec-bar&from=setup"
    );
  });

  it("sends No section's Move to a section to the floor plan", async () => {
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "Move to a section" }));
    expect(screen.getByLabelText("location")).toHaveTextContent("/floor-plans/fp-1");
  });

  it("opens the floor plan and adds another", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open floor plan Main floor" }));
    expect(screen.getByLabelText("location")).toHaveTextContent("/floor-plans/fp-1");
  });
});

describe("Venue Setup: loading and per-group errors", () => {
  it("shows skeletons and no actions while a group loads", () => {
    reads.config = read<{ config: AvailabilityConfig; version: number }>(undefined, {
      isLoading: true,
    });
    renderPage();
    const group = screen.getByRole("region", { name: "When you're open" });
    expect(within(group).getByRole("status")).toBeInTheDocument();
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add floor plan" })).toBeInTheDocument();
  });

  it("fails only the failing group, with its error text and a Retry that re-reads it", async () => {
    const error = new TypeError("Failed to fetch");
    reads.plans = read<FloorPlan[]>(undefined, { error });
    renderPage();
    const sit = screen.getByRole("region", { name: "Where guests sit" });
    const alert = within(sit).getByRole("alert");
    expect(alert).toHaveTextContent(/connection/i);
    expect(screen.getByRole("button", { name: "Set up regular week" })).toBeInTheDocument();
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Retry" }));
    expect(reads.plans.refetch).toHaveBeenCalled();
    expect(reads.config.refetch).not.toHaveBeenCalled();
  });

  it("falls back to one ErrorRetryBanner when both groups fail", async () => {
    reads.config = read<{ config: AvailabilityConfig; version: number }>(undefined, {
      error: new TypeError("Failed to fetch"),
    });
    reads.tables = read<Table[]>(undefined, { error: new TypeError("Failed to fetch") });
    renderPage();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "When you're open" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(reads.config.refetch).toHaveBeenCalled();
    expect(reads.tables.refetch).toHaveBeenCalled();
  });
});

describe("Venue Setup: the Setup progress strip", () => {
  it("shows a Manager the launch steps before launch, with the first unset one primary", () => {
    readiness.value = EMPTY_SETUP;
    renderPage();
    const strip = screen.getByRole("region", { name: "Venue Setup progress" });
    expect(within(strip).getByText("1 of 3")).toBeInTheDocument();
    expect(within(strip).getByText("Venue basics").closest("li")).toHaveTextContent("Done");
    expect(within(strip).getByText("Regular week").closest("li")).toHaveTextContent("Next");
    expect(within(strip).getByText("Floor plan").closest("li")).toHaveTextContent("Not yet");
    expect(screen.getByRole("button", { name: "Set up regular week" })).toHaveAttribute(
      "data-primary",
      "true"
    );
  });

  it("is not shown once the venue is operational", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "Venue Setup progress" })).not.toBeInTheDocument();
  });
});

describe("Venue Setup: the Host variant", () => {
  beforeEach(() => {
    viewer.isManager = false;
    readiness.value = EMPTY_SETUP;
  });

  it("shows no editor, save or set-up call to action", () => {
    setConfig({ ...WEEK, dateRules: [] });
    setSit(
      [plan],
      [section("sec-bar", "Bar", 0)],
      [table("t1", "B1", "sec-bar"), table("t2", "L", null)]
    );
    renderPage();
    const names = screen.queryAllByRole("button").map((b) => b.textContent);
    expect(names.join(" ")).not.toMatch(/set up|edit|change|close|add|move|rules|compare|open/i);
    expect(screen.queryByRole("region", { name: "Venue Setup progress" })).not.toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("says an unset node is for a manager to set up", () => {
    renderPage();
    const week = screen.getByRole("listitem", { name: /Regular week/ });
    expect(within(week).getByText("Not set up")).toBeInTheDocument();
    expect(within(week).getByText("A manager sets this up.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up regular week" })).not.toBeInTheDocument();
  });
});
