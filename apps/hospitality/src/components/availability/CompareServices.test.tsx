import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ScheduleService } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  // Venues named "hold-…" record their saves the way the real hook does (use-reload-hold.ts), so a
  // test can leave the config behind its own save; every other venue calls the mock directly.
  useSaveAvailabilityConfig: () => ({
    isPending: false,
    mutateAsync: async (variables: { venueId: string }) => {
      if (!variables.venueId.startsWith("hold-")) return save(variables);
      const { trackOwnSave } = await import("./use-reload-hold.js");
      return trackOwnSave(variables.venueId, () => save(variables));
    },
  }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx); here it never answers.
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
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

/** A third schedule runs Lunch too, so Compare still lists it after one row goes. */
const threeSchedules: AvailabilityConfigState = {
  ...atV5,
  config: {
    ...atV5.config,
    schedules: [
      ...atV5.config.schedules,
      { id: "x3", name: "Third", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...atV5.config.scheduleServices,
      ...fixtureConfig().scheduleServices.map((r) => ({
        ...r,
        id: `${r.id}-x3`,
        scheduleId: "x3",
      })),
    ],
  },
};

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
  serviceDate: "2026-10-25",
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

function ui(state: AvailabilityConfigState, venueId = common.venueId) {
  return (
    <ToastProvider>
      <main>
        <CompareServices {...common} venueId={venueId} state={state} />
      </main>
    </ToastProvider>
  );
}

function editBooking(schedule: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: `${schedule} · Booking` }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}
const editWeekendBooking = () => editBooking("Weekend", "Phone only");
/** The Select closes with an exit animation; the next edit waits for it. */
const listClosed = () => waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));

/** The fixture state with `change` applied to the rows, at `version`. */
const withRows = (
  version: number,
  change: (row: ScheduleService) => ScheduleService,
  from: AvailabilityConfigState = atV5
): AvailabilityConfigState => ({
  ...from,
  version,
  config: { ...from.config, scheduleServices: from.config.scheduleServices.map(change) },
});

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

  describe("after the Manager's own save, until the refetch lands (#8081)", () => {
    const phoneOnly = (state: AvailabilityConfigState) => {
      const sent = save.mock.calls[0]?.[0].body.changes.upsert.scheduleServices[0];
      return withRows(6, (r) => (r.id === sent.id ? sent : r), state);
    };
    async function saveOwn(venue: string) {
      save.mockResolvedValueOnce({ version: 6, changeId: "chg-own" });
      const utils = render(ui(atV5, venue));
      editWeekendBooking();
      fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      await listClosed();
      return utils;
    }

    it("holds editing, so a second edit cannot be built on rows older than its pin", async () => {
      await saveOwn("hold-a");
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Weekend · Booking" })).toHaveAttribute(
          "aria-disabled",
          "true"
        )
      );
      expect(screen.getByRole("combobox", { name: "Weeknight · Booking" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
      expect(screen.getByText("Edit once the newest hours have loaded.")).toBeInTheDocument();
      // The preview's own actions (Retry, party, dates, stranded paging) wait with the editing.
      expect(screen.queryByText("Guest preview")).not.toBeInTheDocument();
    });

    it("shows the preview again once the hold ends and a row is edited", async () => {
      const venue = "hold-h";
      const { rerender } = await saveOwn(venue);
      rerender(ui(phoneOnly(atV5), venue));
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Weekend · Booking" })).not.toHaveAttribute(
          "aria-disabled"
        )
      );
      expect(screen.queryByText("Guest preview")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Weekend · Last seating"));
      fireEvent.click(await screen.findByRole("option", { name: "1:45 PM" }));
      expect(await screen.findByText("Guest preview")).toBeInTheDocument();
    });

    it("keeps the time pickers shut during the hold, even from their clock icon", async () => {
      await saveOwn("hold-g");
      await waitFor(() =>
        expect(screen.getByText("Edit once the newest hours have loaded.")).toBeInTheDocument()
      );
      const field = screen.getByLabelText("Weekend · Last seating");
      const icon = field.parentElement?.querySelector("svg");
      expect(icon).toBeTruthy();
      fireEvent.click(icon as Element);
      // Any time list would hold "1:45 PM"; the Selects' options never do.
      expect(screen.queryByRole("option", { name: "1:45 PM" })).toBeNull();
      expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
    });

    it("lets the next edit start from the refetched rows, keeping the first save's change", async () => {
      const venue = "hold-b";
      const { rerender } = await saveOwn(venue);
      save.mockResolvedValueOnce({ version: 7, changeId: "chg-2" });
      rerender(ui(phoneOnly(atV5), venue));
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Weekend · Booking" })).not.toHaveAttribute(
          "aria-disabled"
        )
      );
      fireEvent.click(screen.getByLabelText("Weekend · Last seating"));
      fireEvent.click(await screen.findByRole("option", { name: "1:45 PM" }));
      // The time list takes close to a second to leave the DOM (its exit animation), and nothing
      // below reads it, so this does not wait for it.
      fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      const body = save.mock.calls[1]?.[0].body;
      expect(body.expectedVersion).toBe(6);
      expect(body.changes.upsert.scheduleServices[0].lastSeatingAt).toBe(825);
      expect(body.changes.upsert.scheduleServices[0].bookingTypes).toEqual(
        save.mock.calls[0]?.[0].body.changes.upsert.scheduleServices[0].bookingTypes
      );
    });

    it("offers a reload when the refetch never lands, so the hold cannot last forever", async () => {
      const onStale = vi.fn();
      save.mockResolvedValueOnce({ version: 6, changeId: "chg-own" });
      render(
        <ToastProvider>
          <main>
            <CompareServices {...common} onStale={onStale} venueId="hold-c" state={atV5} />
          </main>
        </ToastProvider>
      );
      editWeekendBooking();
      fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
      const reload = await screen.findByRole("button", { name: "Reload hours" }, { timeout: 4000 });
      fireEvent.click(reload);
      expect(onStale).toHaveBeenCalled();
    });

    it("does not hold another venue for a version the first venue reached", async () => {
      save.mockResolvedValueOnce({ version: 100, changeId: "chg-a" });
      const { rerender } = render(ui({ ...atV5, version: 99 }, "hold-d"));
      editWeekendBooking();
      fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      await listClosed();
      rerender(ui(atV5, "hold-f"));
      editWeekendBooking();
      fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(5);
    });
  });

  it("after the refused save, names the colleague's change and keeps it when reapplying", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    expect(screen.getByText("Hours changed: Weekend")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const body = save.mock.calls[1]?.[0].body;
    expect(body.expectedVersion).toBe(6);
    const row = body.changes.upsert.scheduleServices[0];
    expect(row.lastSeatingAt).toBe(810);
    expect(row.bookingTypes).toEqual(["phone"]);
  });

  it("does not restore a value a colleague undid on a row edited after the first edit", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editBooking("Weekend", "Phone only");
    await listClosed();
    // A colleague moves Weeknight's last seating (v6); the Manager edits Weeknight on top of it.
    rerender(ui(withRows(6, (r) => (r.id === "ss-lunch-wk" ? { ...r, lastSeatingAt: 810 } : r))));
    editBooking("Weeknight", "Online only");
    await listClosed();
    // ...and the colleague undoes it (v7).
    rerender(ui({ ...atV5, version: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Save 2 schedules" }));

    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    expect(save.mock.calls[0]?.[0].body.expectedVersion).toBe(5);
    expect(screen.getByText("Hours changed: Weeknight")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 2 schedules" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const body = save.mock.calls[1]?.[0].body;
    expect(body.expectedVersion).toBe(7);
    const weeknight = body.changes.upsert.scheduleServices.find(
      (r: ScheduleService) => r.id === "ss-lunch-wk"
    );
    expect(weeknight.lastSeatingAt).toBe(840);
    expect(weeknight.bookingTypes).toEqual(["online"]);
  });

  it("Discard mine drops the edits and closes the dialog, with nothing left to review", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    fireEvent.click(await screen.findByRole("button", { name: "Discard mine" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Someone changed availability first" })
      ).toBeNull()
    );
    expect(screen.getByRole("button", { name: "Save 0 schedules" })).toBeDisabled();
    expect(screen.queryByText("Loading the latest version…")).not.toBeInTheDocument();
  });

  it("keeps Overwrite off: a press sends nothing", async () => {
    save.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        problemDetails: { ...conflict.problemDetails, currentVersion: 6 },
      })
    );
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    const overwrite = await screen.findByRole("button", { name: "Overwrite" });
    expect(overwrite).toBeDisabled();
    expect(overwrite).toHaveAccessibleDescription(
      "Overwrite isn’t offered for these hours. Review their change to put your changes on top, or go back to your draft."
    );
    fireEvent.click(overwrite);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("Back to my draft keeps the edits, and the next save meets the conflict afresh", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));

    fireEvent.click(await screen.findByRole("button", { name: "Back to my draft" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Someone changed availability first" })
      ).toBeNull()
    );
    save.mockRejectedValueOnce(conflict);
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(5);
    expect(
      await screen.findByRole("dialog", { name: "Someone changed availability first" })
    ).toBeInTheDocument();
  });

  it("names an edited row whose schedule a colleague archived", async () => {
    const archived: AvailabilityConfigState = {
      ...threeSchedules,
      version: 6,
      config: {
        ...threeSchedules.config,
        schedules: threeSchedules.config.schedules.map((s) =>
          s.id === "wk" ? { ...s, archivedAt: "2026-10-31T12:00:00Z" } : s
        ),
      },
    };
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(threeSchedules));
    editBooking("Weekend", "Phone only");
    await listClosed();
    editBooking("Weeknight", "Online only");
    await listClosed();
    rerender(ui(archived));
    fireEvent.click(screen.getByRole("button", { name: /^Save \d+ schedule/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    expect(screen.getByText("Removed: Weeknight")).toBeInTheDocument();
  });

  it("names an edited row a colleague removed instead of dropping it silently", async () => {
    const three = threeSchedules;
    const gone: AvailabilityConfigState = {
      ...three,
      version: 6,
      config: {
        ...three.config,
        scheduleServices: three.config.scheduleServices.filter((r) => r.id !== "ss-lunch"),
      },
    };
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(three));
    editBooking("Weekend", "Phone only");
    await listClosed();
    editBooking("Weeknight", "Online only");
    await listClosed();
    rerender(ui(gone));
    fireEvent.click(screen.getByRole("button", { name: /^Save \d+ schedule/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    expect(screen.getByText("Removed: Weekend")).toBeInTheDocument();
  });

  it("keeps the view on the service being edited when a colleague reorders services", async () => {
    const reordered: AvailabilityConfigState = {
      ...atV5,
      version: 6,
      config: {
        ...atV5.config,
        venueServices: atV5.config.venueServices.map((v) => ({
          ...v,
          position: v.name === "Dinner" ? -1 : v.position,
        })),
      },
    };
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    await listClosed();
    rerender(ui(reordered));

    expect(screen.getByRole("combobox", { name: "Service" })).toHaveTextContent("Lunch");
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const rows = save.mock.calls[0]?.[0].body.changes.upsert.scheduleServices;
    expect(rows.map((r: ScheduleService) => r.id)).toEqual(["ss-lunch"]);
  });

  it("drops the edits on Start over and shows the latest rows", async () => {
    save.mockRejectedValueOnce(conflict);
    const { rerender } = render(ui(atV5));
    editWeekendBooking();
    rerender(ui(atV6));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 schedule" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("button", { name: "Save 0 schedules" })).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Someone changed availability first" })
      ).toBeNull()
    );
  });
});
