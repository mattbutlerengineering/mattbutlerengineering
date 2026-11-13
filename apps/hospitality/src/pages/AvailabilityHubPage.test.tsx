import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";
import {
  TODAY,
  rule,
  seasonal,
  specialHours,
  venue,
} from "../components/availability/hub/hub-rows-test-helpers.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityHubPage } from "./AvailabilityHubPage.js";

const selected = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
// 10:00 AM in Los Angeles on the fixtures' today.
const NOW = vi.hoisted(() => new Date("2026-11-12T18:00:00Z"));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1", selectedVenue: selected }),
}));
vi.mock("../hooks/useNow.js", () => ({ useNow: () => NOW }));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [{ id: "sec-patio", name: "Patio" }] }),
}));
vi.mock("../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [] }),
}));
vi.mock("../components/availability/use-holidays.js", () => ({
  useHolidayCountry: () => null,
}));
// The Today line has its own tests and its own reads; the hub only places it.
vi.mock("../components/availability/TodayLine.js", () => ({
  TodayLine: ({ bannerShowsOnline }: { bannerShowsOnline: boolean }) => (
    <p data-testid="today-line" data-banner={String(bannerShowsOnline)} />
  ),
}));

const refresh = vi.fn();

const stateOf = (
  config: AvailabilityConfig,
  source: AvailabilityConfigState["source"] = "rows"
): AvailabilityConfigState => ({ config, version: 1, source }) as AvailabilityConfigState;

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: stateOf(venue()),
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh,
    offerUndo: vi.fn(),
    ...rest,
  };
}

function renderHub(scope: AvailabilityScope, url = "/availability") {
  const router = createMemoryRouter(
    [
      { path: "setup", element: <div>Setup Hub</div> },
      {
        path: "availability",
        element: <Outlet context={scope} />,
        children: [
          { index: true, element: <AvailabilityHubPage /> },
          { path: "calendar", element: <div>Today&apos;s page</div> },
        ],
      },
    ],
    { initialEntries: ["/setup", url], initialIndex: 1 }
  );
  render(
    <main>
      <RouterProvider router={router} />
    </main>
  );
  return router;
}

const address = (router: ReturnType<typeof renderHub>) =>
  `${router.state.location.pathname}${router.state.location.search}`;
const row = (n: number) => screen.getByTestId(`hub-row-${n}`);
const hrefOf = (link: HTMLElement) => link.getAttribute("href");

describe("AvailabilityHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selected.settings = {};
  });

  it("has one page heading, takes focus on it, and places the Today line without a banner", () => {
    renderHub(scopeOf());
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Availability");
    expect(headings[0]).toHaveFocus();
    // No pause banner on the hub, so the line itself says when online booking is paused.
    expect(screen.getByTestId("today-line")).toHaveAttribute("data-banner", "false");
  });

  it("renders a drawer route's drawer over the rows, and leaves focus inside it", () => {
    // As a drawer does: it takes focus in its own effect, which runs before the hub's.
    const Overlay = () => {
      const cancel = useRef<HTMLButtonElement>(null);
      useEffect(() => cancel.current?.focus(), []);
      return (
        <div role="dialog" aria-modal="true" aria-label="Booking rules">
          <button type="button" ref={cancel}>
            Cancel
          </button>
        </div>
      );
    };
    const router = createMemoryRouter(
      [
        {
          path: "availability",
          element: <Outlet context={scopeOf()} />,
          children: [
            {
              path: "booking-rules",
              element: (
                <AvailabilityHubPage>
                  <Overlay />
                </AvailabilityHubPage>
              ),
            },
          ],
        },
      ],
      { initialEntries: ["/availability/booking-rules"] }
    );
    render(
      <main>
        <RouterProvider router={router} />
      </main>
    );
    expect(screen.getByRole("dialog", { name: "Booking rules" })).toBeInTheDocument();
    expect(within(row(5)).getByText("Not set up yet")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // The heading takes focus on arrival only when nothing covers it.
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("lists the five rows in the order they win, under the line that says so", () => {
    renderHub(scopeOf());
    expect(screen.getByRole("heading", { level: 2, name: "Your rules" })).toBeInTheDocument();
    expect(screen.getByText("Later rules win on the dates they cover.")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Your rules" })).queryAllByRole(
      "heading",
      {
        level: 3,
      }
    );
    expect(rows.map((h) => h.textContent)).toEqual([
      "Regular hours",
      "Seasonal hours",
      "Special dates and holidays",
      "Closures and pauses",
      "Booking rules",
    ]);
  });

  it("gives a Manager one action per row, each named for its row, and a link per service", () => {
    renderHub(scopeOf());
    expect(hrefOf(within(row(1)).getByRole("link", { name: "Edit Regular hours" }))).toBe(
      "/availability/calendar?tab=schedules"
    );
    expect(hrefOf(within(row(2)).getByRole("link", { name: "Add Seasonal hours" }))).toBe(
      "/availability/calendar?tab=schedules&action=addSchedule"
    );
    expect(
      hrefOf(within(row(3)).getByRole("link", { name: "Edit Special dates and holidays" }))
    ).toBe("/availability/calendar?tab=special");
    expect(hrefOf(within(row(4)).getByRole("link", { name: "View Closures and pauses" }))).toBe(
      "/availability/calendar?tab=special"
    );
    expect(hrefOf(within(row(5)).getByRole("link", { name: "Edit Booking rules" }))).toBe(
      "/availability/booking-rules"
    );
    expect(within(row(1)).getByRole("link", { name: /^Dinner 5:00 PM–10:00 PM/ })).toBeVisible();
    for (const n of [1, 2, 3, 4, 5])
      expect(within(row(n)).getAllByRole("link").length).toBe(n === 1 ? 2 : 1);
    expect(hrefOf(screen.getByRole("link", { name: "Open calendar" }))).toBe(
      "/availability/calendar?tab=calendar"
    );
    expect(hrefOf(screen.getByRole("link", { name: "History" }))).toBe("/availability/history");
  });

  it("reads Edit on seasonal hours once a set exists", () => {
    const config = venue([], seasonal("summer", "Summer hours", { startsOn: "2027-06-01" }));
    renderHub(scopeOf({ state: stateOf(config) }));
    expect(within(row(2)).getByRole("link", { name: "Edit Seasonal hours" })).toBeVisible();
    expect(within(row(2)).getByText("Summer hours: from Jun 1, every day")).toBeVisible();
  });

  it("lists two lines that read the same, without a duplicate key", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = venue([rule("r-first"), rule("r-second")]);
    renderHub(scopeOf({ state: stateOf(config) }));
    expect(within(row(4)).getAllByText("Closed today")).toHaveLength(2);
    expect(errors.mock.calls.filter((call) => /same key/.test(String(call[0])))).toEqual([]);
    errors.mockRestore();
  });

  it("shows a Host no edit control: View on rows 3 and 4, and services as plain text", () => {
    renderHub(scopeOf({ isManager: false }));
    expect(screen.queryByRole("link", { name: /^(Edit|Add)/ })).not.toBeInTheDocument();
    expect(
      within(row(3)).getByRole("link", { name: "View Special dates and holidays" })
    ).toBeVisible();
    expect(within(row(4)).getByRole("link", { name: "View Closures and pauses" })).toBeVisible();
    for (const n of [1, 2, 5]) expect(within(row(n)).queryByRole("link")).not.toBeInTheDocument();
    expect(within(row(1)).getByText(/^Dinner 5:00 PM–10:00 PM/)).toBeVisible();
    // Reading is not editing: a Host still checks a date and opens the calendar and the history.
    expect(screen.getByRole("combobox", { name: "Check a date" })).toBeVisible();
    expect(screen.getByRole("link", { name: "History" })).toBeVisible();
  });

  describe("the date check", () => {
    const type = async (text: string) => {
      const user = userEvent.setup();
      await user.type(screen.getByRole("combobox", { name: "Check a date" }), `${text}{Enter}`);
    };

    it("answers a typed date in one sentence and marks the row that decided it", async () => {
      const config = venue([specialHours("r-special", "2026-12-24")]);
      renderHub(scopeOf({ state: stateOf(config) }));
      expect(screen.queryByText(/^decides/)).not.toBeInTheDocument();
      await type("12/24/2026");
      expect(screen.getByTestId("hub-date-answer")).toHaveTextContent(
        "Thu, Dec 24: Dinner 4:00 PM–8:00 PM. Decided by your special date, which wins over your regular hours."
      );
      expect(within(row(3)).getByText("decides Dec 24")).toBeVisible();
      expect(screen.getAllByText(/^decides/)).toHaveLength(1);
      // The calendar cannot open on a date yet (D5.3), so no link promises it will.
      expect(screen.queryByRole("link", { name: /Open this date/ })).not.toBeInTheDocument();
    });

    it("marks regular hours when nothing else covers the date", async () => {
      renderHub(scopeOf());
      await type("12/25/2026");
      expect(within(row(1)).getByText("decides Dec 25")).toBeVisible();
    });

    it("marks no row for a date no rule covers", async () => {
      renderHub(scopeOf());
      await type("12/24/2025");
      expect(screen.getByTestId("hub-date-answer")).toHaveTextContent(
        "Wed, Dec 24: closed. No hours cover this date."
      );
      expect(screen.queryByText(/^decides/)).not.toBeInTheDocument();
    });

    it("answers nothing for text that is no date, and leaves the problem to the field", async () => {
      renderHub(scopeOf());
      await type("12/24/2026");
      await userEvent.clear(screen.getByRole("combobox", { name: "Check a date" }));
      await type("next blue moon");
      expect(screen.getByTestId("hub-date-answer")).toBeEmptyDOMElement();
      expect(screen.queryByText(/^decides/)).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Check a date" })).toBeInvalid();
    });
  });

  describe("a venue with no hours", () => {
    const empty = () => stateOf(venue(), "empty");

    it("sends a Manager to regular hours with a replace", async () => {
      const router = renderHub(scopeOf({ state: empty() }));
      await waitFor(() => expect(address(router)).toBe("/availability/calendar?tab=schedules"));
      expect(router.state.historyAction).toBe("REPLACE");
    });

    it("carries the way back to Venue Setup", async () => {
      const router = renderHub(scopeOf({ state: empty() }), "/availability?from=setup");
      await waitFor(() =>
        expect(address(router)).toBe("/availability/calendar?tab=schedules&from=setup")
      );
    });

    it("keeps a Manager on a drawer route: the redirect waits until the drawer has closed", () => {
      const router = createMemoryRouter(
        [
          {
            path: "availability",
            element: <Outlet context={scopeOf({ state: empty() })} />,
            children: [
              {
                path: "booking-rules",
                element: (
                  <AvailabilityHubPage>
                    <div role="dialog" aria-label="Booking rules" />
                  </AvailabilityHubPage>
                ),
              },
              { path: "calendar", element: <div>Today&apos;s page</div> },
            ],
          },
        ],
        { initialEntries: ["/availability/booking-rules?from=setup"] }
      );
      render(
        <main>
          <RouterProvider router={router} />
        </main>
      );
      expect(address(router)).toBe("/availability/booking-rules?from=setup");
      expect(screen.getByRole("dialog", { name: "Booking rules" })).toBeInTheDocument();
      expect(screen.queryByText(/No hours are set yet/)).not.toBeInTheDocument();
    });

    it("tells a Host who sets the hours, and offers nothing to press", () => {
      const router = renderHub(scopeOf({ state: empty(), isManager: false }));
      expect(
        screen.getByText("No hours are set yet. A manager sets regular hours here.")
      ).toBeVisible();
      expect(address(router)).toBe("/availability");
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("waits for the role: no redirect and no Host sentence while it is pending", () => {
      const router = renderHub(scopeOf({ state: empty(), isManager: false, rolePending: true }));
      expect(address(router)).toBe("/availability");
      expect(screen.queryByText(/No hours are set yet/)).not.toBeInTheDocument();
      expect(screen.getByRole("status", { name: "Loading your rules" })).toBeInTheDocument();
    });
  });

  it("shows a loading state while the config loads, with no rows", () => {
    renderHub(scopeOf({ state: null, load: "loading" }));
    expect(screen.getByRole("status", { name: "Loading your rules" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    expect(screen.getByTestId("today-line")).toBeInTheDocument();
  });

  it("says when the config failed to load, with the reason and a retry, in place of the rows", async () => {
    renderHub(scopeOf({ state: null, load: "error", loadError: "The server did not answer." }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load availability");
    expect(alert).toHaveTextContent("The server did not answer.");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders no rows for hours nobody can read", () => {
    renderHub(scopeOf({ state: stateOf(venue(), "unreadable"), load: "error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your rules didn't load. Try again.");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("asks for a venue when none is selected", () => {
    renderHub(scopeOf({ venueId: null, state: null, load: "loading" }));
    expect(screen.getByText("Select a venue to see its availability.")).toBeVisible();
    expect(screen.queryByTestId("today-line")).not.toBeInTheDocument();
  });

  describe("the index's addresses", () => {
    it.each([
      ["/availability?tab=special", "/availability/calendar?tab=special"],
      ["/availability?tab=schedules&from=setup", "/availability/calendar?tab=schedules&from=setup"],
      [
        "/availability?action=addSchedule",
        "/availability/calendar?tab=schedules&action=addSchedule",
      ],
      // The hub opens no Close dialog yet, so a section's still opens on today's page.
      ["/availability?closeSection=sec-bar", "/availability/calendar?closeSection=sec-bar"],
    ])("sends the old address %s to %s with a replace", async (old, next) => {
      const router = renderHub(scopeOf(), old);
      await waitFor(() => expect(address(router)).toBe(next));
      expect(router.state.historyAction).toBe("REPLACE");
      expect(screen.getByText("Today's page")).toBeInTheDocument();
    });

    it.each(["/availability", "/availability?tab=nope&x=1", "/availability?close=tonight"])(
      "stays on the hub at %s",
      (url) => {
        const router = renderHub(scopeOf(), url);
        expect(address(router)).toBe(url);
        expect(screen.getByRole("heading", { level: 1, name: "Availability" })).toBeVisible();
      }
    );

    it("shows the way back to Venue Setup when the visit came from it", () => {
      const router = renderHub(scopeOf(), "/availability?from=setup");
      expect(address(router)).toBe("/availability?from=setup");
      expect(hrefOf(screen.getByRole("link", { name: "Venue Setup" }))).toBe("/setup");
    });
  });
});
