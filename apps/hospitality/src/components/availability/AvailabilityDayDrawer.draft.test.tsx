import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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
  }

  function drawer(extra: Extra = {}) {
    const rules = extra.rules ?? [];
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
              venueId: "venue-1",
              state: rules.length > 0 ? { ...state, config: fixtureConfig(...rules) } : state,
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
      "These dates have different hours. The rows below are from Friday, October 30. Saving replaces the hours on all 2 selected dates."
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
