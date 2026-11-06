import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
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

import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const common = { venueId: "venue-1", timezone: "America/Los_Angeles", today: "2026-10-25" };

/** The regular week (Fridays) plus Weeknight (Mon-Thu) and Summer (Sat-Sun), which also run Dinner. */
function threeSchedules(): AvailabilityConfig {
  const base = fixtureConfig();
  const dinner = base.scheduleServices.find((s) => s.id === "ss-dinner")!;
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      { id: "su", name: "Summer", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      { ...dinner, id: "ss-dinner-wk", scheduleId: "wk", closesAt: 1320, lastSeatingAt: 1260 },
      { ...dinner, id: "ss-dinner-su", scheduleId: "su", closesAt: 1400, lastSeatingAt: 1300 },
    ],
    assignments: [
      ...base.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
      { id: "as-su", scheduleId: "su", weekdays: [6, 0], precedence: 1 },
    ],
  };
}

const conflict = () =>
  Object.assign(new Error("conflict"), {
    problemDetails: {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "x",
      code: "version-conflict",
    },
  });

function props(config: AvailabilityConfig, version = 7) {
  return {
    ...common,
    state: { config, version, source: "rows" as const },
    mode: "edit" as const,
    sourceScheduleId: "regular",
    onStale: vi.fn(),
    onClose: vi.fn(),
  };
}

/** Dinner is the regular week's second service: close it at 11:30 PM. */
function closeDinnerLater() {
  fireEvent.click(screen.getAllByLabelText("Closes")[1]!);
  fireEvent.click(screen.getByRole("option", { name: "11:30 PM" }));
}

const group = () => screen.getByRole("group", { name: "Also apply to Dinner in:" });

describe("Also apply to in the schedule editor (F-X step 4)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("offers nothing until a service's times change, then the other schedules that run it", () => {
    render(
      <main>
        <ScheduleEditorDrawer {...props(threeSchedules())} />
      </main>
    );
    expect(screen.queryByRole("group", { name: /Also apply to/ })).not.toBeInTheDocument();
    closeDinnerLater();
    expect(
      within(group())
        .getAllByRole("checkbox")
        .map((c) => [c.closest("label")?.textContent, (c as HTMLInputElement).checked])
    ).toEqual([
      ["Weeknight", false],
      ["Summer", false],
    ]);
    // Lunch's times did not change, so it has no group.
    expect(
      screen.queryByRole("group", { name: "Also apply to Lunch in:" })
    ).not.toBeInTheDocument();
  });

  it("saves the edit and each ticked schedule as one change", async () => {
    render(
      <main>
        <ScheduleEditorDrawer {...props(threeSchedules())} />
      </main>
    );
    closeDinnerLater();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Weeknight" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const changes = save.mock.calls[0]?.[0].body.changes as AvailabilityConfigChanges;
    const rows = changes.upsert.scheduleServices ?? [];
    expect(rows.map((r) => r.id).sort()).toEqual(["ss-dinner", "ss-dinner-wk", "ss-lunch"]);
    const closes = Object.fromEntries(rows.map((r) => [r.id, r.closesAt]));
    expect([closes["ss-dinner"], closes["ss-dinner-wk"]]).toEqual([1410, 1410]);
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0]?.[0].title ?? toast.mock.calls[0]?.[0].message).toContain(
      "2 schedules updated"
    );
  });

  it("sends only the edit when nothing is ticked", async () => {
    render(
      <main>
        <ScheduleEditorDrawer {...props(threeSchedules())} />
      </main>
    );
    closeDinnerLater();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const rows = save.mock.calls[0]?.[0].body.changes.upsert.scheduleServices;
    expect(rows.map((r: { id: string }) => r.id)).not.toContain("ss-dinner-wk");
  });

  it("counts the schedules and every date they reach once one is ticked", () => {
    render(
      <main>
        <ScheduleEditorDrawer {...props(threeSchedules())} />
      </main>
    );
    closeDinnerLater();
    expect(screen.queryByText(/^Changes \d+ schedules/)).not.toBeInTheDocument();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Weeknight" }));
    expect(screen.getByText(/^Changes 2 schedules · \d+ future dates$/)).toBeInTheDocument();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Summer" }));
    expect(screen.getByText(/^Changes 3 schedules · \d+ future dates$/)).toBeInTheDocument();
  });

  it("asks keep or replace over the dates of every schedule written", () => {
    const base = threeSchedules();
    // A special day on a Tuesday: only Weeknight's dates reach it.
    const config: AvailabilityConfig = {
      ...base,
      dateRules: [
        {
          id: "r-hours",
          kind: "special_hours",
          targetKind: "venue",
          startsOn: "2026-10-27",
          endsOn: "2026-10-27",
          payload: { version: 1, services: [] },
        },
      ],
    };
    render(
      <main>
        <ScheduleEditorDrawer {...props(config)} />
      </main>
    );
    closeDinnerLater();
    expect(screen.queryByText(/own changes/)).not.toBeInTheDocument();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Weeknight" }));
    expect(screen.getByText("1 date already has its own changes")).toBeInTheDocument();
  });

  it("names a ticked schedule a colleague changed, and saves again on the new version once reapplied", async () => {
    const opened = threeSchedules();
    save.mockRejectedValueOnce(conflict());
    const p = props(opened);
    const { rerender } = render(
      <main>
        <ScheduleEditorDrawer {...p} />
      </main>
    );
    closeDinnerLater();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Weeknight" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(p.onStale).toHaveBeenCalledTimes(1));

    const theirs: AvailabilityConfig = {
      ...opened,
      scheduleServices: opened.scheduleServices.map((s) =>
        s.id === "ss-dinner-wk" ? { ...s, opensAt: 1000 } : s
      ),
    };
    rerender(
      <main>
        <ScheduleEditorDrawer {...p} state={{ config: theirs, version: 8, source: "rows" }} />
      </main>
    );
    expect(
      await screen.findByText("Also applying to: Weeknight changed first")
    ).toBeInTheDocument();
    // Its own lines are about this schedule's services, not the ticked schedule.
    expect(screen.queryByText(/^Hours changed:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const body = save.mock.calls[1]?.[0].body;
    expect(body.expectedVersion).toBe(8);
    const wk = body.changes.upsert.scheduleServices.find(
      (s: { id: string }) => s.id === "ss-dinner-wk"
    );
    // Their opens time is kept; only the times the edit changed are laid on it.
    expect([wk.opensAt, wk.closesAt]).toEqual([1000, 1410]);
  });

  it("drops the choice when the edit no longer changes the service", () => {
    render(
      <main>
        <ScheduleEditorDrawer {...props(threeSchedules())} />
      </main>
    );
    closeDinnerLater();
    expect(group()).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Closes")[1]!);
    fireEvent.click(screen.getByRole("option", { name: "11:00 PM" }));
    expect(screen.queryByRole("group", { name: /Also apply to/ })).not.toBeInTheDocument();
  });

  it("does not name a schedule that was ticked before its group went away", async () => {
    const opened = threeSchedules();
    save.mockRejectedValueOnce(conflict());
    const p = props(opened);
    const { rerender } = render(
      <main>
        <ScheduleEditorDrawer {...p} />
      </main>
    );
    closeDinnerLater();
    fireEvent.click(within(group()).getByRole("checkbox", { name: "Weeknight" }));
    // Back to the stored time: the group goes, and the tick with it.
    fireEvent.click(screen.getAllByLabelText("Closes")[1]!);
    fireEvent.click(screen.getByRole("option", { name: "11:00 PM" }));
    // Another change keeps Save on.
    fireEvent.click(screen.getAllByLabelText("Closes")[0]!);
    fireEvent.click(screen.getAllByRole("option", { name: "4:30 PM" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(p.onStale).toHaveBeenCalledTimes(1));
    const theirs: AvailabilityConfig = {
      ...opened,
      scheduleServices: opened.scheduleServices.map((s) =>
        s.id === "ss-dinner-wk" ? { ...s, opensAt: 1000 } : s
      ),
    };
    rerender(
      <main>
        <ScheduleEditorDrawer {...p} state={{ config: theirs, version: 8, source: "rows" }} />
      </main>
    );
    expect(await screen.findByText("Someone changed this schedule first")).toBeInTheDocument();
    expect(screen.queryByText(/Weeknight/)).not.toBeInTheDocument();
  });
});
