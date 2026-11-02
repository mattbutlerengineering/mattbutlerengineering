import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
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

import { UseDayHoursAction } from "./UseDayHoursAction.js";
import { FIXTURE_DATE, FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";

function stateOf(extraSchedule: boolean): AvailabilityConfigState {
  const base = fixtureConfig();
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

function renderAction(state: AvailabilityConfigState, waiting = false) {
  const onFinished = vi.fn();
  render(
    <ToastProvider>
      <main>
        <UseDayHoursAction
          venueId="venue-1"
          state={state}
          timezone={FIXTURE_TIMEZONE}
          date={FIXTURE_DATE}
          waiting={waiting}
          onFinished={onFinished}
          onStale={vi.fn()}
        />
      </main>
    </ToastProvider>
  );
  return { onFinished };
}

beforeAll(() => {
  // jsdom has no scrollIntoView; the open Select list calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ changeId: "chg-1", version: 8 });
});

describe("UseDayHoursAction (ux.md F2 drawer actions)", () => {
  it("offers another day's hours while the venue has one schedule", () => {
    renderAction(stateOf(false));
    fireEvent.click(screen.getByRole("button", { name: "Use another day’s hours…" }));
    expect(screen.getByRole("dialog", { name: "Use another day’s hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to 1 date" })).toBeDisabled();
  });

  it("is named Use schedule once two schedules exist, and saves that one date", async () => {
    const { onFinished } = renderAction(stateOf(true));
    fireEvent.click(screen.getByRole("button", { name: "Use schedule…" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1 date" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    const sent = save.mock.calls.at(-1)?.[0] as {
      body: { expectedVersion: number; changes: { upsert: { dateRules?: unknown[] } } };
    };
    // Same draft path as the selection bar: the saved version rides along.
    expect(sent.body.expectedVersion).toBe(7);
    expect(sent.body.changes.upsert.dateRules).toMatchObject([
      { kind: "use_schedule", useScheduleId: "summer", startsOn: FIXTURE_DATE },
    ]);
  });

  it("does not open while an editor is open or a reload is due", () => {
    renderAction(stateOf(false), true);
    const button = screen.getByRole("button", { name: "Use another day’s hours…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
