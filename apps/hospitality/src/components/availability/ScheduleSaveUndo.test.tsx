import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const revert = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
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
  // The calendar popover is not what these tests are about: a plain input stands in for it.
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import { CopyDayAction } from "./CopyDayAction.js";
import { FIXTURE_DATE, fixtureConfig, resolveFixtureDay } from "./resolved-day-fixtures.js";

const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };

async function undoOffered() {
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  const { action, duration } = toast.mock.calls[0]![0];
  expect(action.label).toBe("Undo");
  expect(duration).toBe(10_000);
  return action.onClick as () => void;
}

const REVERT_ARGS = { venueId: "venue-1", changeId: "chg", expectedVersion: 8 };

describe("Undo after a schedule save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
    revert.mockResolvedValue({ version: 9, changeId: "chg2" });
  });

  it("offers Undo after Change regular week, reverting that save", async () => {
    render(
      <main>
        <ChangeRegularWeekDrawer
          venueId="venue-1"
          state={state}
          today="2026-10-25"
          onStale={vi.fn()}
          onClose={vi.fn()}
        />
      </main>
    );
    fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    (await undoOffered())();
    await waitFor(() => expect(revert).toHaveBeenCalledWith(REVERT_ARGS));
  });

  it("offers Undo after copy-day, reverting that save", async () => {
    render(
      <main>
        <CopyDayAction
          venueId="venue-1"
          state={state}
          date={FIXTURE_DATE}
          day={resolveFixtureDay()}
          onStale={vi.fn()}
        />
      </main>
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Mon/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Copy to \d+ date/ }));
    (await undoOffered())();
    await waitFor(() => expect(revert).toHaveBeenCalledWith(REVERT_ARGS));
  });
});
