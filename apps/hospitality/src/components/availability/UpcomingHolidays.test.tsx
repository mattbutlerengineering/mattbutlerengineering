import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, DateRule, HolidayDecision } from "@mbe/types";

const read = vi.hoisted(() => ({
  decisions: [] as HolidayDecision[] | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
}));
const setDecision = vi.hoisted(() => vi.fn());
const clearDecision = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({
    data: read.decisions,
    isLoading: read.decisions === undefined && read.error === null,
    error: read.error,
    refetch: read.refetch,
  }),
  useSetHolidayDecision: () => ({ mutateAsync: setDecision, isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: clearDecision, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig } }),
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { UpcomingHolidays, type UpcomingHolidaysProps } from "./UpcomingHolidays.js";

const TODAY = "2026-11-08";

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

const rule = (startsOn: string, kind: "closure" | "special_hours", id = `${kind}-${startsOn}`) =>
  ({
    id,
    kind,
    targetKind: "venue",
    startsOn,
    endsOn: startsOn,
    ...(kind === "special_hours" ? { payload: { version: 1, services: [] } } : {}),
  }) as DateRule;

const stateWith = (...dateRules: DateRule[]) =>
  ({
    version: 7,
    source: "rows",
    config: {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules,
    },
  }) as unknown as AvailabilityConfigState;

const decision = (serviceDate: string): HolidayDecision => ({
  serviceDate,
  decision: "open_as_usual",
  createdAt: "2026-11-01T00:00:00Z",
});

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  new ApiClientError(
    { type: "about:blank", title: "Nope", status, detail: "Refused.", ...extra } as never,
    "PUT",
    "holiday-decisions"
  );

function setup(over: Partial<UpcomingHolidaysProps> = {}) {
  const props: UpcomingHolidaysProps = {
    venueId: "venue-1",
    state: stateWith(),
    today: TODAY,
    isManager: true,
    onStale: vi.fn(),
    onOpenDay: vi.fn(),
    onClose: vi.fn(),
    onSpecialHours: vi.fn(),
    onReopen: vi.fn(),
    onEditHours: vi.fn(),
    ...over,
  };
  const element = (p: UpcomingHolidaysProps) => (
    <VenueContext value={VENUE}>
      <ToastProvider>
        <main>
          <UpcomingHolidays {...p} />
        </main>
      </ToastProvider>
    </VenueContext>
  );
  const view = render(element(props));
  return { props, rerender: (next: UpcomingHolidaysProps) => view.rerender(element(next)) };
}

const panel = () => screen.getByRole("region", { name: "Upcoming holidays" });
const choices = (name: string) => screen.getByRole("group", { name });
const press = (name: string, choice: string) =>
  fireEvent.click(within(choices(name)).getByRole("button", { name: choice }));

const THANKSGIVING = "Thanksgiving, Thu, Nov 26";
const CHRISTMAS_EVE = "Christmas Eve, Thu, Dec 24";
const CHRISTMAS_DAY = "Christmas Day, Fri, Dec 25";

describe("UpcomingHolidays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-08T20:00:00Z") });
    read.decisions = [];
    read.error = null;
    setDecision.mockResolvedValue(decision("2026-11-26"));
    clearDecision.mockResolvedValue(undefined);
    saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
    getConfig.mockResolvedValue({ version: 9 });
  });

  describe("the list", () => {
    it("groups the first five undecided holidays by month, then offers the rest", () => {
      setup();
      const months = within(panel())
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
      expect(months).toEqual(["November", "December", "January 2027"]);
      expect(
        within(panel())
          .getAllByRole("listitem")
          .map((li) => li.firstChild?.textContent)
      ).toEqual([
        "Thanksgiving",
        "Christmas Eve",
        "Christmas Day",
        "New Year’s Eve",
        "New Year’s Day",
      ]);

      // Thirteen holidays from Nov 8 to Nov 8: five shown, eight more.
      fireEvent.click(screen.getByRole("button", { name: "Show 8 more holidays this year" }));
      expect(within(panel()).getAllByRole("listitem")).toHaveLength(13);
      expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
      // Later months name their year once it is not this one.
      expect(
        within(panel())
          .getAllByRole("heading", { level: 3 })
          .map((h) => h.textContent)
      ).toContain("February 2027");
    });

    it("gives each holiday three choices in a group named for it, none pressed while undecided", () => {
      setup();
      const group = choices(THANKSGIVING);
      const buttons = within(group).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual([
        "Closed",
        "Open as usual",
        "Special hours…",
      ]);
      expect(buttons.every((b) => !b.hasAttribute("aria-pressed"))).toBe(true);
    });

    it("says what is wrong, with no lines, when the decisions cannot be read, and retries", () => {
      read.decisions = undefined;
      read.error = new Error("down");
      setup();
      expect(within(panel()).queryAllByRole("listitem")).toHaveLength(0);
      expect(within(panel()).queryByRole("group")).toBeNull();
      expect(within(panel()).getByText("Couldn't load your holiday decisions.")).toBeTruthy();
      fireEvent.click(within(panel()).getByRole("button", { name: "Retry" }));
      expect(read.refetch).toHaveBeenCalledTimes(1);
    });

    it("shows no lines while the decisions load", () => {
      read.decisions = undefined;
      setup();
      expect(within(panel()).queryAllByRole("listitem")).toHaveLength(0);
      expect(within(panel()).queryByRole("button", { name: "Closed" })).toBeNull();
    });
  });

  describe("Close these N", () => {
    it("closes every undecided usually-closed holiday through the closure path, named in one title", () => {
      const { props } = setup();
      expect(
        within(panel()).getByText(
          "Restaurants usually close Thanksgiving, Christmas Day, and New Year’s Day."
        )
      ).toBeTruthy();
      fireEvent.click(within(panel()).getByRole("button", { name: "Close these 3" }));
      expect(props.onClose).toHaveBeenCalledWith(
        [
          { date: "2026-11-26", name: "Thanksgiving", kind: "closed" },
          { date: "2026-12-25", name: "Christmas Day", kind: "closed" },
          { date: "2027-01-01", name: "New Year’s Day", kind: "closed" },
        ],
        "Closed on Thanksgiving, Christmas Day, and New Year’s Day",
        { onSettled: expect.any(Function) }
      );
      expect(setDecision).not.toHaveBeenCalled();
    });

    it("marks all three lines saving, and blocks every other press, until the sheet closes", () => {
      const { props } = setup();
      fireEvent.click(within(panel()).getByRole("button", { name: "Close these 3" }));
      for (const name of [THANKSGIVING, CHRISTMAS_DAY, "New Year’s Day, Fri, Jan 1"]) {
        for (const b of within(choices(name)).getAllByRole("button")) expect(b).toBeDisabled();
      }
      expect(within(choices(CHRISTMAS_EVE)).getByRole("button", { name: "Closed" })).toBeDisabled();
      expect(within(panel()).getByRole("button", { name: "Close these 3" })).toBeDisabled();

      act(() => vi.mocked(props.onClose).mock.calls[0]![2].onSettled());
      expect(within(choices(THANKSGIVING)).getByRole("button", { name: "Closed" })).toBeEnabled();
      expect(within(panel()).getByRole("button", { name: "Close these 3" })).toBeEnabled();
    });

    it("counts only the undecided ones, and goes when one is left", () => {
      read.decisions = [decision("2026-12-25")];
      const { rerender, props } = setup();
      expect(within(panel()).getByRole("button", { name: "Close these 2" })).toBeTruthy();
      read.decisions = [decision("2026-12-25"), decision("2027-01-01")];
      rerender(props);
      expect(within(panel()).queryByRole("button", { name: /^Close these/ })).toBeNull();
      expect(within(panel()).queryByText(/usually close/)).toBeNull();
    });
  });

  describe("Open as usual", () => {
    it("saves the decision, says so, and Undo clears it", async () => {
      setup();
      press(THANKSGIVING, "Open as usual");
      await waitFor(() =>
        expect(setDecision).toHaveBeenCalledWith({
          venueId: "venue-1",
          serviceDate: "2026-11-26",
          decision: "open_as_usual",
        })
      );
      expect(await screen.findByText("Thanksgiving: open as usual")).toBeTruthy();
      expect(saveConfig).not.toHaveBeenCalled();
      expect(panel()).toHaveFocus();

      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      await waitFor(() =>
        expect(clearDecision).toHaveBeenCalledWith({
          venueId: "venue-1",
          serviceDate: "2026-11-26",
        })
      );
    });

    it("from special hours removes that rule first, then saves the decision, with no Undo", async () => {
      const hours = rule("2026-11-26", "special_hours", "hours-1");
      setup({ state: stateWith(hours) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Open as usual");

      await waitFor(() => expect(setDecision).toHaveBeenCalledTimes(1));
      expect(saveConfig).toHaveBeenCalledWith({
        venueId: "venue-1",
        body: {
          expectedVersion: 7,
          changes: { upsert: {}, remove: { dateRules: ["hours-1"] } },
          scopeConflicts: "keep",
        },
      });
      expect(saveConfig.mock.invocationCallOrder[0]!).toBeLessThan(
        setDecision.mock.invocationCallOrder[0]!
      );
      await screen.findByText("Thanksgiving: open as usual");
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("from special hours: a refused removal changes nothing and the decision is never written", async () => {
      saveConfig.mockRejectedValue(problem(409, { code: "stranded-bookings", reservations: [] }));
      setup({ state: stateWith(rule("2026-11-26", "special_hours", "hours-1")) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Open as usual");

      expect(await screen.findByText("Couldn't save.")).toBeTruthy();
      expect(setDecision).not.toHaveBeenCalled();
    });

    it("from special hours: a lost race reloads the config", async () => {
      saveConfig.mockRejectedValue(problem(409, { code: "version-conflict" }));
      const { props } = setup({ state: stateWith(rule("2026-11-26", "special_hours")) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Open as usual");

      await screen.findByText("Couldn't save.");
      expect(props.onStale).toHaveBeenCalledTimes(1);
    });

    it("from special hours: if the decision fails after the removal, the line says so and Retry writes it", async () => {
      setDecision.mockRejectedValueOnce(problem(404));
      const { props, rerender } = setup({
        state: stateWith(rule("2026-11-26", "special_hours", "hours-1")),
      });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Open as usual");
      expect(await screen.findByText("Couldn't save.")).toBeTruthy();

      // The removal saved: the config reloads without the rule, and the day is undecided again.
      rerender({ ...props, state: stateWith() });
      fireEvent.click(screen.getByRole("button", { name: `Retry ${THANKSGIVING}` }));
      await waitFor(() => expect(setDecision).toHaveBeenCalledTimes(2));
      // Not removed a second time: there is no rule left to remove.
      expect(saveConfig).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByText("Couldn't save.")).toBeNull());
    });

    it("from closed reopens the closure first and writes the decision only once it is reopened", async () => {
      const { props } = setup({ state: stateWith(rule("2026-11-26", "closure", "closure-1")) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Open as usual");

      expect(props.onReopen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(props.onReopen).mock.calls[0]![0]).toBe("closure-1");
      expect(setDecision).not.toHaveBeenCalled();

      vi.mocked(props.onReopen).mock.calls[0]![1]();
      await waitFor(() => expect(setDecision).toHaveBeenCalledTimes(1));
      expect(saveConfig).not.toHaveBeenCalled();
    });
  });

  describe("a save that fails", () => {
    it.each([
      ["a server error", 500],
      ["an older server with no route", 404],
      ["an older server that rejects the method", 405],
    ])("leaves the line undecided with Retry, on %s", async (_name, status) => {
      setDecision.mockRejectedValueOnce(problem(status));
      setup();
      press(THANKSGIVING, "Open as usual");

      const retry = await screen.findByRole("button", { name: `Retry ${THANKSGIVING}` });
      expect(screen.getByText("Couldn't save.")).toBeTruthy();
      expect(retry).toHaveFocus();
      // Still undecided: the choices are there, nothing is drawn as decided, no toast.
      expect(choices(THANKSGIVING)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Decided/ })).toBeNull();
      expect(screen.queryByText("Thanksgiving: open as usual")).toBeNull();

      fireEvent.click(retry);
      await waitFor(() => expect(setDecision).toHaveBeenCalledTimes(2));
      await screen.findByText("Thanksgiving: open as usual");
      expect(screen.queryByText("Couldn't save.")).toBeNull();
    });

    it("fails one line at a time", async () => {
      setDecision.mockRejectedValueOnce(problem(404));
      setup();
      press(THANKSGIVING, "Open as usual");
      await screen.findByText("Couldn't save.");
      expect(within(choices(CHRISTMAS_EVE)).getByRole("button", { name: "Closed" })).toBeEnabled();
      expect(screen.getAllByText("Couldn't save.")).toHaveLength(1);
    });
  });

  describe("Closed", () => {
    it("from undecided sends the date to the closure path with a title naming it", () => {
      const { props } = setup();
      press(THANKSGIVING, "Closed");
      expect(props.onClose).toHaveBeenCalledWith(
        [{ date: "2026-11-26", name: "Thanksgiving", kind: "closed" }],
        "Closed on Thanksgiving, Thu, Nov 26",
        { onSettled: expect.any(Function) }
      );
      expect(setDecision).not.toHaveBeenCalled();
      expect(clearDecision).not.toHaveBeenCalled();
    });

    it("marks the line saving until the sheet closes, and blocks a second press meanwhile", () => {
      const { props } = setup();
      press(THANKSGIVING, "Closed");
      // Group disabled, every choice: none can be pressed again.
      for (const b of within(choices(THANKSGIVING)).getAllByRole("button")) {
        expect(b).toBeDisabled();
      }
      // Another holiday's press is blocked, not dropped or sent to the first request.
      const other = within(choices(CHRISTMAS_EVE)).getByRole("button", { name: "Closed" });
      expect(other).toBeDisabled();
      fireEvent.click(other);
      expect(props.onClose).toHaveBeenCalledTimes(1);

      // The sheet closed (saved or cancelled): the lines are live again, and the next press is
      // its own request for its own date.
      act(() => vi.mocked(props.onClose).mock.calls[0]![2].onSettled());
      press(CHRISTMAS_EVE, "Closed");
      expect(props.onClose).toHaveBeenCalledTimes(2);
      expect(vi.mocked(props.onClose).mock.calls[1]![0]).toEqual([
        { date: "2026-12-24", name: "Christmas Eve", kind: "closed" },
      ]);
    });

    it("a Special hours… press is saving too, until its sheet closes", () => {
      const { props } = setup();
      press(THANKSGIVING, "Special hours…");
      expect(
        within(choices(CHRISTMAS_EVE)).getByRole("button", { name: "Special hours…" })
      ).toBeDisabled();
      act(() => vi.mocked(props.onSpecialHours).mock.calls[0]![1].onSettled());
      expect(
        within(choices(CHRISTMAS_EVE)).getByRole("button", { name: "Special hours…" })
      ).toBeEnabled();
    });

    it("from Open as usual clears the decision only after the closure is saved", async () => {
      read.decisions = [decision("2026-12-24")];
      const { props } = setup();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${CHRISTMAS_EVE}` }));
      press(CHRISTMAS_EVE, "Closed");

      const { afterSaved } = vi.mocked(props.onClose).mock.calls[0]![2];
      // Cancelling the sheet never calls it: the mark is untouched.
      expect(clearDecision).not.toHaveBeenCalled();
      await afterSaved!();
      expect(clearDecision).toHaveBeenCalledWith({ venueId: "venue-1", serviceDate: "2026-12-24" });
    });

    it("from Open as usual: a failed clear is harmless, the closure outranks the mark", async () => {
      read.decisions = [decision("2026-12-24")];
      clearDecision.mockRejectedValue(problem(404));
      const { props } = setup();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${CHRISTMAS_EVE}` }));
      press(CHRISTMAS_EVE, "Closed");
      await expect(
        vi.mocked(props.onClose).mock.calls[0]![2].afterSaved!()
      ).resolves.toBeUndefined();
    });

    it("from special hours removes the old hours afterwards, against a fresh version, best effort", async () => {
      const { props } = setup({
        state: stateWith(rule("2026-12-24", "special_hours", "hours-1")),
      });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${CHRISTMAS_EVE}` }));
      press(CHRISTMAS_EVE, "Closed");

      expect(saveConfig).not.toHaveBeenCalled();
      await vi.mocked(props.onClose).mock.calls[0]![2].afterSaved!();
      expect(getConfig).toHaveBeenCalledWith("venue-1");
      expect(saveConfig).toHaveBeenCalledWith({
        venueId: "venue-1",
        body: {
          expectedVersion: 9,
          changes: { upsert: {}, remove: { dateRules: ["hours-1"] } },
          scopeConflicts: "keep",
        },
      });

      saveConfig.mockRejectedValueOnce(problem(409, { code: "version-conflict" }));
      await expect(
        vi.mocked(props.onClose).mock.calls[0]![2].afterSaved!()
      ).resolves.toBeUndefined();
    });
  });

  describe("Special hours…", () => {
    it("from undecided opens the sheet with an hours row for the date", () => {
      const { props } = setup();
      press(THANKSGIVING, "Special hours…");
      expect(props.onSpecialHours).toHaveBeenCalledWith(
        { date: "2026-11-26", name: "Thanksgiving", kind: "hours" },
        { onSettled: expect.any(Function) }
      );
    });

    it("from Open as usual clears the decision once the sheet saved", async () => {
      read.decisions = [decision("2026-12-24")];
      const { props } = setup();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${CHRISTMAS_EVE}` }));
      press(CHRISTMAS_EVE, "Special hours…");

      await vi.mocked(props.onSpecialHours).mock.calls[0]![1].afterSaved!();
      expect(clearDecision).toHaveBeenCalledWith({ venueId: "venue-1", serviceDate: "2026-12-24" });
    });

    it("from closed opens the sheet first and reopens the closure only after the hours saved", async () => {
      const { props } = setup({ state: stateWith(rule("2026-11-26", "closure", "closure-1")) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Special hours…");

      // Cancelling the sheet leaves the venue Closed: nothing was reopened.
      expect(props.onSpecialHours).toHaveBeenCalledTimes(1);
      expect(props.onReopen).not.toHaveBeenCalled();

      await vi.mocked(props.onSpecialHours).mock.calls[0]![1].afterSaved!();
      expect(props.onReopen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(props.onReopen).mock.calls[0]![0]).toBe("closure-1");
    });
  });

  describe("Decided", () => {
    const decided = () =>
      setup({
        state: stateWith(rule("2026-11-26", "closure"), rule("2026-12-31", "special_hours"), {
          ...rule("2027-01-01", "closure"),
          endsOn: "2027-01-03",
        } as DateRule),
      });

    it("folds decided holidays, each with what was decided and a Change", () => {
      read.decisions = [decision("2026-12-24")];
      decided();
      const toggle = within(panel()).getByRole("button", { name: "Decided (4)" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(within(panel()).queryByText("Has special dates")).toBeNull();

      fireEvent.click(toggle);
      const lines = within(panel())
        .getAllByRole("listitem")
        .filter((li) => within(li).queryByRole("button", { name: /^Change / }));
      expect(lines.map((li) => li.textContent)).toEqual([
        "ThanksgivingThu, Nov 26ClosedChange",
        "Christmas EveThu, Dec 24Open as usualChange",
        "New Year’s EveThu, Dec 31Special hoursChange",
        "New Year’s DayFri, Jan 1Has special datesChange",
      ]);
      // They are no longer in the list of holidays to decide.
      expect(screen.queryByRole("group", { name: THANKSGIVING })).toBeNull();
      expect(screen.getByRole("group", { name: CHRISTMAS_DAY })).toBeTruthy();
    });

    it("Change turns the line back into the three choices, the current one pressed", () => {
      decided();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      const group = choices(THANKSGIVING);
      expect(within(group).getByRole("button", { name: "Closed" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(within(group).getByRole("button", { name: "Open as usual" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("pressing the current choice saves nothing, and special hours edits the rule itself", () => {
      const { props } = decided();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: `Change ${THANKSGIVING}` }));
      press(THANKSGIVING, "Closed");
      expect(props.onClose).not.toHaveBeenCalled();
      expect(props.onReopen).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Change New Year’s Eve, Thu, Dec 31" }));
      press("New Year’s Eve, Thu, Dec 31", "Special hours…");
      expect(props.onEditHours).toHaveBeenCalledWith("2026-12-31");
      expect(props.onSpecialHours).not.toHaveBeenCalled();
    });

    it("opens a date a rule this flow does not own in the day drawer", () => {
      const { props } = decided();
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      fireEvent.click(screen.getByRole("button", { name: "Change New Year’s Day, Fri, Jan 1" }));
      expect(props.onOpenDay).toHaveBeenCalledWith("2027-01-01");
      expect(screen.queryByRole("group", { name: "New Year’s Day, Fri, Jan 1" })).toBeNull();
    });

    it("lets a covering rule outrank a stale open mark", () => {
      read.decisions = [decision("2026-11-26")];
      setup({ state: stateWith(rule("2026-11-26", "closure")) });
      fireEvent.click(within(panel()).getByRole("button", { name: /Decided/ }));
      const line = screen.getByText("Thanksgiving").closest("li")!;
      expect(within(line).getByText("Closed")).toBeTruthy();
      expect(within(line).queryByText("Open as usual")).toBeNull();
    });
  });

  describe("a Host", () => {
    it("reads the decisions and what is not decided, with no choices and no Close these", () => {
      read.decisions = [decision("2026-12-24")];
      setup({ isManager: false, state: stateWith(rule("2026-11-26", "closure")) });
      expect(within(panel()).queryAllByRole("button", { name: "Closed" })).toHaveLength(0);
      expect(within(panel()).queryByRole("group")).toBeNull();
      expect(within(panel()).queryByRole("button", { name: /^Close these/ })).toBeNull();
      expect(within(panel()).queryByRole("button", { name: /^Change/ })).toBeNull();
      expect(within(panel()).getAllByText("Not decided").length).toBeGreaterThan(0);

      fireEvent.click(within(panel()).getByRole("button", { name: "Decided (2)" }));
      expect(within(panel()).getByText("Open as usual")).toBeTruthy();
      expect(within(panel()).getByText("Closed")).toBeTruthy();
      expect(within(panel()).queryByRole("button", { name: /^Change/ })).toBeNull();
    });
  });

  it("renders nothing for a country the calendar does not know", () => {
    const original = VENUE.selectedVenue;
    const view = render(
      <VenueContext
        value={
          {
            selectedVenue: { ...original, settings: { profile: { address: { country: "FR" } } } },
          } as unknown as VenueContextValue
        }
      >
        <ToastProvider>
          <UpcomingHolidays
            venueId="venue-1"
            state={stateWith()}
            today={TODAY}
            isManager
            onStale={vi.fn()}
            onOpenDay={vi.fn()}
            onClose={vi.fn()}
            onSpecialHours={vi.fn()}
            onReopen={vi.fn()}
            onEditHours={vi.fn()}
          />
        </ToastProvider>
      </VenueContext>
    );
    expect(view.container.querySelector("section")).toBeNull();
  });
});
