import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfigState,
  ClosureCallListEntry,
  ClosureSummary,
  DateRule,
} from "@mbe/types";

const summaries = vi.hoisted(() => ({ value: [] as ClosureSummary[] }));
const callList = vi.hoisted(() => ({ value: [] as ClosureCallListEntry[] }));
const reopen = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());
const previewImpact = vi.hoisted(() => vi.fn());
const createClosure = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: summaries.value, isLoading: false, error: null }),
  useClosureCallList: () => ({ data: callList.value, isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: retry, isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: previewImpact, isPending: false }),
  useCreateClosure: () => ({ mutateAsync: createClosure, isPending: false }),
}));
const revertChange = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revertChange, isPending: false }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({
  AvailabilityGuestPreview: () => <div data-testid="guest-preview" />,
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { SpecialDatesTab } from "./SpecialDatesTab.js";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";

const summary = (ruleId: string, over: Partial<ClosureSummary> = {}): ClosureSummary => ({
  ruleId,
  total: 14,
  cancelled: 14,
  sent: 11,
  rebooked: 1,
  unreachable: 2,
  refundFailed: 0,
  refundFailures: [],
  refundPending: 0,
  ...over,
});

const RULES = [
  {
    id: "xmas",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    guestMessage: "Closed for a private event.",
  },
  {
    id: "mondays",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2027-01-05",
    endsOn: "2027-03-30",
    repeat: { version: 1, weekdays: [1] },
  },
] as DateRule[];

const STATE = {
  version: 7,
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: RULES,
  },
} as unknown as AvailabilityConfigState;

function renderTab(isManager = true, state: AvailabilityConfigState = STATE) {
  return render(
    <ToastProvider>
      <main>
        <SpecialDatesTab
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          onStale={vi.fn()}
          isManager={isManager}
        />
      </main>
    </ToastProvider>
  );
}

/** Answer the "which dates" question that Edit asks on a range or repeating special-hours row. */
function pickScope(choice: string) {
  const dialog = screen.getByRole("dialog", { name: "Edit special hours" });
  fireEvent.click(within(dialog).getByRole("radio", { name: choice }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
}

describe("SpecialDatesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summaries.value = [summary("xmas")];
    callList.value = [];
    reopen.mockResolvedValue({ version: 6, changeId: "c" });
    retry.mockResolvedValue({ enqueued: 1 });
  });

  it("lists closures with Sent, Rebooked and Unreachable counts", () => {
    renderTab();
    expect(screen.getByText("Closed for a private event.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Sent 11 · Rebooked 1 · Unreachable 2")).toBeTruthy();
    expect(screen.getByText("Closed · Repeating")).toBeTruthy();
  });

  it("names each closure row's buttons with its date", () => {
    summaries.value = [summary("xmas"), summary("mondays")];
    renderTab();
    expect(screen.getByRole("button", { name: "Remove closure for Thu, Dec 24" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove closure for Tue, Jan 5 to Tue, Mar 30" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Call list for Thu, Dec 24" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Call list for Tue, Jan 5 to Tue, Mar 30" })
    ).toBeTruthy();
  });

  it("offers Add special date to a Manager only", () => {
    const { unmount } = renderTab(true);
    expect(screen.getByRole("button", { name: "Add special date" })).toBeTruthy();
    unmount();
    renderTab(false);
    expect(screen.queryByRole("button", { name: "Add special date" })).toBeNull();
  });

  it("skips one date of a repeating closure and leaves the series alone", async () => {
    saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "This and following" })).toBeTruthy();
    expect(within(dialog).getByRole("radio", { name: "All dates in the series" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const { body } = saveConfig.mock.calls[0]![0];
    expect(body.expectedVersion).toBe(7);
    expect(body.changes.remove).toEqual({});
    expect(body.changes.upsert.dateRules).toHaveLength(1);
    expect(body.changes.upsert.dateRules[0]).toMatchObject({
      kind: "skip",
      seriesId: "mondays",
      startsOn: "2027-01-11",
      endsOn: "2027-01-11",
    });
  });

  it("refuses to skip a date that is already skipped, or to edit one that has its own change", () => {
    const skip = {
      id: "skip-1",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2027-01-11",
      endsOn: "2027-01-11",
      seriesId: "mondays",
    } as DateRule;
    const state = {
      ...STATE,
      config: { ...STATE.config, dateRules: [...RULES, skip] },
    } as AvailabilityConfigState;
    renderTab(true, state);
    expect(screen.getByText(/Skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));
    expect(within(dialog).getByText("This date is already skipped.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit this date…" }));
    expect(screen.getByRole("dialog", { name: "Edit dates" })).toBeTruthy();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  describe("restoring a skipped date", () => {
    const skip = {
      id: "skip-1",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2027-01-11",
      endsOn: "2027-01-11",
      seriesId: "mondays",
    } as DateRule;
    const skipped = {
      ...STATE,
      config: { ...STATE.config, dateRules: [...RULES, skip] },
    } as AvailabilityConfigState;

    it("removes the skip row from the series row, against the loaded version", async () => {
      saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
      renderTab(true, skipped);
      fireEvent.click(screen.getByRole("button", { name: "Restore Mon, Jan 11" }));

      await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
      const { body } = saveConfig.mock.calls[0]![0];
      expect(body.expectedVersion).toBe(7);
      expect(body.changes).toEqual({ upsert: {}, remove: { dateRules: ["skip-1"] } });
      expect(
        await screen.findByText("Mon, Jan 11 restored. The series closes it again.")
      ).toBeTruthy();
    });

    it("is offered in the Edit dates dialog when the date is already skipped", async () => {
      saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
      renderTab(true, skipped);
      fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Restore this date" }));

      await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
      expect(saveConfig.mock.calls[0]![0].body.changes.remove).toEqual({ dateRules: ["skip-1"] });
    });

    it("shows the stranded refusal and restores nothing", async () => {
      saveConfig.mockRejectedValue({
        problemDetails: {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "x",
          code: "stranded-bookings",
          reservations: [
            { id: "r1", startTime: "2027-01-11T18:00:00Z", partySize: 2, reason: "closed" },
          ],
        },
      });
      renderTab(true, skipped);
      fireEvent.click(screen.getByRole("button", { name: "Restore Mon, Jan 11" }));

      expect(await screen.findByText(/would be left without service/)).toBeTruthy();
      expect(screen.queryByText(/restored/)).toBeNull();
    });

    it("drops the skipped-date alert when the date changes, so a one-date edit is never deleted", () => {
      const oneDateEdit = {
        id: "edit-1",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2027-01-18",
        endsOn: "2027-01-18",
        seriesId: "mondays",
      } as DateRule;
      const both = {
        ...STATE,
        config: { ...STATE.config, dateRules: [...RULES, skip, oneDateEdit] },
      } as AvailabilityConfigState;
      renderTab(true, both);
      fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));
      expect(within(dialog).getByRole("button", { name: "Restore this date" })).toBeTruthy();

      fireEvent.click(within(dialog).getByRole("combobox"));
      fireEvent.click(document.querySelector('[data-date="2027-01-18"]')!);

      expect(within(dialog).queryByRole("button", { name: "Restore this date" })).toBeNull();
      expect(within(dialog).queryByText("This date is already skipped.")).toBeNull();
      expect(saveConfig).not.toHaveBeenCalled();
    });

    it("is hidden from a Host", () => {
      renderTab(false, skipped);
      expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
    });
  });

  describe("special-hours rows", () => {
    const hours = {
      id: "nye",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-31",
      endsOn: "2026-12-31",
      payload: { version: 1, services: [] },
    } as unknown as DateRule;
    const withHours = {
      ...STATE,
      config: { ...STATE.config, dateRules: [...RULES, hours] },
    } as AvailabilityConfigState;

    const removeHours = () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove special hours for Thu, Dec 31" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    };

    it("removes through the config save and offers Undo of that change", async () => {
      saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
      revertChange.mockResolvedValue({ version: 9, changeId: "chg-9" });
      renderTab(true, withHours);
      removeHours();

      await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
      const { body } = saveConfig.mock.calls[0]![0];
      expect(body.expectedVersion).toBe(7);
      expect(body.changes).toEqual({ upsert: {}, remove: { dateRules: ["nye"] } });

      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      await waitFor(() =>
        expect(revertChange).toHaveBeenCalledWith({
          venueId: "venue-1",
          changeId: "chg-8",
          expectedVersion: 8,
        })
      );
    });

    it("refuses a removal that would strand bookings, with no Undo and no cancels", async () => {
      saveConfig.mockRejectedValue({
        problemDetails: {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "x",
          code: "stranded-bookings",
          reservations: [
            { id: "r1", startTime: "2026-12-31T18:00:00Z", partySize: 2, reason: "closed" },
          ],
        },
      });
      renderTab(true, withHours);
      removeHours();

      expect(await screen.findByText(/would be left without service/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("shows one range per service, so a gap between services stays visible", () => {
      const service = (opensAt: number, closesAt: number) => ({
        venueServiceId: "vs",
        opensAt,
        lastSeatingAt: closesAt - 60,
        closesAt,
        seating: "regular",
        bookingTypes: ["online"],
      });
      const dinner = {
        ...hours,
        payload: { version: 1, services: [service(1080, 1500), service(660, 900)] },
        // Listed out of order: the row still reads earliest first.
      } as unknown as DateRule;
      renderTab(true, {
        ...STATE,
        config: { ...STATE.config, dateRules: [dinner] },
      } as AvailabilityConfigState);
      expect(
        screen.getByText("Special hours · 11:00 AM – 3:00 PM, 6:00 PM – 1:00 AM (next day)")
      ).toBeTruthy();
    });

    it("edits the hours in the day editor", () => {
      renderTab(true, withHours);
      fireEvent.click(screen.getByRole("button", { name: "Edit hours for Thu, Dec 31" }));
      expect(screen.getByRole("dialog", { name: /Thursday, December 31/ })).toBeTruthy();
    });

    describe("rows that cover more than one date", () => {
      const rangeRule = {
        id: "holidays",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-12-20",
        endsOn: "2027-01-01",
        payload: { version: 1, services: [] },
      } as unknown as DateRule;
      const fridays = {
        id: "fridays",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-09-04",
        endsOn: null,
        repeat: { version: 1, weekdays: [5] },
        payload: { version: 1, services: [] },
      } as unknown as DateRule;
      const stateWith = (rule: DateRule) =>
        ({
          ...STATE,
          config: { ...STATE.config, dateRules: [rule] },
        }) as AvailabilityConfigState;

      it("asks which dates Edit reaches, and names the range when removing it", async () => {
        saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
        renderTab(true, stateWith(rangeRule));
        fireEvent.click(
          screen.getByRole("button", { name: "Edit special hours for Sun, Dec 20 to Fri, Jan 1" })
        );
        pickScope("Only Sun, Dec 20");
        expect(screen.getByRole("dialog", { name: /Sunday, December 20/ })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        fireEvent.click(
          screen.getByRole("button", { name: "Remove special hours for Sun, Dec 20 to Fri, Jan 1" })
        );
        const dialog = screen.getByRole("dialog");
        expect(
          within(dialog).getByText("Remove special hours for Sun, Dec 20 to Fri, Jan 1?")
        ).toBeTruthy();
        expect(within(dialog).getByText(/every date of it/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

        await waitFor(() =>
          expect(saveConfig.mock.calls[0]![0].body.changes.remove).toEqual({
            dateRules: ["holidays"],
          })
        );
        expect(
          await screen.findByText("Special hours removed for Sun, Dec 20 to Fri, Jan 1")
        ).toBeTruthy();
      });

      it("words an open-ended hours rule as 'from <date> on', not 'until reopened'", () => {
        renderTab(true, stateWith(fridays));
        expect(screen.getByText("From Fri, Sep 4 on")).toBeTruthy();
        expect(screen.queryByText(/until reopened/)).toBeNull();
      });

      it("offers no Edit, only Remove, when no covered date is left before the rule ends", () => {
        const ended = { ...fridays, startsOn: "2026-11-27", endsOn: "2026-12-02" } as DateRule;
        renderTab(true, stateWith(ended));
        expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
        expect(screen.getByRole("button", { name: /Remove special hours/ })).toBeTruthy();
      });

      it("names the series when removing a repeating rule", async () => {
        saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
        renderTab(true, stateWith(fridays));
        expect(
          screen.getByRole("button", { name: "Edit special hours every Friday" })
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Remove special hours every Friday" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("Remove special hours every Friday?")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

        expect(await screen.findByText("Special hours removed every Friday")).toBeTruthy();
      });

      describe("scope choice (F-SER)", () => {
        // The same rules with real services, so the day editor has hours to change.
        const realRule = (rule: DateRule) =>
          ({
            version: 7,
            source: "rows",
            config: fixtureConfig({
              ...rule,
              payload: (EARLY_DINNER as never)["payload"],
            } as DateRule),
          }) as AvailabilityConfigState;
        const repeating = realRule(fridays);
        const ranged = realRule({
          ...rangeRule,
          startsOn: "2026-11-20",
          endsOn: "2026-12-20",
        } as DateRule);

        /** Edit the hours in the opened day drawer (Lunch removed) and save. */
        const shortenAndSave = () => {
          fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
          fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
          fireEvent.click(screen.getByRole("button", { name: /^Save \d+ dates?$/ }));
        };
        const sent = () => saveConfig.mock.calls.at(-1)![0].body;

        beforeEach(() => {
          saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
        });

        it("keeps plain Edit on a single-date row", () => {
          renderTab(true, realRule(hours));
          fireEvent.click(screen.getByRole("button", { name: "Edit hours for Thu, Dec 31" }));
          expect(screen.queryByRole("dialog", { name: "Edit special hours" })).toBeNull();
        });

        it("hides the choice from a Host", () => {
          renderTab(false, repeating);
          expect(screen.queryByRole("button", { name: /Edit special hours/ })).toBeNull();
        });

        it("all dates leaves the past as it was and edits the rest, against the loaded version", async () => {
          renderTab(true, repeating);
          fireEvent.click(screen.getByRole("button", { name: "Edit special hours every Friday" }));
          pickScope("All dates");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          expect(sent().expectedVersion).toBe(7);
          expect(sent().scopeConflicts).toBe("keep");
          const [ended, created] = sent().changes.upsert.dateRules;
          // Today is Dec 1: the dates before it keep their hours.
          expect(ended).toMatchObject({
            id: "fridays",
            startsOn: "2026-09-04",
            endsOn: "2026-11-30",
          });
          expect(created).toMatchObject({ startsOn: "2026-12-01", endsOn: null });
          expect(
            created.payload.services.map((s: { venueServiceId: string }) => s.venueServiceId)
          ).toEqual(["vs-dinner"]);
        });

        it("all dates edits a rule that has not started yet in place", async () => {
          renderTab(true, realRule(rangeRule));
          fireEvent.click(
            screen.getByRole("button", {
              name: "Edit special hours for Sun, Dec 20 to Fri, Jan 1",
            })
          );
          pickScope("All dates");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          const rows = sent().changes.upsert.dateRules;
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            id: "holidays",
            startsOn: "2026-12-20",
            endsOn: "2027-01-01",
          });
        });

        it("asks for a date on Only and This and following, not on All dates", () => {
          renderTab(true, repeating);
          fireEvent.click(screen.getByRole("button", { name: "Edit special hours every Friday" }));
          const dialog = screen.getByRole("dialog", { name: "Edit special hours" });
          expect(within(dialog).getByText("Date")).toBeTruthy();
          fireEvent.click(within(dialog).getByRole("radio", { name: "All dates" }));
          expect(within(dialog).queryByText("Date")).toBeNull();
        });

        describe("a date inside the range with its own hours", () => {
          const override = {
            ...(EARLY_DINNER as object),
            id: "dec25",
            startsOn: "2026-12-25",
            endsOn: "2026-12-25",
          } as DateRule;
          const withOverride = {
            version: 7,
            source: "rows",
            config: fixtureConfig(
              {
                ...rangeRule,
                endsOn: "2027-01-02",
                payload: (EARLY_DINNER as never)["payload"],
              } as DateRule,
              override
            ),
          } as AvailabilityConfigState;
          const openRange = () => {
            renderTab(true, withOverride);
            fireEvent.click(
              screen.getByRole("button", {
                name: "Edit special hours for Sun, Dec 20 to Sat, Jan 2",
              })
            );
            pickScope("All dates");
            fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
            fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
          };

          it("tells the Manager, counts only the dates that change, and keeps theirs", async () => {
            openRange();
            expect(
              screen.getByText("1 date in this scope already has its own changes")
            ).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Save 13 dates" }));

            await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
            expect(sent().scopeConflicts).toBe("keep");
          });

          it("replaces them when asked, counting every date", async () => {
            openRange();
            fireEvent.click(screen.getByRole("radio", { name: "Replace them" }));
            fireEvent.click(screen.getByRole("button", { name: "Save 14 dates" }));

            await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
            expect(sent().scopeConflicts).toBe("replace");
          });
        });

        it("this and following ends a repeating rule the day before and starts a new one", async () => {
          renderTab(true, repeating);
          fireEvent.click(screen.getByRole("button", { name: "Edit special hours every Friday" }));
          pickScope("This and following from Fri, Dec 4");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          const [ended, created] = sent().changes.upsert.dateRules;
          expect(ended).toMatchObject({ id: "fridays", endsOn: "2026-12-03" });
          expect(created).toMatchObject({
            startsOn: "2026-12-04",
            endsOn: null,
            repeat: fridays.repeat,
          });
          expect(created.id).not.toBe("fridays");
        });

        const editRange = () =>
          fireEvent.click(
            screen.getByRole("button", {
              name: "Edit special hours for Fri, Nov 20 to Sun, Dec 20",
            })
          );

        it("this and following on a range ends it the day before and starts the rest", async () => {
          renderTab(true, ranged);
          editRange();
          pickScope("This and following from Tue, Dec 1");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          const [ended, created] = sent().changes.upsert.dateRules;
          expect(ended).toMatchObject({
            id: "holidays",
            startsOn: "2026-11-20",
            endsOn: "2026-11-30",
          });
          expect(created).toMatchObject({ startsOn: "2026-12-01", endsOn: "2026-12-20" });
        });

        it("all dates on a range that has begun keeps its past dates as they were", async () => {
          renderTab(true, ranged);
          editRange();
          pickScope("All dates");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          const [ended, created] = sent().changes.upsert.dateRules;
          expect(ended).toMatchObject({
            id: "holidays",
            startsOn: "2026-11-20",
            endsOn: "2026-11-30",
          });
          expect(created).toMatchObject({ startsOn: "2026-12-01", endsOn: "2026-12-20" });
        });

        it("only this date leaves the rule alone and writes a one-date rule", async () => {
          renderTab(true, repeating);
          fireEvent.click(screen.getByRole("button", { name: "Edit special hours every Friday" }));
          pickScope("Only Fri, Dec 4");
          shortenAndSave();

          await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
          const rows = sent().changes.upsert.dateRules;
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({ startsOn: "2026-12-04", endsOn: "2026-12-04" });
          expect(rows[0].id).not.toBe("fridays");
        });

        it("refuses an edit that would strand bookings, naming the cost and cancelling nothing", async () => {
          saveConfig.mockRejectedValue({
            problemDetails: {
              type: "about:blank",
              title: "Conflict",
              status: 409,
              detail: "x",
              code: "stranded-bookings",
              reservations: [
                { id: "r1", startTime: "2026-12-04T18:00:00Z", partySize: 2, reason: "closed" },
              ],
            },
          });
          renderTab(true, repeating);
          fireEvent.click(screen.getByRole("button", { name: "Edit special hours every Friday" }));
          pickScope("All dates");
          shortenAndSave();

          expect(
            await screen.findByText(
              /1 booking would fall outside the new hours.*Nothing was cancelled/
            )
          ).toBeTruthy();
          expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
        });
      });
    });

    it("hides Edit and Remove from a Host", () => {
      renderTab(false, withHours);
      expect(screen.queryByRole("button", { name: /Edit hours/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Remove special hours/ })).toBeNull();
    });
  });

  describe("reopening", () => {
    it("offers Undo when no guests were told", async () => {
      revertChange.mockResolvedValue({ version: 8, changeId: "c9" });
      renderTab();
      fireEvent.click(screen.getByRole("button", { name: "Remove closure for Thu, Dec 24" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("checkbox"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));

      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      await waitFor(() =>
        expect(revertChange).toHaveBeenCalledWith({
          venueId: "venue-1",
          changeId: "c",
          expectedVersion: 6,
        })
      );
    });

    it("offers no Undo once the cancelled guests were told", async () => {
      renderTab();
      fireEvent.click(screen.getByRole("button", { name: "Remove closure for Thu, Dec 24" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reopen" }));

      expect(await screen.findByText("Thu, Dec 24 reopened")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });
  });

  it("names the closure, not the hours, when a series edit would strand bookings", async () => {
    saveConfig.mockRejectedValue({
      problemDetails: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "x",
        code: "stranded-bookings",
        reservations: [
          { id: "r1", startTime: "2027-01-11T18:00:00Z", partySize: 2, reason: "closed" },
        ],
      },
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this date" }));

    expect(await screen.findByText(/would be left without service by this change/)).toBeTruthy();
    expect(screen.queryByText(/outside the new hours/)).toBeNull();
  });

  it("this and following ends the series before the date and starts a new one", async () => {
    saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "This and following" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const rows = saveConfig.mock.calls[0]![0].body.changes.upsert.dateRules as DateRule[];
    expect(rows.find((r) => r.id === "mondays")?.endsOn).toBe("2027-01-10");
    expect(rows.find((r) => r.id !== "mondays")).toMatchObject({
      kind: "closure",
      startsOn: "2027-01-11",
    });
  });

  describe("a series edit that closes new dates", () => {
    const DATE = "2027-01-12";
    const impact = {
      reservations: 2,
      covers: 6,
      depositsHeld: 0,
      groups: [
        {
          groupKey: `${DATE}:closed`,
          date: DATE,
          kind: "closed",
          covers: 6,
          depositsHeld: 0,
          reservations: ["r1", "r2"].map((id) => ({
            id,
            startTime: `${DATE}T18:00:00Z`,
            endTime: `${DATE}T19:30:00Z`,
            partySize: 3,
            guestName: id,
            deposit: null,
            runsIntoClosure: false,
          })),
        },
      ],
    };
    const addTuesdayFromHere = () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: "This and following" }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Tue" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    };

    it("shows Step 2 for the bookings it would strand, then saves through the closure command", async () => {
      previewImpact.mockResolvedValue(impact);
      createClosure.mockResolvedValue({
        ruleId: "new",
        version: 8,
        changeId: "c",
        outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 },
      });
      renderTab();
      addTuesdayFromHere();

      await screen.findByText(/2 reservations/);
      const dialog = screen.getByRole("dialog");
      expect(saveConfig).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 2" }));

      await waitFor(() => expect(createClosure).toHaveBeenCalledTimes(1));
      const { body } = createClosure.mock.calls[0]![0];
      expect(body.decisions).toEqual([
        { groupKey: `${DATE}:closed`, action: "cancel", reservationIds: expect.any(Array) },
      ]);
      expect(body.rule).toMatchObject({
        kind: "closure",
        startsOn: "2027-01-11",
        endsOn: "2027-03-30",
      });
      expect(body.rule.repeat.weekdays).toEqual([1, 2]);
      expect(body.alongside.upsert.find((r: DateRule) => r.id === "mondays")?.endsOn).toBe(
        "2027-01-10"
      );
      expect(previewImpact.mock.calls[0]![0]).toMatchObject({
        venueId: "venue-1",
        rule: body.rule,
        alongside: body.alongside,
      });
      expect(saveConfig).not.toHaveBeenCalled();
    });

    it("saves as a plain config save when no booking is affected", async () => {
      previewImpact.mockResolvedValue({ reservations: 0, covers: 0, depositsHeld: 0, groups: [] });
      saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
      renderTab();
      addTuesdayFromHere();

      await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
      expect(createClosure).not.toHaveBeenCalled();
    });

    it("does not ask Step 2 for an edit that only shrinks the series", async () => {
      saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
      const weekends = {
        id: "weekends",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2027-01-02",
        endsOn: "2027-03-30",
        repeat: { version: 1, weekdays: [5, 6] },
      } as DateRule;
      renderTab(true, { ...STATE, config: { ...STATE.config, dateRules: [weekends] } });
      fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: "All dates in the series" }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sat" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
      expect(previewImpact).not.toHaveBeenCalled();
      expect(createClosure).not.toHaveBeenCalled();
    });
  });

  it("filters to repeating closures", () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Repeating" }));
    expect(screen.queryByText("Sent 11 · Rebooked 1 · Unreachable 2")).toBeNull();
    expect(screen.getByText("Closed · Repeating")).toBeTruthy();
  });

  it("shows the empty state when nothing matches", () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Past" }));
    expect(screen.getByText("No special dates")).toBeTruthy();
  });

  it("reopens, telling the cancelled guests by default", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Remove closure for Thu, Dec 24" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: /Tell the cancelled guests/ })
    ).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith({
        venueId: "venue-1",
        ruleId: "xmas",
        tellCancelledGuests: true,
      })
    );
  });

  it("reopens without telling guests when the box is cleared", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Remove closure for Thu, Dec 24" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith(expect.objectContaining({ tellCancelledGuests: false }))
    );
  });

  it("retries refunds of a closure that still has a failed one", async () => {
    summaries.value = [summary("xmas", { refundFailed: 1 })];
    renderTab();
    expect(screen.getByText("Refund failed (1)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry refunds" }));

    await waitFor(() => expect(retry).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "xmas" }));
  });

  it("names each failed refund with its guest and amount beside Retry", () => {
    summaries.value = [
      summary("xmas", {
        refundFailed: 2,
        refundFailures: [
          { outcomeId: "o-1", guestName: "Rivera", amountCents: 4000, currency: "usd" },
          { outcomeId: "o-2", guestName: null, amountCents: null, currency: null },
        ],
      }),
    ];
    renderTab();
    expect(screen.getByText("Refund failed: Rivera ($40.00), Unnamed guest")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry refunds" })).toBeTruthy();
  });

  it("keeps a retry for a Tonight close-early whose rule ended", async () => {
    summaries.value = [summary("tonight-1", { refundPending: 2 })];
    renderTab();
    expect(screen.getByText("Earlier closure")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry refunds" }));

    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "tonight-1" })
    );
  });

  it("offers the call list only where guests are unreachable, and lists just those guests", () => {
    summaries.value = [summary("xmas", { unreachable: 1 }), summary("mondays", { unreachable: 0 })];
    callList.value = [
      {
        outcomeId: "o-2",
        reservationId: "r-2",
        guestName: "Rivera",
        partySize: 4,
        startTime: "2026-12-25T01:30:00.000Z",
        guestPhone: "+15555550100",
      },
    ];
    renderTab();
    const buttons = screen.getAllByRole("button", { name: "Call list for Thu, Dec 24" });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rivera")).toBeTruthy();
    expect(within(dialog).getByText("+15555550100")).toBeTruthy();
    expect(within(dialog).getAllByRole("row")).toHaveLength(2);
  });

  it("prints the call list from a chrome-free copy, only while the dialog is open", () => {
    summaries.value = [summary("xmas", { unreachable: 1 })];
    callList.value = [
      {
        outcomeId: "o-2",
        reservationId: "r-2",
        guestName: "Rivera",
        partySize: 4,
        startTime: "2026-12-25T01:30:00.000Z",
        guestPhone: "+15555550100",
      },
    ];
    renderTab();
    expect(document.querySelector("[data-call-list-print]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Call list for Thu, Dec 24" }));

    const printCopy = document.querySelector("[data-call-list-print]")!;
    expect(printCopy.parentElement).toBe(document.body);
    expect(within(printCopy as HTMLElement).getByText("Rivera")).toBeTruthy();
    expect(document.body.hasAttribute("data-printing-call-list")).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(document.querySelector("[data-call-list-print]")).toBeNull();
    expect(document.body.hasAttribute("data-printing-call-list")).toBe(false);
  });

  it("hides Remove and Retry from a Host but keeps the call list", () => {
    summaries.value = [summary("xmas", { refundFailed: 1 })];
    renderTab(false);
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry refunds" })).toBeNull();
    expect(screen.getByRole("button", { name: "Call list for Thu, Dec 24" })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = renderTab();
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
