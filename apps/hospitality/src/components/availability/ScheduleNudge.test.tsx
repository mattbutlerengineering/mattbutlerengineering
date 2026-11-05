import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addDays, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast, dismiss: vi.fn() }),
}));

import { ScheduleNudge } from "./ScheduleNudge.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

/** Three Fridays with their own early Dinner: the nudge's threshold. */
const SINGLE_DATES = [1, 2, 3].map((week): DateRule => ({
  ...EARLY_DINNER,
  id: `single-${week}`,
  startsOn: addDays(FIXTURE_DATE, week * 7),
  endsOn: addDays(FIXTURE_DATE, week * 7),
}));

function renderNudge(config: AvailabilityConfig = fixtureConfig(...SINGLE_DATES)) {
  const date = addDays(FIXTURE_DATE, 7);
  render(
    <main>
      <ScheduleNudge
        venueId="venue-1"
        state={{ config, version: 7, source: "rows" }}
        date={date}
        day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, date)}
        onStale={vi.fn()}
      />
    </main>
  );
}

describe("the schedule nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("says Friday has had three one-off changes, and offers its hours as the regular ones", () => {
    renderNudge();
    expect(screen.getByText("Friday has had 3 one-off changes.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make these Friday’s regular hours" })
    ).toBeInTheDocument();
  });

  it("writes the day's hours into the regular week, with no schedule or assignment", async () => {
    renderNudge();
    fireEvent.click(screen.getByRole("button", { name: "Make these Friday’s regular hours" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { changes } = save.mock.calls[0]![0].body;
    expect(changes.upsert.schedules).toBeUndefined();
    expect(changes.upsert.assignments).toBeUndefined();
    // Dinner's 10:00 PM close is now the regular Friday's; Lunch is unchanged and not rewritten.
    expect(changes.upsert.scheduleServices).toHaveLength(1);
    expect(changes.upsert.scheduleServices[0]).toMatchObject({
      id: "ss-dinner",
      scheduleId: "regular",
      closesAt: 1320,
    });
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0]![0].title).toBe("Friday’s regular hours updated");
  });
});
