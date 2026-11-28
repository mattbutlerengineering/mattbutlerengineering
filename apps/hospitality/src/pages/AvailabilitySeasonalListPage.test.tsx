import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { fixtureConfig } from "../components/availability/resolved-day-fixtures.js";
import { AvailabilitySeasonalListPage } from "./AvailabilitySeasonalListPage.js";

const TODAY = "2026-10-25";

/** The regular week, Weeknight (Mon-Thu, in use) and Spare (used nowhere), all running every service. */
function threeSchedules(): AvailabilityConfig {
  const base = fixtureConfig();
  const rowsFor = (scheduleId: string) =>
    base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-${scheduleId}`, scheduleId }));
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      { id: "spare", name: "Spare", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [...base.scheduleServices, ...rowsFor("wk"), ...rowsFor("spare")],
    assignments: [
      ...base.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
  };
}

const stateOf = (config: AvailabilityConfig): AvailabilityConfigState => ({
  config,
  version: 7,
  source: "rows",
});

const offerUndo = vi.fn();
const refresh = vi.fn();

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: stateOf(threeSchedules()),
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh,
    offerUndo,
    openClose: vi.fn(),
    openPause: vi.fn(),
    ...rest,
  };
}

function renderPage(scope: AvailabilityScope, entry = "/availability/seasonal") {
  const routes = [
    {
      path: "availability",
      element: <Outlet context={scope} />,
      children: [
        { index: true, element: <div>Hub page</div> },
        { path: "seasonal", element: <AvailabilitySeasonalListPage /> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <main>
      <RouterProvider router={router} />
    </main>
  );
  return router;
}

const rowOf = (name: string) =>
  screen.getByRole("listitem", { name: (_, el) => el.textContent?.startsWith(name) ?? false });

describe("AvailabilitySeasonalListPage", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });
  afterEach(() => vi.clearAllMocks());

  it("is headed Seasonal hours, takes focus there, and links back to Availability", () => {
    renderPage(scopeOf());
    expect(screen.getByRole("heading", { level: 1, name: "Seasonal hours" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability"
    );
  });

  it("says where each set of hours is used, and lists no regular week", () => {
    renderPage(scopeOf());
    expect(within(rowOf("Weeknight")).getByText("Mon–Thu")).toBeInTheDocument();
    expect(within(rowOf("Spare")).getByText("Not used yet")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("points Edit and Duplicate at the address module, and Add at a new set", () => {
    renderPage(scopeOf());
    const weeknight = within(rowOf("Weeknight"));
    expect(weeknight.getByRole("link", { name: "Edit Weeknight" })).toHaveAttribute(
      "href",
      "/availability/seasonal/wk"
    );
    expect(weeknight.getByRole("link", { name: "Duplicate Weeknight" })).toHaveAttribute(
      "href",
      "/availability/seasonal/new?copy=wk"
    );
    expect(screen.getByRole("link", { name: "Add seasonal hours" })).toHaveAttribute(
      "href",
      "/availability/seasonal/new"
    );
  });

  it("disables Delete for hours in use, with the reason as visible text tied to the button", () => {
    renderPage(scopeOf());
    const weeknight = within(rowOf("Weeknight"));
    const del = weeknight.getByRole("button", { name: "Delete Weeknight" });
    expect(del).toBeDisabled();
    const reason = weeknight.getByText(/Can’t delete.*Mon–Thu/);
    expect(reason).toBeVisible();
    expect(del).toHaveAccessibleDescription(reason.textContent ?? "");
    expect(within(rowOf("Spare")).getByRole("button", { name: "Delete Spare" })).toBeEnabled();
    expect(within(rowOf("Spare")).queryByText(/Can’t delete/)).not.toBeInTheDocument();
  });

  it("words the reason as its own sentence when only Use seasonal hours rules use the hours", () => {
    const config = threeSchedules();
    renderPage(
      scopeOf({
        state: stateOf({
          ...config,
          dateRules: [
            ...config.dateRules,
            {
              id: "r-use-spare",
              kind: "use_schedule",
              targetKind: "venue",
              startsOn: "2026-11-02",
              endsOn: "2026-11-02",
              useScheduleId: "spare",
            },
          ],
        }),
      })
    );
    expect(
      within(rowOf("Spare")).getByText(
        "Can’t delete. Used by 1 Use seasonal hours rule. Change those dates first."
      )
    ).toBeVisible();
  });

  it("deletes unused hours after a confirmation and offers Undo", async () => {
    renderPage(scopeOf());
    fireEvent.click(screen.getByRole("button", { name: "Delete Spare" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" })
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0].body.changes).toEqual({
      upsert: {},
      remove: { schedules: ["spare"] },
    });
    await waitFor(() => expect(offerUndo).toHaveBeenCalledTimes(1));
  });

  it("shows the compare link when two sets of hours run one service", () => {
    renderPage(scopeOf());
    expect(screen.getByRole("link", { name: "Edit one service across all hours" })).toHaveAttribute(
      "href",
      "/availability/calendar?tab=schedules"
    );
  });

  it("shows the empty sentence and no compare link with regular hours only", () => {
    renderPage(scopeOf({ state: stateOf(fixtureConfig()) }));
    expect(
      screen.getByText("No seasonal hours. Add hours for a season or a period, such as summer.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /across all hours/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("keeps the way back to the Availability map on a visit from it", () => {
    renderPage(scopeOf(), "/availability/seasonal?from=setup");
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability?from=setup"
    );
  });

  it("shows a retry when the hours did not load", () => {
    renderPage(scopeOf({ state: null, load: "error", loadError: "Offline" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows skeleton rows while loading", () => {
    renderPage(scopeOf({ state: null, load: "loading" }));
    expect(screen.getByRole("status", { name: "Loading seasonal hours" })).toBeInTheDocument();
  });
});
