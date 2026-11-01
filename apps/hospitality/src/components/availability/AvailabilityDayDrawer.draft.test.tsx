import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/** Drawer behaviour around an open editor: refresh errors, waiting actions, selections. */
describe("AvailabilityDayDrawer around a draft", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const state: AvailabilityConfigState = {
    config: fixtureConfig(),
    version: 4,
    source: "rows",
  };

  interface Extra {
    readonly error?: string | null;
    readonly fixedDates?: readonly string[];
    readonly hoursDiffer?: boolean;
    readonly onStale?: () => void;
    readonly date?: string;
    readonly rules?: DateRule[];
    readonly today?: string;
    readonly version?: number;
    readonly venueId?: string;
  }

  function drawer(extra: Extra = {}) {
    const rules = extra.rules ?? [];
    const loaded = { ...state, version: extra.version ?? state.version };
    return (
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={extra.date ?? FIXTURE_DATE}
            day={resolveFixtureDay(...rules)}
            isLoading={false}
            error={extra.error ?? null}
            viewerRole="manager"
            onClose={vi.fn()}
            editing={{
              venueId: extra.venueId ?? "venue-1",
              state: rules.length > 0 ? { ...loaded, config: fixtureConfig(...rules) } : loaded,
              timezone: FIXTURE_TIMEZONE,
              today: extra.today ?? "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished: vi.fn(),
              onCloseDay: vi.fn(),
              onStale: extra.onStale,
              fixedDates: extra.fixedDates,
              hoursDiffer: extra.hoursDiffer,
            }}
          />
        </main>
      </ToastProvider>
    );
  }

  it("keeps an open draft, with the error above it, when a refetch of the config fails", () => {
    const { rerender } = render(drawer());
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    rerender(drawer({ error: "Network down" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
  });

  it("offers Retry on the refresh error, which reloads the config", () => {
    const onStale = vi.fn();
    render(drawer({ error: "Network down", onStale }));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("describes the selection, and offers no single-date actions, for several dates", () => {
    render(drawer({ fixedDates: [FIXTURE_DATE, "2026-11-02", "2026-11-03"] }));
    const dialog = screen.getByRole("dialog", { name: "3 dates selected" });
    expect(within(dialog).queryByRole("button", { name: "Close…" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Copy to other days…" })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^Open for/)).not.toBeInTheDocument();
  });

  it("says when the selected dates have different hours, and which date the rows are from", () => {
    render(drawer({ fixedDates: [FIXTURE_DATE, "2026-11-02"], hoursDiffer: true }));
    const dialog = screen.getByRole("dialog", { name: "2 dates selected" });
    expect(dialog).toHaveTextContent(
      "These dates have different hours. The rows below are from Friday, October 30."
    );
  });

  it("makes no claim about how many dates a save writes; the Save button counts them", () => {
    render(drawer({ fixedDates: [FIXTURE_DATE, "2026-11-02"], hoursDiffer: true }));
    expect(screen.getByRole("dialog", { name: "2 dates selected" })).not.toHaveTextContent(
      "Saving replaces"
    );
  });

  it("says nothing about differing hours when the selected dates agree", () => {
    render(drawer({ fixedDates: [FIXTURE_DATE, "2026-11-02"], hoursDiffer: false }));
    expect(screen.queryByText(/different hours/)).not.toBeInTheDocument();
  });

  describe("an editor that is open but has no change yet", () => {
    function openCleanEditor() {
      const view = render(drawer());
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      return view;
    }

    it("makes Copy wait, reachable and described by the reason, and does not open it", () => {
      openCleanEditor();
      const copy = screen.getByRole("button", { name: "Copy to other days…" });
      expect(copy).toHaveAttribute("aria-disabled", "true");
      expect(copy).not.toBeDisabled();
      const reason = screen.getByText("Save or discard your changes to this day first.");
      expect(copy).toHaveAttribute("aria-describedby", reason.id);
      fireEvent.click(copy);
      expect(
        screen.queryByRole("dialog", { name: /Copy .* to other days/ })
      ).not.toBeInTheDocument();
    });

    it("announces the reason politely", () => {
      openCleanEditor();
      const reason = screen.getByText("Save or discard your changes to this day first.");
      expect(reason.closest("[aria-live='polite']")).not.toBeNull();
    });

    it("frees Copy again once the editor is gone", () => {
      const view = openCleanEditor();
      view.unmount();
      render(drawer());
      expect(screen.getByRole("button", { name: "Copy to other days…" })).not.toHaveAttribute(
        "aria-disabled"
      );
    });
  });

  describe("the schedule nudge", () => {
    const FRIDAYS = ["2026-10-02", "2026-10-09", "2026-10-16"].map((date, i): DateRule => ({
      ...EARLY_DINNER,
      id: `own-${i}`,
      startsOn: date,
      endsOn: date,
    }));

    it("waits for an open editor too, with the same reason", () => {
      render(drawer({ rules: FRIDAYS, date: "2026-10-30" }));
      expect(screen.getByRole("button", { name: /^Make a Friday schedule/ })).not.toHaveAttribute(
        "aria-disabled"
      );
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      const make = screen.getByRole("button", { name: /^Make a Friday schedule/ });
      expect(make).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(make);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("after the Manager's own save, until the reload brings its version", () => {
    const WAIT = "Edit once the newest hours have loaded.";

    async function copyToFriday() {
      save.mockResolvedValueOnce({ version: 5, changeId: "chg-1" });
      fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
      const dialog = screen.getByRole("dialog", { name: /Copy .* to other days/ });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fri" }));
      fireEvent.click(within(dialog).getByRole("button", { name: /^Copy to \d+ dates?$/ }));
      await vi.waitFor(() =>
        expect(screen.getByRole("button", { name: "Edit Lunch" })).toHaveAttribute(
          "aria-disabled",
          "true"
        )
      );
    }

    it("holds Edit, says why, and does not open the editor", async () => {
      render(drawer());
      await copyToFriday();
      const edit = screen.getByRole("button", { name: "Edit Lunch" });
      expect(edit).toHaveAttribute("aria-describedby", screen.getByText(WAIT).id);
      fireEvent.click(edit);
      expect(screen.queryByRole("button", { name: "Remove Lunch" })).not.toBeInTheDocument();
    });

    it("holds Add a service and another Copy too, whose save would be a 409", async () => {
      render(drawer());
      await copyToFriday();
      expect(screen.getByRole("button", { name: /^Add / })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
      const copy = screen.getByRole("button", { name: "Copy to other days…" });
      expect(copy).toHaveAttribute("aria-disabled", "true");
      expect(copy).toHaveAttribute("aria-describedby", screen.getByText(WAIT).id);
    });

    it("stays held through a failed reload, and frees Edit once a retry brings the version", async () => {
      const { rerender } = render(drawer());
      await copyToFriday();
      rerender(drawer({ error: "Network down" }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );

      rerender(drawer({ version: 5 }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).not.toHaveAttribute(
        "aria-disabled"
      );
      expect(screen.queryByText(WAIT)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
      await vi.waitFor(() =>
        expect(
          (save.mock.calls.at(-1)?.[0] as { body: { expectedVersion: number } }).body
            .expectedVersion
        ).toBe(5)
      );
    });

    it("holds Edit from the moment the nudge starts saving", async () => {
      const FRIDAYS = ["2026-10-02", "2026-10-09", "2026-10-16"].map((date, i): DateRule => ({
        ...EARLY_DINNER,
        id: `own-${i}`,
        startsOn: date,
        endsOn: date,
      }));
      let answer: (saved: { version: number; changeId: string }) => void = () => undefined;
      save.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      const { rerender } = render(drawer({ rules: FRIDAYS, date: "2026-10-30" }));
      fireEvent.click(screen.getByRole("button", { name: /^Make a Friday schedule/ }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );

      answer({ version: 5, changeId: "chg-1" });
      await vi.waitFor(() => expect(save).toHaveBeenCalled());
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: "Edit Lunch" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );

      rerender(drawer({ rules: FRIDAYS, date: "2026-10-30", version: 5 }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).not.toHaveAttribute(
        "aria-disabled"
      );
    });

    it("frees Edit after a refused save, which moved nothing", async () => {
      save.mockRejectedValueOnce(new Error("Network down"));
      render(drawer());
      fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
      const dialog = screen.getByRole("dialog", { name: /Copy .* to other days/ });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fri" }));
      fireEvent.click(within(dialog).getByRole("button", { name: /^Copy to \d+ dates?$/ }));
      await vi.waitFor(() => expect(save).toHaveBeenCalled());
      await vi.waitFor(() =>
        expect(screen.getByRole("button", { name: "Edit Lunch" })).not.toHaveAttribute(
          "aria-disabled"
        )
      );
    });

    it("holds the next day's Edit after the editor's own save, until the reload lands", async () => {
      save.mockResolvedValueOnce({ version: 5, changeId: "chg-1" });
      const { rerender } = render(drawer());
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
      await vi.waitFor(() => expect(save).toHaveBeenCalled());
      await screen.findByText(/updated/i);
      // A new date is a new editor, as when the Manager opens the next day with the reload pending.
      rerender(drawer({ date: "2026-11-02" }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
    });

    it("does not carry a hold over to another venue, whose versions are its own", async () => {
      const { rerender } = render(drawer());
      await copyToFriday();
      rerender(drawer({ venueId: "venue-2" }));
      expect(screen.getByRole("button", { name: "Edit Lunch" })).not.toHaveAttribute(
        "aria-disabled"
      );
    });
  });

  describe("Copy from a past day", () => {
    it("counts only the dates from today on, in the button and in what is sent", async () => {
      render(drawer({ date: "2026-10-02", today: "2026-10-21" }));
      fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
      const dialog = screen.getByRole("dialog", { name: /Copy .* to other days/ });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fri" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to 50 dates" }));
      await vi.waitFor(() => expect(save).toHaveBeenCalled());
      const sent = save.mock.calls.at(-1)?.[0] as {
        body: { changes: { upsert: { dateRules: Array<{ startsOn: string }> } } };
      };
      expect(sent.body.changes.upsert.dateRules[0]?.startsOn).toBe("2026-10-21");
    });
  });
});
