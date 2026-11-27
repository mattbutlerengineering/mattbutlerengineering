import { useEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";

vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
const save = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
  useAvailabilityConfig: () => ({ data: null, error: null }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { fixtureConfig } from "../components/availability/resolved-day-fixtures.js";
import { AvailabilitySeasonalEditorPage } from "./AvailabilitySeasonalEditorPage.js";

const TODAY = "2026-10-25";

/** The regular week (Fridays) plus Weeknight (Mon-Thu), which also runs Dinner. */
function twoSchedules(): AvailabilityConfig {
  const base = fixtureConfig();
  // Weeknight runs both services, as the e2e's does: the regular week's rows, copied.
  const copies = base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-wk`, scheduleId: "wk" }));
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [...base.scheduleServices, ...copies],
    assignments: [
      ...base.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
  };
}

const refresh = vi.fn();
const offerUndo = vi.fn();

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: { config: twoSchedules(), version: 7, source: "rows" },
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

/** What the layout does: hands its children the latest scope, which a test can replace. */
let replaceScope: (next: AvailabilityScope) => void = () => {};
function ScopeOutlet({ initial }: { readonly initial: AvailabilityScope }) {
  const [scope, setScope] = useState(initial);
  useEffect(() => {
    replaceScope = setScope;
  }, []);
  return <Outlet context={scope} />;
}

function renderPage(entry: string, scope: AvailabilityScope = scopeOf()) {
  const routes = [
    {
      path: "availability",
      element: <ScopeOutlet initial={scope} />,
      children: [
        { index: true, element: <div>Hub page</div> },
        { path: "seasonal", element: <div>Seasonal list</div> },
        { path: "seasonal/new", element: <AvailabilitySeasonalEditorPage /> },
        { path: "seasonal/:scheduleId", element: <AvailabilitySeasonalEditorPage /> },
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

const nameField = () => screen.getByRole("textbox", { name: /Schedule name/ });

/** Lunch is the open service (3:00 PM close): close it at 4:00 PM, clear of Dinner at 5:00 PM. */
function closeLunchLater() {
  fireEvent.click(screen.getByLabelText("Closes"));
  fireEvent.click(screen.getByRole("option", { name: "4:00 PM" }));
}

describe("AvailabilitySeasonalEditorPage", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("opens a new set headed New seasonal hours, with typed dates and a Save that waits for a change", () => {
    renderPage("/availability/seasonal/new");
    expect(screen.getByRole("heading", { level: 1, name: "New seasonal hours" })).toHaveFocus();
    expect(nameField()).toHaveValue("");
    expect(screen.getByLabelText("Starting")).toBeInTheDocument();
    expect(screen.getByLabelText("Ending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to seasonal hours" })).toHaveAttribute(
      "href",
      "/availability/seasonal"
    );
  });

  it("starts as a copy of the set ?copy= names, with no days of its own", () => {
    renderPage("/availability/seasonal/new?copy=wk");
    expect(
      screen.getByRole("heading", { level: 1, name: "Duplicate seasonal hours" })
    ).toBeVisible();
    expect(nameField()).toHaveValue("Weeknight (copy)");
  });

  it("falls back to a new set when ?copy= names nothing", () => {
    renderPage("/availability/seasonal/new?copy=gone");
    expect(screen.getByRole("heading", { level: 1, name: "New seasonal hours" })).toBeVisible();
  });

  it("edits the set :scheduleId names, with no date fields", () => {
    renderPage("/availability/seasonal/wk");
    expect(screen.getByRole("heading", { level: 1, name: "Edit Weeknight" })).toBeVisible();
    expect(nameField()).toHaveValue("Weeknight");
    expect(screen.queryByLabelText("Starting")).not.toBeInTheDocument();
  });

  it("says so when the set is not there, and offers the way back", () => {
    renderPage("/availability/seasonal/nope");
    expect(screen.getByText(/no longer there/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to seasonal hours" })).toBeVisible();
  });

  it("does not open the regular week as seasonal hours", () => {
    renderPage("/availability/seasonal/regular");
    expect(screen.getByText(/no longer there/)).toBeVisible();
  });

  it("offers Also apply to under a changed service, saves it and goes back to the list", async () => {
    renderPage("/availability/seasonal/wk");
    expect(screen.queryByRole("group", { name: /Also apply to/ })).not.toBeInTheDocument();
    closeLunchLater();
    const group = screen.getByRole("group", { name: "Also apply to Lunch in:" });
    fireEvent.click(within(group).getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const body = save.mock.calls[0]![0].body as {
      expectedVersion: number;
      changes: AvailabilityConfigChanges;
    };
    expect(body.expectedVersion).toBe(7);
    await waitFor(() => expect(screen.getByText("Seasonal list")).toBeVisible());
  });

  it("keeps the draft and asks first when the Manager leaves with a change", async () => {
    renderPage("/availability/seasonal/wk");
    fireEvent.change(nameField(), { target: { value: "Weeknights" } });
    fireEvent.click(screen.getByRole("link", { name: "Back to seasonal hours" }));
    expect(
      await screen.findByRole("heading", { name: "Discard your changes?" })
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("leaves without asking when nothing changed", async () => {
    renderPage("/availability/seasonal/wk");
    fireEvent.click(screen.getByRole("link", { name: "Back to seasonal hours" }));
    await waitFor(() => expect(screen.getByText("Seasonal list")).toBeVisible());
  });
  it("stays open when the set is deleted mid-edit, and the conflict review says so", async () => {
    save.mockRejectedValue(
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
    renderPage("/availability/seasonal/wk");
    fireEvent.change(nameField(), { target: { value: "Weeknights" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    // The reload that follows the 409 finds Weeknight gone.
    const config = twoSchedules();
    act(() =>
      replaceScope(
        scopeOf({
          state: {
            config: {
              ...config,
              schedules: config.schedules.filter((s) => s.id !== "wk"),
              scheduleServices: config.scheduleServices.filter((s) => s.scheduleId !== "wk"),
              assignments: config.assignments.filter((a) => a.scheduleId !== "wk"),
            },
            version: 8,
            source: "rows",
          },
        })
      )
    );
    expect(screen.queryByText(/no longer there/)).not.toBeInTheDocument();
    expect(nameField()).toHaveValue("Weeknights");
    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    expect(await screen.findByText(/This schedule was deleted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reapply my changes" })).toBeDisabled();
    // Start over is the way out: it leaves for the list with nothing left to save.
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(screen.getByText("Seasonal list")).toBeInTheDocument());
  });
});
