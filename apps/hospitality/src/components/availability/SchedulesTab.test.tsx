import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx); here it never answers.
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
const venueSettings = vi.hoisted(() => ({
  value: undefined as Record<string, unknown> | undefined,
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: {
      id: "venue-1",
      ianaTimezone: "America/Los_Angeles",
      currencyCode: "USD",
      settings: venueSettings.value,
    },
  }),
}));
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

import { CompareServices } from "./CompareServices.js";
import type { ScheduleEditorTarget } from "./SchedulesTab.js";
import { SchedulesLayer } from "./schedules-tab.harness.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

/** The regular week (Fridays), Weeknight (Mon-Thu, in use) and Spare (used nowhere). */
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

const state = (): AvailabilityConfigState => ({
  config: threeSchedules(),
  version: 7,
  source: "rows",
});

function renderWith(node: React.ReactNode) {
  return render(
    <ToastProvider>
      <main>{node}</main>
    </ToastProvider>
  );
}

const common = {
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: "2026-10-25",
  onStale: vi.fn(),
};

function Layer(props: {
  readonly venueId?: string;
  readonly state: AvailabilityConfigState;
  readonly comparing?: boolean;
  readonly onEditorChange?: (editor: ScheduleEditorTarget) => void;
}) {
  return <SchedulesLayer {...common} {...props} />;
}

// At file level: the suites may run in any order, and rialto's Select scrolls in both.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("SchedulesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
    venueSettings.value = undefined;
  });

  it("heads the layer Regular week and lists only the other schedules under Other schedules", () => {
    renderWith(<Layer state={state()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Regular week" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Other schedules" })).toBeInTheDocument();
    // Weeknight and Spare are rows; the regular week ("Weekend") is the panel above, not a row.
    const other = screen.getByRole("region", { name: "Other schedules" });
    expect(within(other).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Mon–Thu")).toBeInTheDocument();
    expect(screen.getByText("Not used yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Weekend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicate Weekend" })).not.toBeInTheDocument();
  });

  it("has no Other schedules group when the regular week is the only schedule", () => {
    const only = state();
    const config = { ...only.config, schedules: only.config.schedules.filter((s) => s.isRegular) };
    renderWith(<Layer state={{ ...only, config }} />);
    expect(screen.queryByRole("heading", { name: "Other schedules" })).not.toBeInTheDocument();
  });

  it("opens the seeded add flow from Add a schedule…, and names no 'New schedule' button", () => {
    const onEditorChange = vi.fn();
    renderWith(<Layer state={state()} onEditorChange={onEditorChange} />);
    expect(screen.queryByRole("button", { name: "New schedule" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a schedule…" }));
    expect(onEditorChange).toHaveBeenCalledWith({ mode: "new", seed: "regular" });
  });

  it("says in one line what the layer is, and has no Booking line: the hub's row 5 holds the rules", () => {
    venueSettings.value = { maxAdvanceBooking: 30, minAdvanceBooking: 1, maxPartySize: 12 };
    renderWith(<Layer state={state()} />);
    expect(
      screen.getByText(
        "Your usual week. Other schedules and special dates change it on the days they cover."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Booking: / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Up to 30 days ahead/)).not.toBeInTheDocument();
  });

  it("opens Compare services only when the page says so", () => {
    const { unmount } = renderWith(<Layer state={state()} />);
    expect(screen.queryByRole("heading", { name: "Compare services" })).not.toBeInTheDocument();
    unmount();
    renderWith(<Layer state={state()} comparing />);
    expect(screen.getByRole("heading", { level: 2, name: "Compare services" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "Compare services" })).not.toBeInTheDocument();
  });

  it("does not carry a settling save over to another venue's week form", async () => {
    const { rerender } = renderWith(<Layer state={state()} />);
    const toggleMonday = () =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Days" })).getByRole("checkbox", {
          name: "Monday",
        })
      );
    toggleMonday();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
    // Saved on venue 1 (version 8), not yet refreshed; the Manager switches to venue 2 at version 3.
    rerender(
      <ToastProvider>
        <main>
          <Layer venueId="venue-2" state={{ ...state(), version: 3 }} />
        </main>
      </ToastProvider>
    );
    toggleMonday();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("Starting later… leaves no id shared by the panel's form and the drawer's, so both are labelled", () => {
    renderWith(<Layer state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Starting later…" }));
    const drawer = screen.getByRole("dialog", { name: "Change regular week" });
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(within(drawer).getAllByRole("textbox", { name: /Service name/ }).length).toBeGreaterThan(
      0
    );
    // The panel's own fields keep their names too (a service opens from its line).
    const panelBody = within(screen.getByTestId("week-panel"));
    fireEvent.click(panelBody.getAllByRole("button", { name: /^[^,]+, / })[0] as HTMLElement);
    expect(panelBody.getAllByRole("textbox", { name: /Service name/ }).length).toBeGreaterThan(0);
  });

  it("Starting later… opens Change regular week with Starting empty", () => {
    renderWith(<Layer state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Starting later…" }));
    expect(screen.getByRole("dialog", { name: "Change regular week" })).toBeInTheDocument();
  });

  it("shows short actions and keeps the schedule's name in what is spoken (#7980)", () => {
    renderWith(<Layer state={state()} />);
    expect(screen.getByRole("button", { name: "Edit Weeknight" })).toHaveTextContent(/^Edit$/);
    expect(screen.getByRole("button", { name: "Duplicate Weeknight" })).toHaveTextContent(
      /^Duplicate$/
    );
    expect(screen.getByRole("button", { name: "Delete Spare" })).toHaveTextContent(/^Delete$/);
  });

  it("offers delete only where nothing uses the schedule", () => {
    renderWith(<Layer state={state()} />);
    expect(screen.getByRole("button", { name: "Delete Weeknight" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Spare" })).toBeEnabled();
    // The regular week is never deletable.
    expect(screen.queryByRole("button", { name: "Delete Weekend" })).not.toBeInTheDocument();
  });

  it("deletes an unused schedule after a confirmation", async () => {
    renderWith(<Layer state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Spare" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      venueId: "venue-1",
      body: { expectedVersion: 7, changes: { remove: { schedules: ["spare"] } } },
    });
  });

  it("starts a duplicate named as a copy", () => {
    renderWith(<Layer state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Weeknight" }));
    expect(screen.getByRole("textbox", { name: /Schedule name/ })).toHaveValue("Weeknight (copy)");
  });
});

describe("CompareServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("ties why Save is off to the button, so a screen reader hears it there (#7979)", () => {
    renderWith(<CompareServices {...common} state={state()} />);
    const save = screen.getByRole("button", { name: /^Save 0 schedules$/ });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Change a row to save.");
  });

  it("saves every selected schedule in one change with one impact line", async () => {
    renderWith(<CompareServices {...common} state={state()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Weekend" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Weeknight" }));
    fireEvent.click(screen.getByRole("button", { name: "Set selected to…" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Booking" }));
    fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 2 selected" }));

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Changes 2 schedules · \d+ future dates$/
    );

    fireEvent.click(screen.getByRole("button", { name: "Save 2 schedules" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const body = save.mock.calls[0]?.[0].body;
    expect(body.expectedVersion).toBe(7);
    expect(body.changes.upsert.scheduleServices).toHaveLength(2);
    expect(
      body.changes.upsert.scheduleServices.every(
        (s: { bookingTypes: string[] }) => s.bookingTypes.join() === "phone"
      )
    ).toBe(true);
  });

  it("does not offer a save until something changed", () => {
    renderWith(<CompareServices {...common} state={state()} />);
    expect(screen.getByRole("button", { name: "Save 0 schedules" })).toBeDisabled();
  });
});
