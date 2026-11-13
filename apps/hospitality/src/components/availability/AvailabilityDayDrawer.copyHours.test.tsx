import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx); here it never answers.
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], error: null, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { openCopyFrom, openCopyToOtherDays } from "../../test/copy-hours.js";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/** The drawer's old names for copying hours, before availability-hub A0.3 (#8691). */
const OLD_NAMES = /Copy to other days|Use another day.s hours…|Use schedule…/;

/**
 * Two actions for copying hours in the day drawer, where there were three names (availability-hub
 * ux.md:379 and capability row 27): "Use other hours…" brings hours onto this date, "Copy hours…"
 * takes this date's hours to other weekdays.
 */
describe("AvailabilityDayDrawer: Use other hours and Copy hours", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg-1" });
  });

  function state(rules: DateRule[], extraSchedule: boolean): AvailabilityConfigState {
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

  function renderDrawer(opts: { extraSchedule?: boolean } = {}) {
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={FIXTURE_DATE}
            day={resolveFixtureDay()}
            isLoading={false}
            error={null}
            viewerRole="manager"
            onClose={vi.fn()}
            editing={{
              venueId: "venue-1",
              state: state([], opts.extraSchedule ?? false),
              timezone: FIXTURE_TIMEZONE,
              today: "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished: vi.fn(),
              onCloseDay: vi.fn(),
              onStale: vi.fn(),
            }}
          />
        </main>
      </ToastProvider>
    );
  }

  const actionNames = () =>
    within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);

  it("lists Close…, Use other hours… and Copy hours… under the hours, in that order", () => {
    renderDrawer();
    expect(actionNames()).toEqual([
      "Close",
      "Edit Lunch",
      "Edit Dinner",
      "Add service",
      "Close…",
      "Use other hours…",
      "Copy hours…",
    ]);
  });

  it("keeps the same two names once the venue has two sets of hours, and none of the old ones", () => {
    renderDrawer({ extraSchedule: true });
    expect(screen.getAllByRole("button", { name: "Use other hours…" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy hours…" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: OLD_NAMES })).toBeNull();
  });

  it("Use other hours… picks a day while the venue has one set of hours", async () => {
    renderDrawer();
    const dialog = await openCopyFrom(/^Use another day’s hours on Friday, Oct 30$/);
    expect(within(dialog).getByLabelText("Copy hours from")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("Use other hours… picks a set of hours once there are two", async () => {
    renderDrawer({ extraSchedule: true });
    const dialog = await openCopyFrom(/^Use a schedule on Friday, Oct 30$/);
    expect(within(dialog).getByRole("combobox", { name: "Schedule" })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("Copy hours… opens the weekday copy, with this week and Every week…", async () => {
    renderDrawer();
    const dialog = await openCopyToOtherDays();
    expect(dialog).toHaveAccessibleName("Copy Friday, Oct 30 to other days");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Saturday" }));
    expect(within(dialog).getByRole("button", { name: "Copy to Sat" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Every week…" })).toBeEnabled();
    expect(save).not.toHaveBeenCalled();
  });
});
