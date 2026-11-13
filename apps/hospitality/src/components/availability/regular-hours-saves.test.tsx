import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

/**
 * What a regular-hours save writes (availability-hub E4.4). These were first pinned against the
 * editors that wrote regular hours before the Regular hours page existed (the week panel on the
 * Schedules tab, the Change regular week drawer and the first-run card), and the snapshots were
 * then left untouched when the drivers below moved to the page: the page writes what they wrote.
 */

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
  useAvailabilityConfig: () => ({ data: undefined, error: null }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import type { AvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { AvailabilityHoursPage } from "../../pages/AvailabilityHoursPage.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";

const TODAY = "2026-10-25"; // a Sunday
const LATER = "2026-11-02"; // a Monday

const stateOf = (config: AvailabilityConfig): AvailabilityConfigState => ({
  config,
  version: 7,
  source: "rows",
});

/** The PRD demo week as stored: lunch Mon–Fri, dinner Tue–Sun (later Fri–Sat), brunch Sat–Sun. */
function demoConfig(): AvailabilityConfig {
  let n = 0;
  return draftToConfig(demoDraft(), () => `demo-${++n}`);
}

/** The demo week, already changed to start on a later date: an upcoming regular-hours change. */
function upcomingConfig(): AvailabilityConfig {
  const config = demoConfig();
  return {
    ...config,
    assignments: config.assignments.map((a) => ({ ...a, startsOn: LATER })),
  };
}

const EMPTY: AvailabilityConfigState = {
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  } as unknown as AvailabilityConfig,
  version: 0,
  source: "empty",
};

/**
 * Generated ids are numbered in the order the body first names them, so a driver that draws more
 * ids for its own rows (a re-render, a second draft) writes the same body.
 */
function normalized(value: unknown): unknown {
  const names = new Map<string, string>();
  const json = JSON.stringify(value).replace(/uuid-\d+/g, (id) => {
    if (!names.has(id)) names.set(id, `id-${names.size + 1}`);
    return names.get(id)!;
  });
  return JSON.parse(json);
}

async function sent(): Promise<unknown> {
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  return normalized(save.mock.calls[0]![0]);
}

const lunchMonday = () => {
  const line = screen.queryByRole("button", { name: /^Lunch, / });
  if (line?.getAttribute("aria-expanded") === "false") fireEvent.click(line);
  return within(screen.getByRole("group", { name: "Lunch runs on" })).getByRole("checkbox", {
    name: "Monday",
  });
};

const pressSave = () => fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

// Drivers: how each outcome is reached. Only these change when the editor does.

/** Regular hours at its address, under a layout that provides the scope. */
function renderPage(state: AvailabilityConfigState) {
  const scope: AvailabilityScope = {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state,
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh: vi.fn(),
    offerUndo: vi.fn(),
    openClose: vi.fn(),
    openPause: vi.fn(),
  };
  const router = createMemoryRouter(
    [
      {
        path: "availability",
        element: <Outlet context={scope} />,
        children: [
          { index: true, element: <div>Hub</div> },
          { path: "hours", element: <AvailabilityHoursPage /> },
        ],
      },
    ],
    { initialEntries: ["/availability/hours"] }
  );
  render(
    <main>
      <RouterProvider router={router} />
    </main>
  );
}

function editFromToday(config: AvailabilityConfig) {
  renderPage(stateOf(config));
  fireEvent.click(lunchMonday());
  pressSave();
}

function editStartingLater(config: AvailabilityConfig, startsOn: string, edit: boolean) {
  renderPage(stateOf(config));
  fireEvent.change(screen.getByLabelText("Starting"), { target: { value: startsOn } });
  if (edit) fireEvent.click(lunchMonday());
  pressSave();
}

function firstSetup() {
  renderPage(EMPTY);
  fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
  fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
  const dinner = screen.getAllByRole("button", { name: "Dinner" });
  fireEvent.click(dinner[dinner.length - 1]!);
  fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
}

describe("what a regular-hours save writes", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
    let n = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `uuid-${++n}` as `${string}-${string}-${string}-${string}-${string}`
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a new week from today supersedes the regular week in force", async () => {
    editFromToday(demoConfig());
    expect(await sent()).toMatchSnapshot();
  });

  it("a change starting later ends the regular week the day before", async () => {
    editStartingLater(demoConfig(), LATER, true);
    expect(await sent()).toMatchSnapshot();
  });

  it("the same week starting later is still a change", async () => {
    editStartingLater(demoConfig(), LATER, false);
    expect(await sent()).toMatchSnapshot();
  });

  it("a week from today drops an upcoming change that had not started", async () => {
    editFromToday(upcomingConfig());
    expect(await sent()).toMatchSnapshot();
  });

  it("first setup writes the first regular week", async () => {
    firstSetup();
    expect(await sent()).toMatchSnapshot();
  });
});
