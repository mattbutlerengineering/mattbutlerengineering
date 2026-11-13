import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
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
import { SchedulesLayer } from "./schedules-tab.harness.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";
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

const CONFLICT = "Someone changed availability first";

const common = {
  venueId: "venue-1",
  timezone: "America/Los_Angeles",
  today: "2026-10-25",
  serviceDate: "2026-10-25",
};

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
      const dialog = screen.getByRole("alertdialog", { name: "Discard your changes?" });
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
        within(screen.getByRole("alertdialog", { name: "Discard your changes?" })).getByRole(
          "button",
          {
            name: "Discard",
          }
        )
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks before Escape closes Change regular week once a date is chosen", () => {
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
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("alertdialog", { name: "Discard your changes?" })
      ).toBeInTheDocument();
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
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      // The refetch lands: the colleague's Brunch is now in the schedule.
      rerender(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(withBrunch(opened), 8)} />
        </main>
      );
      // The one conflict dialog asks; what changed here is under Review their change.
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      expect(screen.getByText("Added: Brunch")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: CONFLICT })).toBeNull());
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

    it("Start over starts again from the winning version", async () => {
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
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalled());
      rerender(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(withBrunch(opened), 8)} />
        </main>
      );
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      expect(screen.getAllByRole("button", { name: /^Remove service/ })).toHaveLength(3);
      expect(screen.getByDisplayValue("Brunch")).toBeInTheDocument();
    });

    /** The Manager removed Lunch; the save was refused at version 8 and `latest` has landed. */
    async function refusedEdit(latest: AvailabilityConfig) {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(
        Object.assign(conflict(), {
          problemDetails: { ...conflict().problemDetails, currentVersion: 8 },
        })
      );
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
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalled());
      rerender(
        <main>
          <ScheduleEditorDrawer {...props} state={stateOf(latest, 8)} />
        </main>
      );
      return { props, dialog: await screen.findByRole("dialog", { name: CONFLICT }) };
    }

    it("keeps Overwrite off: a press sends nothing, and the colleague's Brunch is not removed", async () => {
      const { dialog } = await refusedEdit(withBrunch(fixtureConfig()));
      const overwrite = within(dialog).getByRole("button", { name: "Overwrite" });
      expect(overwrite).toBeDisabled();
      expect(
        within(dialog).getByText(
          "Overwrite isn’t offered for these hours. Review their change to put your changes on top, or go back to your draft."
        )
      ).toBeTruthy();
      fireEvent.click(overwrite);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("Back to my draft keeps the edit and the version it was built on", async () => {
      const { dialog, props } = await refusedEdit(withBrunch(fixtureConfig()));
      fireEvent.click(within(dialog).getByRole("button", { name: "Back to my draft" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: CONFLICT })).toBeNull());
      expect(props.onClose).not.toHaveBeenCalled();
      // Still the Manager's one service, not the colleague's three.
      expect(screen.getAllByRole("textbox", { name: /Service name/ })).toHaveLength(1);
      save.mockRejectedValueOnce(conflict());
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(7);
    });

    it("Discard mine closes the drawer without saving", async () => {
      const { dialog, props } = await refusedEdit(withBrunch(fixtureConfig()));
      fireEvent.click(within(dialog).getByRole("button", { name: "Discard mine" }));
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("when the hours being edited were deleted, neither Overwrite nor Reapply is offered", async () => {
      const opened = fixtureConfig();
      const { dialog, props } = await refusedEdit({
        ...opened,
        schedules: opened.schedules.map((s) => ({ ...s, archivedAt: "2026-10-26T00:00:00Z" })),
      });
      expect(within(dialog).getByRole("button", { name: "Overwrite" })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
      expect(within(dialog).getByText(/was deleted, so your changes can’t be saved/)).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Reapply my changes" })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Start over" }));
      expect(props.onClose).toHaveBeenCalledTimes(1);
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

    it("suggests a name from the dates, and saves the name that was chosen", async () => {
      renderWeek();
      expect(screen.queryByRole("button", { name: /^Use “/ })).toBeNull();
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "Use “Fall hours”" }));
      expect(screen.getByLabelText(/Schedule name/)).toHaveValue("Fall hours");
      expect(screen.queryByRole("button", { name: /^Use “/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const schedules = save.mock.calls[0]?.[0].body.changes.upsert.schedules;
      expect(schedules?.[0]?.name).toBe("Fall hours");
    });

    it("never overwrites a name the Manager typed", () => {
      renderWeek();
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Patio" } });
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      expect(screen.queryByRole("button", { name: /^Use “/ })).toBeNull();
      expect(screen.getByLabelText(/Schedule name/)).toHaveValue("Patio");
    });

    it("shows the days the regular week runs, and saves only those", async () => {
      renderWeek();
      expect(screen.getByText("This becomes your regular week: open Tue–Sat.")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const assignments = save.mock.calls[0]?.[0].body.changes.upsert.assignments;
      expect(assignments[0].weekdays).toEqual(TUE_SAT);
    });

    it("explains each disabled Save, one problem at a time (#7979)", () => {
      renderWeek();
      const save = screen.getByRole("button", { name: /^Save/ });
      expect(save).toBeDisabled();
      expect(screen.getByText("Choose a start date to save.")).toBeInTheDocument();
      // No end date: the change is the regular week itself, so a start date is all it needs.
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-30" } });
      expect(screen.queryByText(/to save\.$/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Save/ })).toBeEnabled();
      // A period is a schedule and is named.
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-12-31" } });
      expect(screen.getByText("Name this period to save.")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      expect(screen.queryByText(/to save\.$/)).not.toBeInTheDocument();
    });

    it("refuses a start date after the end date, and says so (#7979)", () => {
      renderWeek();
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-30" } });
      expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
      expect(screen.getByText("The end date is before the start date.")).toBeInTheDocument();
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

  describe("New schedule, why Save is off (#7979)", () => {
    const renderNew = () =>
      render(
        <main>
          <ScheduleEditorDrawer
            {...common}
            state={stateOf(tueSat())}
            mode="new"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      );

    /** The reason the footer gives for Save being off. */
    const whySaveIsOff = () =>
      document.getElementById(
        screen.getByRole("button", { name: "Save" }).getAttribute("aria-describedby") ?? ""
      )?.textContent;

    it("names what is missing, then the date order", () => {
      renderNew();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByText("Name this schedule to save.")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      expect(whySaveIsOff()).toBe("Give this service a name.");
      fireEvent.change(screen.getByRole("textbox", { name: /Service name/ }), {
        target: { value: "Brunch" },
      });
      expect(whySaveIsOff()).toBe("Choose a time.");
      fireEvent.click(screen.getByLabelText("Opens"));
      fireEvent.click(screen.getByRole("option", { name: "11:30 AM" }));
      fireEvent.click(screen.getByLabelText("Closes"));
      fireEvent.click(
        within(screen.getByRole("listbox", { name: "Closes" })).getByRole("option", {
          name: "3:00 PM",
        })
      );
      expect(whySaveIsOff()).toBe("Choose at least one day.");
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-30" } });
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByText("The end date is before the start date.")).toBeInTheDocument();
    });
  });

  describe("a lost race outside edit mode", () => {
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
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      rerenderWith(autumnRegular(opened), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      expect(screen.getByText("The regular week is now Autumn")).toBeInTheDocument();
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

    it("Change regular week keeps Overwrite off: a press sends nothing", async () => {
      const opened = tueSat();
      save.mockRejectedValueOnce(
        Object.assign(conflict(), {
          problemDetails: { ...conflict().problemDetails, currentVersion: 8 },
        })
      );
      const { props, rerenderWith } = renderWeek(opened);
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      rerenderWith(withBrunch(opened), 8);
      const overwrite = await screen.findByRole("button", { name: "Overwrite" });
      expect(overwrite).toBeDisabled();
      expect(overwrite).toHaveAccessibleDescription(
        "Overwrite isn’t offered for these hours. Review their change to put your changes on top, or go back to your draft."
      );
      fireEvent.click(overwrite);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("Start over in Change regular week clears the name and dates too", async () => {
      const opened = tueSat();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderWeek(opened);
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      rerenderWith(tueSat(), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      // Ending is clear again, so the period's name is not asked for.
      expect(screen.queryByLabelText(/Schedule name/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Starting")).toHaveValue("");
      expect(screen.getByLabelText("Ending")).toHaveValue("");
      expect(screen.getAllByRole("button", { name: /^Remove service/ })).toHaveLength(2);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    function renderNew(mode: "new" | "duplicate", opened: AvailabilityConfig, seed?: "regular") {
      const props = {
        ...common,
        mode,
        ...(seed ? { seed } : {}),
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

    it("New schedule opens with no field errors and its days open, until a service is started", () => {
      renderNew("new", fixtureConfig());
      expect(screen.queryByText("Give this service a name.")).not.toBeInTheDocument();
      expect(screen.queryByText("Choose a time.")).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Monday" })).toBeInTheDocument();
      // Save still says why it is off.
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
      expect(screen.getByText("Choose at least one day.")).toBeInTheDocument();
    });

    describe("Add a schedule… (seeded from the regular week)", () => {
      const serviceNames = () =>
        screen
          .getAllByRole("textbox", { name: /Service name/ })
          .map((input) => (input as HTMLInputElement).value);

      it("opens with the regular week's services and no days", () => {
        renderNew("new", fixtureConfig(), "regular");
        expect(serviceNames()).toEqual(["Lunch", "Dinner"]);
        // The regular week runs Fridays; the new schedule is used nowhere until it has dates.
        expect(screen.getByRole("checkbox", { name: "Friday" })).not.toBeChecked();
        expect(
          screen.queryByRole("button", { name: "Start from your regular week" })
        ).not.toBeInTheDocument();
      });

      it("fills the days from the regular week once Starting is set", () => {
        renderNew("new", fixtureConfig(), "regular");
        fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
        expect(screen.getByRole("checkbox", { name: "Friday" })).toBeChecked();
        // Clearing Starting takes the days away again: they were never the Manager's.
        fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "" } });
        expect(screen.getByRole("checkbox", { name: "Friday" })).not.toBeChecked();
      });

      it("stops following the regular week once the days have been touched", () => {
        renderNew("new", fixtureConfig(), "regular");
        fireEvent.click(screen.getByRole("button", { name: "Weekends" }));
        fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
        expect(screen.getByRole("checkbox", { name: "Saturday" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Friday" })).not.toBeChecked();
      });

      it("never saves days without dates: with no Starting the days stay empty and Save is off", () => {
        renderNew("new", fixtureConfig(), "regular");
        fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
          target: { value: "Summer hours" },
        });
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(save).not.toHaveBeenCalled();
      });

      /** The regular week made of these demo services (Lunch Mon–Fri, Dinner Tue–Sun, Brunch Sat–Sun). */
      function weekOf(pick: (i: number) => boolean, dinnerFollowsShared = false) {
        let n = 0;
        const full = demoDraft();
        return draftToConfig(
          {
            ...full,
            services: full.services
              .filter((_, i) => pick(i))
              .map((s) => (dinnerFollowsShared && s.id === "dinner" ? { ...s, days: null } : s)),
          },
          () => `w-${++n}`
        );
      }
      const dayChecks = () =>
        screen.queryAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked);

      it("shows no service's own days before Starting, so Save asks for days the Manager chose", () => {
        // Lunch Mon–Fri with Dinner every day.
        renderNew(
          "new",
          weekOf((i) => i < 2, true),
          "regular"
        );
        expect(dayChecks()).toHaveLength(0);
        expect(screen.queryByText(/^Days:/)).not.toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
          target: { value: "Summer hours" },
        });
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        expect(screen.queryByText("Choose a start date to save.")).not.toBeInTheDocument();
      });

      it("never saves a dateless schedule with days the Manager did not choose", () => {
        // Lunch Mon–Fri with Brunch Sat–Sun: nothing follows the shared days.
        renderNew(
          "new",
          weekOf((i) => i !== 1),
          "regular"
        );
        fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
          target: { value: "Summer hours" },
        });
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        // Taking Brunch away leaves a Lunch-only subset: still no dateless save.
        fireEvent.click(screen.getByRole("button", { name: "Remove service 2" }));
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(save).not.toHaveBeenCalled();
      });

      it("saves an undated schedule on days the Manager picks, as a named week for those days (C13)", async () => {
        // The regular week runs Fridays, so weekends add a week of their own without replacing it.
        renderNew("new", fixtureConfig(), "regular");
        fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
          target: { value: "Weekends" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Weekends" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const upsert = save.mock.calls[0]?.[0].body.changes.upsert;
        expect(
          upsert.assignments.map((a: { weekdays: number[]; startsOn?: string | null }) => [
            [...a.weekdays].sort(),
            a.startsOn ?? null,
          ])
        ).toEqual([[[0, 6], null]]);
      });

      it("gives each service back its own days once Starting is set", () => {
        renderNew(
          "new",
          weekOf((i) => i !== 1),
          "regular"
        );
        fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
        const lunch = screen.getByRole("group", { name: "Lunch runs on" });
        expect(
          within(lunch)
            .getAllByRole("checkbox")
            .filter((c) => (c as HTMLInputElement).checked)
            .map((c) => c.closest("label")?.textContent)
        ).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
      });

      it("saves the followed days with the dates once Starting and Ending are set", async () => {
        renderNew("new", fixtureConfig(), "regular");
        fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
          target: { value: "Summer hours" },
        });
        fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
        fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const upsert = save.mock.calls[0]?.[0].body.changes.upsert;
        expect(
          upsert.assignments.map((a: { weekdays: number[]; startsOn: string }) => [
            a.weekdays,
            a.startsOn,
          ])
        ).toEqual([[[5], "2026-11-02"]]);
      });
    });

    it("New schedule: names no change to these hours, and Start over clears every field", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("new", opened);
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Pop-up" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));

      rerenderWith(withBrunch(opened), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      // A new draft depends on nothing stored: no line says what changed in it.
      expect(screen.queryByText(/^(Added|Removed|Hours changed):/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reapply my changes" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      expect(screen.getByRole("textbox", { name: /Schedule name/ })).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: "Monday" })).not.toBeChecked();
      expect(screen.getByRole("textbox", { name: /Service name/ })).toHaveValue("");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("New schedule: Reapply my changes saves the draft against the winning version", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("new", opened);
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Pop-up" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      rerenderWith(withBrunch(opened), 8);
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(8);
    });

    it("Duplicate: a colleague deleting the original does not stop the copy being saved", async () => {
      const opened = fixtureConfig();
      save.mockRejectedValueOnce(conflict());
      const { props, rerenderWith } = renderNew("duplicate", opened);
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
      const deleted = {
        ...opened,
        schedules: opened.schedules.map((x) => ({ ...x, archivedAt: "2026-10-26T00:00:00Z" })),
      };
      rerenderWith(deleted, 8);
      fireEvent.click(await screen.findByRole("button", { name: "Review their change" }));
      expect(screen.queryByText(/can’t be saved/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reapply my changes" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Reapply my changes" }));
      expect(screen.getByRole("button", { name: "Remove service 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    // The regular week always gives way to a schedule: a copy on all its days with no end would
    // take it over for good, and Change regular week would reach no date afterwards.
    it("Duplicate of the regular week cannot save with no end on every day it runs", () => {
      renderNew("duplicate", fixtureConfig());
      const saveButton = screen.getByRole("button", { name: "Save" });
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      expect(saveButton).toBeDisabled();
      expect(
        screen.getByText(
          "With no end date, this replaces your regular week. Add an end date, or use Change regular week…"
        )
      ).toBeInTheDocument();
      fireEvent.click(saveButton);
      expect(save).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      expect(saveButton).toBeEnabled();
    });

    it("Duplicate of the regular week saves with no end on days that leave it its own", () => {
      renderNew("duplicate", fixtureConfig());
      // The fixture's regular week runs Fridays; Saturday and Sunday leave it that day.
      fireEvent.click(screen.getByRole("button", { name: "Weekends" }));
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

    const renderTab = (config: AvailabilityConfig, comparing = false) =>
      render(
        <main>
          <SchedulesLayer
            {...common}
            state={stateOf(config)}
            onStale={vi.fn()}
            comparing={comparing}
          />
        </main>
      );

    it("a schedule a Use schedule rule points at is not 'Not used yet', and its Delete says why", () => {
      renderTab(usedByRule());
      expect(screen.queryByText("Not used yet")).not.toBeInTheDocument();
      expect(screen.getByText("Used by 1 Use schedule rule")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Spare" })).toBeDisabled();
    });

    it("a copy of a schedule only a Use schedule rule runs needs days before it can save (it would otherwise win every day)", async () => {
      render(
        <main>
          <ScheduleEditorDrawer
            {...common}
            state={stateOf(usedByRule())}
            mode="duplicate"
            sourceScheduleId="spare"
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      );
      fireEvent.change(screen.getByRole("textbox", { name: /Schedule name/ }), {
        target: { value: "Holiday copy" },
      });
      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
      fireEvent.click(saveButton);
      expect(save).not.toHaveBeenCalled();

      // Once the Manager chooses where it is used, it is used there and nowhere else.
      fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
      fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
      expect(saveButton).toBeEnabled();
      fireEvent.click(saveButton);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const assignments = save.mock.calls[0]?.[0].body.changes.upsert.assignments ?? [];
      expect(assignments.map((a: { weekdays: number[] }) => a.weekdays)).toEqual([[1, 2, 3, 4, 5]]);
    });

    it("asks before closing Compare services drops edited rows", () => {
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
      renderTab(config, true);
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Weekend" }));
      fireEvent.click(screen.getByRole("button", { name: "Set selected to…" }));
      fireEvent.click(screen.getByRole("combobox", { name: "Booking" }));
      fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
      fireEvent.click(screen.getByRole("button", { name: "Apply to 1 selected" }));

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      const dialog = screen.getByRole("alertdialog", { name: "Discard your changes?" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
      expect(screen.getByRole("checkbox", { name: "Select Weekend" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.click(
        within(screen.getByRole("alertdialog", { name: "Discard your changes?" })).getByRole(
          "button",
          {
            name: "Discard",
          }
        )
      );
      expect(screen.queryByRole("checkbox", { name: "Select Weekend" })).not.toBeInTheDocument();
    });
  });
});
