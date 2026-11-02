import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

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
import { fixtureConfig } from "./resolved-day-fixtures.js";

/** Two schedules run Lunch (the first service Compare opens on): Weekend and Weeknight. */
const atV5: AvailabilityConfigState = (() => {
  const config = fixtureConfig();
  return {
    version: 5,
    source: "rows",
    config: {
      ...config,
      schedules: [
        ...config.schedules,
        { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      ],
      scheduleServices: [
        ...config.scheduleServices,
        ...config.scheduleServices.map((r) => ({ ...r, id: `${r.id}-wk`, scheduleId: "wk" })),
      ],
    },
  };
})();

/** A colleague moves Weekend Lunch's last seating, making v6. */
const atV6: AvailabilityConfigState = {
  ...atV5,
  version: 6,
  config: {
    ...atV5.config,
    scheduleServices: atV5.config.scheduleServices.map((r) =>
      r.id === "ss-lunch" ? { ...r, lastSeatingAt: 810 } : r
    ),
  },
};

const common = {
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: "2026-10-25",
  onStale: vi.fn(),
};

const conflict = Object.assign(new Error("409"), {
  problemDetails: {
    type: "about:blank",
    title: "Conflict",
    status: 409,
    detail: "version moved",
    code: "version-conflict",
  },
});

function ui(state: AvailabilityConfigState) {
  return (
    <ToastProvider>
      <main>
        <CompareServices {...common} state={state} />
      </main>
    </ToastProvider>
  );
}

function editWeekendBooking() {
  fireEvent.click(screen.getByRole("combobox", { name: "Weekend · Booking" }));
  fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("CompareServices against a colleague's change to the same row (#7999)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 7, changeId: "chg" });
  });

  it("saves against the version the edits were made on, not the refetched one", async () => {
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const body = save.mock.calls[0]?.[0].body;
    expect(body.expectedVersion).toBe(5);
    expect(body.changes.upsert.scheduleServices[0].lastSeatingAt).toBe(840);
  });

  it("after the refused save, names the colleague's change and keeps it when reapplying", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    expect(await screen.findByText("Someone changed these schedules first")).toBeInTheDocument();
    expect(screen.getByText("Hours changed: Weekend")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 1 schedule" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const body = save.mock.calls[1]?.[0].body;
    expect(body.expectedVersion).toBe(6);
    const row = body.changes.upsert.scheduleServices[0];
    expect(row.lastSeatingAt).toBe(810);
    expect(row.bookingTypes).toEqual(["phone"]);
  });

  it("drops the edits on Discard and shows the latest rows", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
    await screen.findByText("Someone changed these schedules first");

    fireEvent.click(screen.getByRole("button", { name: "Discard my changes" }));
    expect(screen.getByRole("button", { name: "Save 0 schedules" })).toBeDisabled();
    expect(screen.queryByText("Someone changed these schedules first")).not.toBeInTheDocument();
  });
});
