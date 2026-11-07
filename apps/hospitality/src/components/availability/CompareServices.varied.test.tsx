import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../../utils/demo-week.fixture.js";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CompareServices } from "./CompareServices.js";
import { SchedulesTab } from "./SchedulesTab.js";

/** The demo week plus a Manager's Weeknight, which runs Dinner on Mon–Thu with no day scope. */
function withWeeknight(): AvailabilityConfig {
  const dinner = DEMO_WEEK_CONFIG.scheduleServices.find((s) => s.id === "demo-ss-dinner")!;
  return {
    ...DEMO_WEEK_CONFIG,
    schedules: [
      ...DEMO_WEEK_CONFIG.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...DEMO_WEEK_CONFIG.scheduleServices,
      {
        ...dinner,
        id: "ss-dinner-wk",
        scheduleId: "wk",
        weekdays: [],
        dayHours: { version: 1, sets: [] },
        closesAt: 1320,
      },
    ],
    assignments: [
      ...DEMO_WEEK_CONFIG.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
  };
}

const state = (): AvailabilityConfigState => ({
  config: withWeeknight(),
  version: 7,
  source: "rows",
});
const common = {
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: "2026-10-25",
  onStale: vi.fn(),
};

function renderCompare(onEditSchedule = vi.fn()) {
  render(
    <ToastProvider>
      <main>
        <CompareServices {...common} state={state()} onEditSchedule={onEditSchedule} />
      </main>
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Service" }));
  fireEvent.click(screen.getByRole("option", { name: "Dinner" }));
  return onEditSchedule;
}

describe("Compare services on a varied week", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("marks a scoped row with its base hours and + different hours, and the link opens Edit schedule", () => {
    const onEditSchedule = renderCompare();
    const rows = screen.getAllByRole("listitem");
    const regular = rows.find((r) => within(r).queryByText("+ different hours"))!;
    expect(regular).toBeDefined();
    expect(rows.filter((r) => within(r).queryByText("+ different hours"))).toHaveLength(1);
    fireEvent.click(within(regular).getByRole("button", { name: "Edit schedule" }));
    expect(onEditSchedule).toHaveBeenCalledWith("demo-regular");
  });

  it("edits a scoped row's base hours and keeps its different hours", async () => {
    renderCompare();
    fireEvent.click(screen.getByRole("combobox", { name: "Regular week · Booking" }));
    fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save 1 schedule/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [row] = save.mock.calls[0]![0].body.changes.upsert.scheduleServices;
    expect(row.id).toBe("demo-ss-dinner");
    expect(row.weekdays).toEqual([2, 3, 4, 0]);
    expect(row.dayHours.sets).toHaveLength(1);
    expect(row.dayHours.sets[0].weekdays).toEqual([5, 6]);
  });

  it("the Schedules tab opens Edit schedule from the link", () => {
    render(
      <ToastProvider>
        <main>
          <SchedulesTab {...common} state={state()} />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare services" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Service" }));
    fireEvent.click(screen.getByRole("option", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    expect(screen.getByRole("dialog", { name: /Edit .*Regular week/ })).toBeInTheDocument();
  });
});
