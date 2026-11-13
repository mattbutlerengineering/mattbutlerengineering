import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type * as Rialto from "@mattbutlerengineering/rialto";
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
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  // The calendar popover is not what these tests are about: a plain input stands in for it.
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { UseDayHoursAction } from "./UseDayHoursAction.js";
import { FIXTURE_DATE, FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";
import { saveRegularWeek, supersededWeekOf } from "./superseded-fixtures.js";

const TITLE_DAY = "Use another day’s hours on Friday, Oct 30";

function stateOf(
  extra: ReadonlyArray<{ id: string; name: string; archivedAt?: string }>
): AvailabilityConfigState {
  const base = fixtureConfig();
  return {
    version: 7,
    source: "rows",
    config: {
      ...base,
      schedules: [
        ...base.schedules,
        ...extra.map((s) => ({ ...s, kind: "alternate" as const, isRegular: false })),
      ],
    },
  };
}

const SUMMER = [{ id: "summer", name: "Summer hours" }];

function renderAction(
  state: AvailabilityConfigState,
  extra: { waiting?: boolean; closedReason?: string | null } = {}
) {
  const onFinished = vi.fn();
  const onStale = vi.fn();
  render(
    <ToastProvider>
      <main>
        <UseDayHoursAction
          venueId="venue-1"
          state={state}
          timezone={FIXTURE_TIMEZONE}
          date={FIXTURE_DATE}
          waiting={extra.waiting}
          closedReason={extra.closedReason}
          onFinished={onFinished}
          onStale={onStale}
        />
      </main>
    </ToastProvider>
  );
  return { onFinished, onStale };
}

async function applyOneDate(name: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
  fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeAll(() => {
  // jsdom has no scrollIntoView; the open Select list calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ changeId: "chg-1", version: 8 });
});

describe("UseDayHoursAction: Use other hours… (ux.md F2 drawer actions, #8691)", () => {
  it("offers another day's hours while the venue has one schedule, and names the date", () => {
    renderAction(stateOf([]));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    expect(screen.getByRole("dialog", { name: TITLE_DAY })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to 1 date" })).toBeDisabled();
  });

  it("does not count an archived schedule: it still offers another day's hours", () => {
    renderAction(stateOf([{ id: "old", name: "Old", archivedAt: "2026-01-01T00:00:00Z" }]));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    expect(screen.getByRole("dialog", { name: TITLE_DAY })).toBeInTheDocument();
  });

  it("keeps its one name once two sets of hours exist, picks a set, titles the date, and saves that date", async () => {
    const { onFinished } = renderAction(stateOf(SUMMER));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    // Nothing is selected here: the title says which date, not "the selected dates".
    expect(
      screen.getByRole("dialog", { name: "Use a schedule on Friday, Oct 30" })
    ).toBeInTheDocument();
    await applyOneDate(/^Apply to 1 date$/);
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
    const sent = save.mock.calls.at(-1)?.[0] as {
      venueId: string;
      body: { expectedVersion: number; changes: { upsert: { dateRules?: unknown[] } } };
    };
    // Same draft path as the selection bar: the saved version rides along.
    expect(sent.venueId).toBe("venue-1");
    expect(sent.body.expectedVersion).toBe(7);
    expect(sent.body.changes.upsert.dateRules).toMatchObject([
      { kind: "use_schedule", useScheduleId: "summer", startsOn: FIXTURE_DATE },
    ]);
  });

  it("closes its dialog once the change is saved", async () => {
    renderAction(stateOf(SUMMER));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    await applyOneDate(/^Apply to 1 date$/);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on Cancel without saving", async () => {
    const { onFinished } = renderAction(stateOf(SUMMER));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(save).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("reloads the config when the save lost a race", async () => {
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
    const { onFinished, onStale } = renderAction(stateOf(SUMMER));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    await applyOneDate(/^Apply to 1 date$/);
    await waitFor(() => expect(onStale).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("will not copy a day onto itself", () => {
    renderAction(stateOf([]));
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    fireEvent.change(screen.getByLabelText("Copy hours from"), {
      target: { value: FIXTURE_DATE },
    });
    const apply = screen.getByRole("button", { name: "Apply to 1 date" });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAccessibleDescription(
      "That is the date you are changing. Choose another day."
    );
  });

  it("does not open while an editor is open or a reload is due", () => {
    renderAction(stateOf([]), { waiting: true });
    const button = screen.getByRole("button", { name: "Use other hours…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays shut, with the reason attached, on a date closed all day", () => {
    renderAction(stateOf([]), { closedReason: "Closed all day. Reopen it first." });
    const button = screen.getByRole("button", { name: "Use other hours…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Closed all day. Reopen it first.");
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("UseDayHoursAction after a regular-week save (#8688)", () => {
  beforeEach(() => {
    // Noon on the fixture Friday, venue time: the service date is the day of the save.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T19:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const saved = (config = fixtureConfig()): AvailabilityConfigState => ({
    version: 8,
    source: "rows",
    config: saveRegularWeek(config, FIXTURE_DATE),
  });

  it("on a one-schedule venue, opens as another day's hours: the replaced week is not counted", () => {
    renderAction(saved());
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    const dialog = screen.getByRole("dialog", { name: TITLE_DAY });
    expect(within(dialog).getByLabelText("Copy hours from")).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: "Schedule" })).not.toBeInTheDocument();
  });

  it("does not offer the replaced week in the schedule picker", () => {
    const base = stateOf(SUMMER).config;
    const state = saved(base);
    const old = supersededWeekOf(state.config);
    renderAction(state);
    fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
    const offered = screen.getAllByRole("option").map((o) => o.textContent);
    expect(offered).toEqual(["Summer hours", "Regular week"]);
    expect(offered).not.toContain(old.name);
  });
});
