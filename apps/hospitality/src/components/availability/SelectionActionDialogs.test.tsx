import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const revertAsync = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revertAsync }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { ClearChangesDialog } from "./ClearChangesDialog.js";
import { UseScheduleDialog } from "./UseScheduleDialog.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

const OTHER = "2026-10-31";

function stateOf(rules: DateRule[] = [], extraSchedule = false): AvailabilityConfigState {
  const base = fixtureConfig(...rules);
  return {
    version: 7,
    source: "rows",
    config: extraSchedule
      ? {
          ...base,
          schedules: [
            ...base.schedules,
            { id: "summer", name: "Summer hours", kind: "alternate", isRegular: false },
          ],
        }
      : base,
  };
}

function sent() {
  return save.mock.calls.at(-1)?.[0] as {
    venueId: string;
    body: {
      expectedVersion: number;
      scopeConflicts: string;
      changes: {
        upsert: { dateRules?: Array<Record<string, unknown>> };
        remove: { dateRules?: string[] };
      };
    };
  };
}

beforeAll(() => {
  // jsdom has no scrollIntoView; the open Select list calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ changeId: "chg-1", version: 8 });
});

describe("ClearChangesDialog", () => {
  function renderClear(onFinished = vi.fn(), onClose = vi.fn()) {
    render(
      <ToastProvider>
        <main>
          <ClearChangesDialog
            open
            venueId="venue-1"
            state={stateOf([EARLY_DINNER])}
            dates={[FIXTURE_DATE, OTHER]}
            onClose={onClose}
            onFinished={onFinished}
            onStale={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    return { onFinished, onClose };
  }

  it("asks before clearing and names the count", () => {
    renderClear();
    expect(screen.getByText("Clear changes on 2 dates?")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("removes the own rules, offers Undo and finishes", async () => {
    const { onFinished } = renderClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear changes" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    expect(sent().body.expectedVersion).toBe(7);
    expect(sent().body.changes.remove.dateRules).toEqual(["r-special"]);
    expect(await screen.findByText("Cleared changes on 2 dates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("keeps the changes when cancelled", () => {
    const { onClose } = renderClear();
    fireEvent.click(screen.getByRole("button", { name: "Keep changes" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it("tells the Manager when the save is refused and does not finish", async () => {
    save.mockRejectedValue(new Error("boom"));
    const { onFinished, onClose } = renderClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe("UseScheduleDialog", () => {
  function renderUse(state: AvailabilityConfigState) {
    const onFinished = vi.fn();
    render(
      <ToastProvider>
        <main>
          <UseScheduleDialog
            open
            venueId="venue-1"
            state={state}
            timezone={FIXTURE_TIMEZONE}
            dates={[FIXTURE_DATE, OTHER]}
            onClose={vi.fn()}
            onFinished={onFinished}
            onStale={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    return { onFinished };
  }

  it("applies a chosen schedule to every selected date when there are several", async () => {
    const { onFinished } = renderUse(stateOf([EARLY_DINNER], true));
    fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 2 dates" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    const { changes } = sent().body;
    expect(changes.upsert.dateRules).toMatchObject([
      { kind: "use_schedule", useScheduleId: "summer", startsOn: FIXTURE_DATE },
      { kind: "use_schedule", useScheduleId: "summer", startsOn: OTHER },
    ]);
    expect(changes.remove.dateRules).toEqual(["r-special"]);
    expect(await screen.findByText("2 dates updated")).toBeInTheDocument();
  });

  it("with one schedule asks for a day to copy and cannot save before one is chosen", () => {
    renderUse(stateOf());
    expect(screen.getByText("Use another day’s hours")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to 2 dates" })).toBeDisabled();
  });
});
