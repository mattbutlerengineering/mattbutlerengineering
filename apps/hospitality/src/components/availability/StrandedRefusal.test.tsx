import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
// useVenueFormat reads the venue through useOptionalVenue: the times here are the venue's.
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };

const refusal = () =>
  Object.assign(new Error("refused"), {
    problemDetails: {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "x",
      code: "stranded-bookings",
      reservations: [
        {
          id: "res-okafor",
          // 6:30 PM on Oct 30 in Los Angeles.
          startTime: "2026-10-31T01:30:00.000Z",
          partySize: 4,
          reason: "outside_service",
          guestName: "Okafor",
          serviceDate: "2026-10-30",
        },
        {
          id: "res-nameless",
          // 12:15 AM on Oct 31, on Friday Oct 30's service day.
          startTime: "2026-10-31T07:15:00.000Z",
          partySize: 2,
          reason: "closed",
          serviceDate: "2026-10-30",
        },
      ],
    },
  });

function expectBookings(alert: HTMLElement) {
  // A long list read out whole would drown the refusal: only the sentence is in the live region.
  expect(within(alert).queryAllByRole("link")).toEqual([]);
  const first = screen.getByRole("link", { name: /Okafor/ });
  expect(first).toHaveTextContent("6:30 PM");
  expect(first).toHaveTextContent("party of 4");
  expect(first.getAttribute("href")).toMatch(/timeline\?date=2026-10-30&selected=res-okafor$/);
  // A new tab, so going to look at a booking does not throw away the draft that was refused.
  expect(first).toHaveAttribute("target", "_blank");
  const nameless = screen.getByRole("link", { name: /^Guest ·/ });
  expect(nameless).toHaveTextContent("12:15 AM");
  // Its service day, not the calendar date its start time falls on.
  expect(nameless.getAttribute("href")).toMatch(/date=2026-10-30&selected=res-nameless$/);
}

describe("a refusal for stranded bookings (ux.md S4, S7)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockRejectedValue(refusal());
  });

  it("lists each booking with a link from a schedule save", async () => {
    render(
      <ToastProvider>
        <main>
          <ScheduleEditorDrawer
            venueId="venue-1"
            state={state}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-25"
            mode="edit"
            sourceScheduleId="regular"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 upcoming bookings would fall outside the new hours.");
    expectBookings(alert);
  });

  it("lists each booking with a link from the day editor", async () => {
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayEditor
            venueId="venue-1"
            date={FIXTURE_DATE}
            day={resolveFixtureDay()}
            state={state}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            onDirtyChange={vi.fn()}
            onCancel={vi.fn()}
            onFinished={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expectBookings(alert);
  });

  it("drops the list when the next save goes through a different refusal", async () => {
    render(
      <ToastProvider>
        <main>
          <ScheduleEditorDrawer
            venueId="venue-1"
            state={state}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-25"
            mode="edit"
            sourceScheduleId="regular"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("link", { name: /Okafor/ });
    save.mockRejectedValue(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("link", { name: /Okafor/ })).not.toBeInTheDocument()
    );
  });
});
