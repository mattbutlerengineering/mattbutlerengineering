import { useSyncExternalStore } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
  useAvailabilityConfig: () => ({ data: undefined, error: null }),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
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

import { takeHubReturnRow } from "../components/availability/hub-return-focus.js";
import { OPENED_FROM_HUB } from "../components/availability/opened-from-hub.js";
import {
  demoDraft,
  draftService,
  EVERY_DAY,
} from "../components/availability/quick-setup-demo.fixture.js";
import { draftToConfig } from "../components/availability/quick-setup-draft.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityHoursPage } from "./AvailabilityHoursPage.js";

const TODAY = "2026-10-25"; // a Sunday

function demoConfig(): AvailabilityConfig {
  let n = 0;
  return draftToConfig(demoDraft(), () => `demo-${++n}`);
}

const stateOf = (config: AvailabilityConfig, version = 7): AvailabilityConfigState => ({
  config,
  version,
  source: "rows",
});

const EMPTY: AvailabilityConfigState = {
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  version: 0,
  source: "empty",
};

const offerUndo = vi.fn();

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: stateOf(demoConfig()),
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh: vi.fn(),
    offerUndo,
    ...rest,
  };
}

type Entry = string | { pathname: string; search?: string; state?: unknown };

function renderPage(scope: AvailabilityScope, entry: Entry = "/availability/hours") {
  // The layout's scope, as a store the test can move (a refetch landing).
  const store = { scope, listeners: new Set<() => void>() };
  const Layout = () => {
    const current = useSyncExternalStore(
      (listener) => {
        store.listeners.add(listener);
        return () => store.listeners.delete(listener);
      },
      () => store.scope
    );
    return <Outlet context={current} />;
  };
  const routes = [
    { path: "setup", element: <div>Venue Setup page</div> },
    {
      path: "availability",
      element: <Layout />,
      children: [
        { index: true, element: <div>Hub page</div> },
        { path: "hours", element: <AvailabilityHoursPage /> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: ["/availability", entry],
    initialIndex: 1,
  });
  render(
    <main>
      <RouterProvider router={router} />
    </main>
  );
  const update = (next: Partial<AvailabilityScope>) => {
    store.scope = { ...store.scope, ...next };
    store.listeners.forEach((listener) => listener());
  };
  return { router, update };
}

const line = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}, `) });
const lunchMonday = () => {
  if (line("Lunch").getAttribute("aria-expanded") === "false") fireEvent.click(line("Lunch"));
  return within(screen.getByRole("group", { name: "Lunch runs on" })).getByRole("checkbox", {
    name: "Monday",
  });
};
const saveButton = () =>
  within(screen.getByTestId("editor-save-bar")).getByRole("button", { name: /^Save/ });

describe("AvailabilityHoursPage", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
    takeHubReturnRow();
  });
  afterEach(() => {
    takeHubReturnRow();
  });

  it("is headed Regular hours, takes focus there, and links back to Availability", () => {
    renderPage(scopeOf());
    const heading = screen.getByRole("heading", { level: 1, name: "Regular hours" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability"
    );
    expect(screen.queryByRole("link", { name: "Venue Setup" })).not.toBeInTheDocument();
  });

  it("keeps the way back to Venue Setup on a visit from it", () => {
    renderPage(scopeOf(), "/availability/hours?from=setup");
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability?from=setup"
    );
    expect(screen.getByRole("link", { name: "Venue Setup" })).toHaveAttribute("href", "/setup");
  });

  it("opens the first service when no service is named", () => {
    renderPage(scopeOf());
    expect(line("Lunch")).toHaveAttribute("aria-expanded", "true");
    expect(line("Dinner")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the service ?service= names", () => {
    const config = demoConfig();
    const dinner = config.venueServices.find((s) => s.name === "Dinner")!;
    renderPage(scopeOf({ state: stateOf(config) }), `/availability/hours?service=${dinner.id}`);
    expect(line("Dinner")).toHaveAttribute("aria-expanded", "true");
    expect(line("Lunch")).toHaveAttribute("aria-expanded", "false");
  });

  it("starts today, and a later start is an edit that the Save label states", () => {
    renderPage(scopeOf());
    expect(screen.getByLabelText("Starting")).toHaveValue(TODAY);
    expect(
      screen.getByText("Applies to every date these hours cover, starting today.")
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
    expect(
      screen.getByText("Applies to every date these hours cover, starting Mon, Nov 2.")
    ).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent("Save from Nov 2");
    expect(saveButton()).toBeEnabled();
  });

  it("puts Save within 6 Tab presses of the open service's closing time", async () => {
    // Walkthrough 10's venue: Dinner every day, on the shared days, beside Lunch on weekdays.
    let n = 0;
    const config = draftToConfig(
      {
        days: EVERY_DAY,
        services: [
          draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"], { days: [1, 2, 3, 4, 5] }),
          draftService("dinner", "Dinner", ["17:00", "21:00", "22:00"]),
        ],
      },
      () => `two-${++n}`
    );
    const dinner = config.venueServices.find((s) => s.name === "Dinner")!;
    const user = userEvent.setup();
    renderPage(scopeOf({ state: stateOf(config) }), `/availability/hours?service=${dinner.id}`);
    fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
    screen.getByRole("combobox", { name: "Closes" }).focus();
    let presses = 0;
    while (document.activeElement !== saveButton() && presses < 20) {
      await user.tab();
      presses += 1;
    }
    expect(presses).toBeLessThanOrEqual(6);
  });

  it("saves, offers Undo, and returns to the hub on row 1 once the saved hours have loaded", async () => {
    const { router, update } = renderPage(scopeOf(), {
      pathname: "/availability/hours",
      state: OPENED_FROM_HUB,
    });
    fireEvent.click(lunchMonday());
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(offerUndo).toHaveBeenCalledWith("Regular week changed from Oct 25", {
      version: 8,
      changeId: "chg",
    });
    // Not before the saved version is on hand: the hub would show the hours from before.
    expect(router.state.location.pathname).toBe("/availability/hours");
    act(() => update({ state: stateOf(demoConfig(), 8) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/availability"));
    // Opened from the hub, Back is the way: no second hub entry.
    expect(router.state.historyAction).toBe("POP");
    expect(takeHubReturnRow()).toBe("hub-row-1");
  });

  it("opens the one conflict dialog, with Overwrite off, when a colleague saved first", async () => {
    save.mockRejectedValueOnce(
      Object.assign(new Error("conflict"), {
        problemDetails: {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "x",
          code: "version-conflict",
        },
      })
    );
    const refresh = vi.fn();
    const { router, update } = renderPage(scopeOf({ refresh }));
    fireEvent.click(lunchMonday());
    fireEvent.click(saveButton());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    act(() => update({ state: stateOf(demoConfig(), 8) }));
    const dialog = await screen.findByRole("dialog", {
      name: "Someone changed availability first",
    });
    expect(within(dialog).getByRole("button", { name: "Overwrite" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Review their change" })).toBeEnabled();
    expect(offerUndo).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/availability/hours");
  });

  it("walkthrough 1: weekend Brunch beside every-day Lunch, the overlap fixed in one press", async () => {
    let n = 0;
    const config = draftToConfig(
      {
        days: EVERY_DAY,
        services: [
          draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"]),
          draftService("dinner", "Dinner", ["17:00", "21:30", "23:00"]),
        ],
      },
      () => `w1-${++n}`
    );
    renderPage(scopeOf({ state: stateOf(config) }));
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    fireEvent.click(screen.getByRole("button", { name: "Brunch" }));
    // Lunch is open too: its overlap with Brunch holds it open. Brunch's row is the last.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Different days for this service" }).at(-1)!
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Weekends" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Run Lunch on weekdays only" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { venueServices } = save.mock.calls[0]![0].body.changes.upsert;
    expect(venueServices.map((s: { name: string }) => s.name)).toEqual(["Brunch"]);
  });

  it("walkthrough 5: Dinner seats every 30 minutes, phone only", async () => {
    let n = 0;
    const config = draftToConfig(
      {
        days: EVERY_DAY,
        services: [
          draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"]),
          draftService("dinner", "Dinner", ["17:00", "21:30", "23:00"]),
        ],
      },
      () => `w5-${++n}`
    );
    const dinner = config.venueServices.find((s) => s.name === "Dinner")!;
    renderPage(scopeOf({ state: stateOf(config) }), `/availability/hours?service=${dinner.id}`);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Seat every" }));
    fireEvent.click(screen.getByRole("option", { name: "30 min" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Booked by" }));
    fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const rows = save.mock.calls[0]![0].body.changes.upsert.scheduleServices.filter(
      (row: { venueServiceId: string }) => row.venueServiceId === dinner.id
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.seating).toEqual({ version: 1, interval: 30 });
      expect(row.bookingTypes).toEqual(["phone"]);
    }
  });

  it("asks before leaving with unsaved changes", async () => {
    const { router } = renderPage(scopeOf());
    fireEvent.click(lunchMonday());
    fireEvent.click(screen.getByRole("link", { name: "Back to Availability" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard your changes?" });
    expect(router.state.location.pathname).toBe("/availability/hours");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(lunchMonday()).not.toBeChecked();
  });

  it("shows first setup on a venue with no hours, and returns to the hub once saved", async () => {
    const { router, update } = renderPage(scopeOf({ state: EMPTY }));
    expect(screen.getByRole("button", { name: "Save and open bookings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    await waitFor(() => expect(offerUndo).toHaveBeenCalledTimes(1));
    act(() => update({ state: stateOf(demoConfig(), 8) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/availability"));
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("says when the hours failed to load, with a retry", () => {
    const refresh = vi.fn();
    renderPage(scopeOf({ state: null, load: "error", loadError: "Network down", refresh }));
    expect(screen.getByText("Network down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a loading state while the hours load", () => {
    renderPage(scopeOf({ state: null, load: "loading" }));
    expect(screen.getByRole("status", { name: "Loading regular hours" })).toBeInTheDocument();
  });
});
