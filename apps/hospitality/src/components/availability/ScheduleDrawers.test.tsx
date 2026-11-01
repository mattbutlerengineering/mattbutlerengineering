import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
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
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
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
import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import { SchedulesTab } from "./SchedulesTab.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const TUE_SAT = [2, 3, 4, 5, 6];
const stateOf = (config: AvailabilityConfig, version = 7): AvailabilityConfigState => ({
  config,
  version,
  source: "rows",
});

function tueSat(): AvailabilityConfig {
  return {
    ...fixtureConfig(),
    assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: TUE_SAT, precedence: 0 }],
  };
}

/** The same venue after a colleague added Brunch to the regular week. */
function withBrunch(config: AvailabilityConfig): AvailabilityConfig {
  return {
    ...config,
    venueServices: [...config.venueServices, { id: "vs-brunch", name: "Brunch", position: 2 }],
    scheduleServices: [
      ...config.scheduleServices,
      {
        ...config.scheduleServices[0]!,
        id: "ss-brunch",
        venueServiceId: "vs-brunch",
        opensAt: 400,
        lastSeatingAt: 500,
        closesAt: 600,
      },
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

const common = { venueId: "venue-1", timezone: "America/Los_Angeles", today: "2026-10-25" };

describe("schedule drawers", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  describe("an unsaved draft", () => {
    function renderEdit() {
      const onClose = vi.fn();
      render(
        <main>
          <ScheduleEditorDrawer
            {...common}
            state={stateOf(fixtureConfig())}
            mode="edit"
            sourceScheduleId="regular"
            onStale={vi.fn()}
            onClose={onClose}
          />
        </main>
      );
      return onClose;
    }

    it("closes at once from Escape while nothing changed", () => {
      const onClose = renderEdit();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks before Escape throws away an edit, and Keep editing keeps it", () => {
      const onClose = renderEdit();
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Summer" },
      });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
      expect(within(dialog).getByText("Discard your changes?")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: /Schedule name/ })).toHaveValue("Summer");
    });

    it("Cancel asks too, and Discard closes", () => {
      const onClose = renderEdit();
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Summer" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Discard your changes?" })).getByRole("button", {
          name: "Discard",
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks before Escape closes Change regular week once a name is typed", () => {
      const onClose = vi.fn();
      render(
        <main>
          <ChangeRegularWeekDrawer
            venueId="venue-1"
            state={stateOf(tueSat())}
            today="2026-10-25"
            onStale={vi.fn()}
            onClose={onClose}
          />
        </main>
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Summer" } });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
    });
  });

  describe("a lost race while editing a schedule", () => {
    it("never deletes a colleague's new service: the Manager reviews, reapplies, then saves", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const props = {
        ...common,
        mode: "edit" as const,
        sourceScheduleId: "regular",
        onStale: vi.fn(),
        onClose: vi.fn(),
      };
      const { rerender } = render(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(opened)} />
        </main>
      );
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      // The refetch lands: the colleague's Brunch is now in the schedule.
      rerender(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(withBrunch(opened), 8)} />
        </main>
      );
      expect(await screen.findByText("Someone changed this schedule first")).toBeInTheDocument();
      expect(screen.getByText("Added: Brunch")).toBeInTheDocument();
      // Nothing can be saved until the Manager answers.
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
      expect(screen.queryByText("Someone changed this schedule first")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      const body = save.mock.calls[1]?.[0].body;
      expect(body.expectedVersion).toBe(8);
      // Their Brunch is kept; only the Lunch the Manager removed goes.
      expect(body.changes.remove.scheduleServices).toEqual(["ss-lunch"]);
      expect(body.changes.upsert.scheduleServices.map((s: { id: string }) => s.id).sort()).toEqual([
        "ss-brunch",
        "ss-dinner",
      ]);
    });

    it("Discard my changes starts again from the winning version", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const props = {
        ...common,
        mode: "edit" as const,
        sourceScheduleId: "regular",
        onStale: vi.fn(),
        onClose: vi.fn(),
      };
      const { rerender } = render(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(opened)} />
        </main>
      );
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalled());
      rerender(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(withBrunch(opened), 8)} />
        </main>
      );
      fireEvent.click(await screen.findByRole("button", { name: "Discard my changes" }));
      expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Brunch" })).toBeInTheDocument();
    });
  });

  describe("Change regular week", () => {
    const renderWeek = (config = tueSat()) =>
      render(
        <main>
          <ChangeRegularWeekDrawer
            venueId="venue-1"
            state={stateOf(config)}
            today="2026-10-25"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      );

    it("shows the days the regular week runs, and saves only those", async () => {
      renderWeek();
      expect(
        screen.getByText(/^Applies to Tue–Sat, the days your regular week runs/)
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const assignments = save.mock.calls[0]?.[0].body.changes.upsert.assignments;
      expect(assignments[0].weekdays).toEqual(TUE_SAT);
    });

    it("an end date can be taken back with No end", () => {
      renderWeek();
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      expect(screen.queryByRole("button", { name: "No end" })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "No end" }));
      expect(screen.getByLabelText("Ending")).toHaveValue("");
    });
  });

  describe("a lost race outside edit mode", () => {
    const RACED_PANEL = "Availability changed while you were editing";

    /** A colleague made the regular week "Autumn": a new schedule, Lunch now opening at 8:00. */
    function autumnRegular(opened: AvailabilityConfig): AvailabilityConfig {
      return {
        ...opened,
        schedules: [
          ...opened.schedules.map((x) => ({ ...x, isRegular: false, kind: "alternate" as const })),
          { id: "r2", name: "Autumn", kind: "regular", isRegular: true },
        ],
        scheduleServices: [
          ...opened.scheduleServices,
          ...opened.scheduleServices.map((x) => ({
            ...x,
            id: `${x.id}-r2`,
            scheduleId: "r2",
            ...(x.id === "ss-lunch" ? { opensAt: 480 } : {}),
          })),
        ],
        assignments: [
          { id: "as-r2", scheduleId: "r2", weekdays: TUE_SAT, precedence: 0 },
          ...opened.assignments.map((a) => ({ ...a, precedence: 1 })),
        ],
      };
    }

    function renderWeek(opened: AvailabilityConfig) {
      const props = { venueId: "venue-1", today: "2026-10-25", onStale: vi.fn(), onClose: vi.fn() };
      const view = render(
        <main>
          <ChangeRegularWeekDrawer {...props} state={stateOf(opened)} />
        </main>
      );
      const rerenderWith = (next: AvailabilityConfig, version: number) =>
        view.rerender(
          <main>
            <ChangeRegularWeekDrawer {...props} state={stateOf(next, version)} />
          </main>
        );
      return { props, rerenderWith };
    }

    it("two no-end regular week changes: Reapply keeps the Manager's rows and says the week was replaced", async () => {
      const opened = tueSat();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderWeek(opened);
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      rerenderWith(autumnRegular(opened), 8);
      expect(await screen.findByText("The regular week is now Autumn")).toBeInTheDocument();
      expect(screen.queryByText(/^Added:/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      const body = save.mock.calls[1]?.[0].body;
      expect(body.expectedVersion).toBe(8);
      // Lunch stays removed; Dinner is the only service the new week carries.
      expect(
        body.changes.upsert.scheduleServices.map(
          (x: { venueServiceId: string }) => x.venueServiceId
        )
      ).toEqual(["vs-dinner"]);
    });

    it("a refetch that moves the regular week does not make an untouched drawer dirty", () => {
      const opened = tueSat();
      const { props, rerenderWith } = renderWeek(opened);
      rerenderWith(autumnRegular(opened), 8);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("Start over in Change regular week clears the name and dates too", async () => {
      const opened = tueSat();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderWeek(opened);
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      rerenderWith(tueSat(), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
      expect(screen.getByLabelText(/Schedule name/)).toHaveValue("");
      expect(screen.getByLabelText("Starting")).toHaveValue("");
      expect(screen.getByLabelText("Ending")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    function renderNew(mode: "new" | "duplicate", opened: AvailabilityConfig) {
      const props = {
        ...common,
        mode,
        ...(mode === "duplicate" ? { sourceScheduleId: "regular" } : {}),
        onStale: vi.fn(),
        onClose: vi.fn(),
      };
      const view = render(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(opened)} />
        </main>
      );
      const rerenderWith = (next: AvailabilityConfig, version: number) =>
        view.rerender(
          <main>
            <ScheduleEditorDrawer {...props} state={stateOf(next, version)} />
          </main>
        );
      return { props, rerenderWith };
    }

    it("New schedule: says availability changed, not that a schedule did, and Start over clears every field", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("new", opened);
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Pop-up" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Mon" }));
      fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
      fireEvent.click(screen.getByRole("option", { name: "Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      rerenderWith(withBrunch(opened), 8);
      expect(await screen.findByText(RACED_PANEL)).toBeInTheDocument();
      expect(screen.queryByText("Someone changed this schedule first")).not.toBeInTheDocument();
      expect(screen.queryByText(/Nothing in this schedule changed/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Keep my schedule" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      expect(screen.getByRole("textbox", { name: /Schedule name/ })).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: "Mon" })).not.toBeChecked();
      expect(screen.queryByRole("button", { name: "Remove Lunch" })).not.toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("New schedule: Keep my schedule saves the draft against the winning version", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("new", opened);
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Pop-up" },
      });
      fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
      fireEvent.click(screen.getByRole("option", { name: "Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      rerenderWith(withBrunch(opened), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Keep my schedule" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(8);
    });

    it("Duplicate: a colleague deleting the original does not stop the copy being saved", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("duplicate", opened);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      const deleted = {
        ...opened,
        schedules: opened.schedules.map((x) => ({ ...x, archivedAt: "2026-10-26T00:00:00Z" })),
      };
      rerenderWith(deleted, 8);
      expect(await screen.findByText(RACED_PANEL)).toBeInTheDocument();
      expect(screen.queryByText(/can’t be saved/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Keep my schedule" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Keep my schedule" }));
      expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("the Ending picker on New schedule can be taken back with No end", () => {
      renderNew("new", fixtureConfig());
      expect(screen.queryByRole("button", { name: "No end" })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "No end" }));
      expect(screen.getByLabelText("Ending")).toHaveValue("");
    });
  });

  describe("the overnight hint", () => {
    it("does not name a day it cannot know", () => {
      const base = fixtureConfig();
      const config = {
        ...base,
        scheduleServices: base.scheduleServices.map((s) =>
          s.id === "ss-dinner" ? { ...s, closesAt: 1500 } : s
        ),
      };
      render(
        <main>
          <ScheduleEditorDrawer
            {...common}
            state={stateOf(config)}
            mode="edit"
            sourceScheduleId="regular"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      );
      const hint = screen.getByText(/the next day/);
      expect(hint).toHaveTextContent(/^Closes .* the next day$/);
    });
  });

  describe("Schedules tab", () => {
    /** Spare is used by no weekday, only by a Use schedule rule for Dec 24. */
    function usedByRule(): AvailabilityConfig {
      const base = fixtureConfig();
      return {
        ...base,
        schedules: [
          ...base.schedules,
          { id: "spare", name: "Spare", kind: "alternate", isRegular: false },
        ],
        scheduleServices: [
          ...base.scheduleServices,
          ...base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-sp`, scheduleId: "spare" })),
        ],
        dateRules: [
          {
            id: "r-use",
            kind: "use_schedule",
            targetKind: "venue",
            startsOn: "2026-12-24",
            endsOn: "2026-12-24",
            useScheduleId: "spare",
          },
        ],
      };
    }

    const renderTab = (config: AvailabilityConfig) =>
      render(
        <main>
          <SchedulesTab {...common} state={stateOf(config)} onStale={vi.fn()} />
        </main>
      );

    it("a schedule a Use schedule rule points at is not 'Not used yet', and its Delete says why", () => {
      renderTab(usedByRule());
      expect(screen.queryByText("Not used yet")).not.toBeInTheDocument();
      expect(screen.getByText("Used by 1 Use schedule rule")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Spare" })).toBeDisabled();
    });

    it("asks before the Compare toggle drops edited rows", () => {
      const base = fixtureConfig();
      const config: AvailabilityConfig = {
        ...base,
        schedules: [
          ...base.schedules,
          { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
        ],
        scheduleServices: [
          ...base.scheduleServices,
          ...base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-wk`, scheduleId: "wk" })),
        ],
      };
      renderTab(config);
      fireEvent.click(screen.getByRole("button", { name: "Compare services" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Weekend" }));
      fireEvent.click(screen.getByRole("button", { name: "Set selected to…" }));
      fireEvent.click(screen.getByRole("combobox", { name: "Booking" }));
      fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
      fireEvent.click(screen.getByRole("button", { name: "Apply to 1 selected" }));

      fireEvent.click(screen.getByRole("button", { name: "Compare services" }));
      const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
      expect(screen.getByRole("checkbox", { name: "Select Weekend" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Compare services" }));
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Discard your changes?" })).getByRole("button", {
          name: "Discard",
        })
      );
      expect(screen.queryByRole("checkbox", { name: "Select Weekend" })).not.toBeInTheDocument();
    });
  });
});
