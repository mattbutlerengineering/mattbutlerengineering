import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CompareServices } from "./CompareServices.js";
import { SchedulesTab } from "./SchedulesTab.js";
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

describe("SchedulesTab", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("lists each schedule with where it applies and marks the regular week", () => {
    renderWith(<SchedulesTab {...common} state={state()} />);
    expect(screen.getByText("Regular week")).toBeInTheDocument();
    expect(screen.getByText("Mon–Thu")).toBeInTheDocument();
    expect(screen.getByText("Not used yet")).toBeInTheDocument();
  });

  it("offers delete only where nothing uses the schedule", () => {
    renderWith(<SchedulesTab {...common} state={state()} />);
    expect(screen.getByRole("button", { name: "Delete Weeknight" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Spare" })).toBeEnabled();
    // The regular week is never deletable.
    expect(screen.queryByRole("button", { name: "Delete Weekend" })).not.toBeInTheDocument();
  });

  it("deletes an unused schedule after a confirmation", async () => {
    renderWith(<SchedulesTab {...common} state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Spare" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      venueId: "venue-1",
      body: { expectedVersion: 7, changes: { remove: { schedules: ["spare"] } } },
    });
  });

  it("starts a duplicate named as a copy", () => {
    renderWith(<SchedulesTab {...common} state={state()} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Weeknight" }));
    expect(screen.getByRole("textbox", { name: /Schedule name/ })).toHaveValue("Weeknight (copy)");
  });
});

describe("CompareServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
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
