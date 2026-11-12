import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], error: null, isLoading: false, refetch: vi.fn() }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  VENUE_CLOSURE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

/** Summer hours: the regular week's services, run on Fridays over a period that holds the fixture date. */
function withSummer(config: AvailabilityConfig, rules: DateRule[]): AvailabilityConfig {
  return {
    ...config,
    schedules: [
      ...config.schedules,
      { id: "summer", name: "Summer hours", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...config.scheduleServices,
      ...config.scheduleServices.map((s) => ({ ...s, id: `${s.id}-summer`, scheduleId: "summer" })),
    ],
    assignments: [
      ...config.assignments,
      {
        id: "as-summer",
        scheduleId: "summer",
        weekdays: [5],
        startsOn: "2026-10-01",
        endsOn: "2026-12-31",
        precedence: 1,
      },
    ],
    dateRules: rules,
  };
}

/** A rule that sends the date to Summer hours: the Use schedule rule the drawer and the bar write. */
const USE_SUMMER: DateRule = {
  id: "r-use",
  kind: "use_schedule",
  targetKind: "venue",
  startsOn: FIXTURE_DATE,
  endsOn: FIXTURE_DATE,
  useScheduleId: "summer",
};

/** Remove and Edit for dated-schedule layers in Why this day (ux.md F-SER, #7981). */
describe("AvailabilityDayDrawer: dated-schedule layers (#7981)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg-1" });
  });

  function renderDrawer(
    opts: {
      role?: "manager" | "host";
      rules?: DateRule[];
      today?: string;
      dated?: boolean;
      onEditSchedule?: ((id: string) => void) | null;
    } = {}
  ) {
    const rules = opts.rules ?? [];
    const base = fixtureConfig();
    const config =
      opts.dated === false
        ? {
            ...withSummer(base, rules),
            assignments: base.assignments,
          }
        : withSummer(base, rules);
    const state: AvailabilityConfigState = { version: 7, source: "rows", config };
    const onFinished = vi.fn();
    const onStale = vi.fn();
    const onEditSchedule = vi.fn();
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={FIXTURE_DATE}
            day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE)}
            isLoading={false}
            error={null}
            viewerRole={opts.role ?? "manager"}
            onClose={vi.fn()}
            editing={{
              venueId: "venue-1",
              state,
              timezone: FIXTURE_TIMEZONE,
              today: opts.today ?? "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished,
              onStale,
              ...(opts.onEditSchedule === null
                ? {}
                : { onEditSchedule: opts.onEditSchedule ?? onEditSchedule }),
            }}
          />
        </main>
      </ToastProvider>
    );
    return { onFinished, onStale, onEditSchedule };
  }

  it("shows a day under a dated schedule alone, with Edit and Remove for it", () => {
    renderDrawer();
    expect(screen.getByRole("heading", { name: "Why this day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Summer hours" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Summer hours (Oct 1 – Dec 31)" })
    ).toBeInTheDocument();
  });

  it("offers nothing for the superseded old week after Change regular week with no end", () => {
    // F-UW: the old week is kind "regular", cut off the day before the new one starts.
    const base = fixtureConfig();
    const config: AvailabilityConfig = {
      ...base,
      schedules: [{ ...base.schedules[0]!, isRegular: false }],
      assignments: [{ ...base.assignments[0]!, endsOn: "2026-11-30" }],
    };
    const state: AvailabilityConfigState = { version: 7, source: "rows", config };
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={FIXTURE_DATE}
            day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE)}
            isLoading={false}
            error={null}
            viewerRole="manager"
            onClose={vi.fn()}
            editing={{
              venueId: "venue-1",
              state,
              timezone: FIXTURE_TIMEZONE,
              today: "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished: vi.fn(),
              onEditSchedule: vi.fn(),
            }}
          />
        </main>
      </ToastProvider>
    );
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit Weekend/ })).toBeNull();
  });

  it("gives a schedule with no dates nothing to edit or remove here", () => {
    renderDrawer({ dated: false });
    expect(screen.queryByRole("button", { name: /Remove Summer hours/ })).toBeNull();
  });

  it("is a Manager's control: a Host sees the layer and no Remove", () => {
    renderDrawer({ role: "host" });
    expect(screen.queryByRole("button", { name: /Remove Summer hours/ })).toBeNull();
  });

  it("offers nothing on a date that is over", () => {
    renderDrawer({ today: "2026-11-02" });
    expect(screen.queryByRole("button", { name: /Remove Summer hours/ })).toBeNull();
  });

  it("removes the dated assignment after a destructive confirm naming the whole period", async () => {
    const { onFinished } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Remove Summer hours/ }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveAccessibleName("Remove Summer hours (Oct 1 – Dec 31)?");
    expect(confirm).toHaveTextContent(/every date of this period/i);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
    expect(save).toHaveBeenCalledWith({
      venueId: "venue-1",
      body: {
        expectedVersion: 7,
        changes: { upsert: {}, remove: { assignments: ["as-summer"] } },
        scopeConflicts: "keep",
      },
    });
  });

  it("keeps the schedule and saves nothing when the confirm is declined", () => {
    const { onFinished } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Remove Summer hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep schedule" }));
    expect(save).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("reloads through the page when the removal lost a race, and stays open", async () => {
    save.mockRejectedValue({
      problemDetails: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Changed",
        code: "version-conflict",
        winningChange: null,
      },
    });
    const { onFinished, onStale } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Remove Summer hours/ }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" })
    );
    await waitFor(() => expect(onStale).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("waits for an open editor and says why", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    const remove = screen.getByRole("button", { name: /Remove Summer hours/ });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription(/Save or discard your changes/i);
    fireEvent.click(remove);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks which dates Edit reaches, and opens the schedule's editor for all of them", () => {
    const { onEditSchedule } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Summer hours" }));
    const ask = screen.getByRole("dialog", { name: "Edit Summer hours" });
    expect(within(ask).getByRole("radio", { name: "Only Fri, Oct 30" })).toBeChecked();
    fireEvent.click(within(ask).getByRole("radio", { name: "All dates Summer hours covers" }));
    fireEvent.click(within(ask).getByRole("button", { name: "Continue" }));
    expect(onEditSchedule).toHaveBeenCalledWith("summer");
  });

  it("edits only this date in the drawer's own editor", async () => {
    const { onEditSchedule } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Summer hours" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit Summer hours" })).getByRole("button", {
        name: "Continue",
      })
    );
    expect(onEditSchedule).not.toHaveBeenCalled();
    // Edit opens the drawer's editor on this date (no "Edit Lunch" button left to press).
    expect(await screen.findByRole("button", { name: /^Save 1 date$/ })).toBeInTheDocument();
  });

  it("offers only the whole schedule when a closure would hide hours written for one date", () => {
    renderDrawer({ rules: [VENUE_CLOSURE] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Summer hours" }));
    const ask = screen.getByRole("dialog", { name: "Edit Summer hours" });
    expect(within(ask).queryByRole("radio", { name: /Only/ })).toBeNull();
    expect(within(ask).getByRole("radio", { name: /All dates/ })).toBeChecked();
  });

  it("has no Edit where the page gives no editor to open, only Remove", () => {
    renderDrawer({ onEditSchedule: null });
    expect(screen.queryByRole("button", { name: "Edit Summer hours" })).toBeNull();
    expect(screen.getByRole("button", { name: /Remove Summer hours/ })).toBeInTheDocument();
  });

  describe("a Use schedule rule on the date", () => {
    it("removes the rule after a confirm, and the drawer closes", async () => {
      const { onFinished } = renderDrawer({ rules: [USE_SUMMER], dated: false });
      fireEvent.click(screen.getByRole("button", { name: /Remove “Use Summer hours”/ }));
      const confirm = screen.getByRole("alertdialog");
      expect(confirm).toHaveTextContent(/goes back to the schedule that covers it/i);
      fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
      await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
      expect(save).toHaveBeenCalledWith({
        venueId: "venue-1",
        body: {
          expectedVersion: 7,
          changes: { upsert: {}, remove: { dateRules: ["r-use"] } },
          scopeConflicts: "keep",
        },
      });
    });

    it("changes the schedule through the Use schedule dialog, on this date", () => {
      renderDrawer({ rules: [USE_SUMMER], dated: false });
      fireEvent.click(screen.getByRole("button", { name: "Change the schedule for Fri, Oct 30" }));
      expect(
        screen.getByRole("dialog", { name: "Use a schedule on Friday, Oct 30" })
      ).toBeInTheDocument();
    });

    it("will not change the schedule under an all-day closure, and says why", () => {
      renderDrawer({ rules: [USE_SUMMER, VENUE_CLOSURE], dated: false });
      const change = screen.getByRole("button", { name: "Change the schedule for Fri, Oct 30" });
      expect(change).toHaveAttribute("aria-disabled", "true");
      expect(change).toHaveAccessibleDescription(/closed all day/i);
      fireEvent.click(change);
      expect(screen.queryByRole("dialog", { name: /Use a schedule/ })).toBeNull();
    });

    it("names the whole rule and offers no Edit when it covers many dates", () => {
      const range: DateRule = { ...USE_SUMMER, endsOn: "2026-11-15" };
      renderDrawer({ rules: [range], dated: false });
      expect(screen.queryByRole("button", { name: /Change the schedule/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Remove Use Summer hours/ }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent(/every date it covers/i);
    });
  });
});
