import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import type * as Rialto from "@mattbutlerengineering/rialto";
import { applyChanges, resolveDay } from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  AvailabilityConfigState,
  DateRule,
} from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const previewed = vi.hoisted(() => vi.fn());

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
}));
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
// What the guest preview is handed is what the Manager is shown before the press.
vi.mock("./AvailabilityGuestPreview.js", () => ({
  AvailabilityGuestPreview: (props: unknown) => {
    previewed(props);
    return null;
  },
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
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

import { openCopyFrom, openCopyToOtherDays } from "../../test/copy-hours.js";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

const SATURDAY = "2026-10-31";
const NEXT_FRIDAY = "2026-11-06";

/** Dinner is seated every 30 minutes and booked by phone only, so a copy that drops either shows. */
function venueConfig(...rules: DateRule[]): AvailabilityConfig {
  const base = fixtureConfig(...rules);
  return {
    ...base,
    scheduleServices: base.scheduleServices.map((s) =>
      s.venueServiceId === "vs-dinner"
        ? { ...s, seating: { version: 1, interval: 30 }, bookingTypes: ["phone"] }
        : s
    ),
  };
}

const withSummer = (config: AvailabilityConfig): AvailabilityConfig => ({
  ...config,
  schedules: [
    ...config.schedules,
    { id: "summer", name: "Summer hours", kind: "alternate", isRegular: false },
  ],
});

/** Special hours of a date's own: Dinner ends an hour early. */
const ownHours = (id: string, date: string): DateRule => ({
  ...EARLY_DINNER,
  id,
  startsOn: date,
  endsOn: date,
});

/** Next Friday's own hours, the source of "another day's hours": Lunch only, every 20 minutes. */
const NEXT_FRIDAY_LUNCH: DateRule = {
  id: "next-friday",
  kind: "special_hours",
  targetKind: "venue",
  startsOn: NEXT_FRIDAY,
  endsOn: NEXT_FRIDAY,
  payload: {
    version: 1,
    services: [
      {
        venueServiceId: "vs-lunch",
        opensAt: 660,
        lastSeatingAt: 780,
        closesAt: 840,
        seating: { version: 1, interval: 20 },
        bookingTypes: ["online"],
      },
    ],
  },
};

interface SentBody {
  readonly expectedVersion: number;
  readonly scopeConflicts: string;
  readonly changes: AvailabilityConfigChanges;
}

const sentBody = () => (save.mock.calls[0]![0] as { venueId: string; body: SentBody }).body;

/** A rule's hours as [service, opens, last seating, closes, seat every, booked by]. */
const hoursOf = (rule: DateRule | undefined) =>
  (rule?.kind === "special_hours" ? rule.payload.services : []).map((s) => [
    s.venueServiceId,
    s.opensAt,
    s.lastSeatingAt,
    s.closesAt,
    "interval" in s.seating ? s.seating.interval : null,
    s.bookingTypes,
  ]);

/** Changes without the ids a save and a preview each make up. */
const withoutIds = (changes: AvailabilityConfigChanges) => ({
  ...changes,
  upsert: {
    ...changes.upsert,
    dateRules: (changes.upsert.dateRules ?? []).map(({ id: _id, ...rule }) => rule),
  },
});

function renderDrawer(config: AvailabilityConfig) {
  const onFinished = vi.fn();
  const state: AvailabilityConfigState = { version: 7, source: "rows", config };
  render(
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
          onFinished,
          onStale: vi.fn(),
        }}
      />
    </main>
  );
  return { onFinished };
}

const undoOffers = () =>
  toast.mock.calls.filter(([t]) => (t as { action?: { label: string } }).action?.label === "Undo");

/**
 * What each way of copying hours writes (availability-hub A0.3, #8691). These pin the data, not
 * the buttons: they passed on the two separate drawer actions and pass on the one that replaced
 * them, through the same `test/copy-hours.ts` openers.
 */
describe("AvailabilityDayDrawer: what copying hours writes", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg-1" });
  });

  describe("to other days, this week", () => {
    async function copyToSaturday(config: AvailabilityConfig) {
      const view = renderDrawer(config);
      const dialog = await openCopyToOtherDays();
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Saturday" }));
      return { ...view, dialog };
    }

    it("says which dates take which hours before anything is saved", async () => {
      const { dialog } = await copyToSaturday(venueConfig());
      expect(
        within(dialog).getByText(/^Sat will use Friday’s hours \(.*Dinner.*\) on Sat, Oct 31\.$/)
      ).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
    });

    it("writes special hours on that one date, with the seating and booking values, and no regular hours", async () => {
      const { dialog } = await copyToSaturday(venueConfig());
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const body = sentBody();
      expect(body.expectedVersion).toBe(7);
      expect(body.scopeConflicts).toBe("replace");
      expect(Object.keys(body.changes.upsert)).toEqual(["dateRules"]);
      expect(body.changes.remove).toEqual({});
      const rules = body.changes.upsert.dateRules ?? [];
      expect(rules.map((r) => [r.kind, r.startsOn, r.endsOn, r.repeat ?? null])).toEqual([
        ["special_hours", SATURDAY, SATURDAY, null],
      ]);
      expect(hoursOf(rules[0])).toEqual([
        ["vs-lunch", 690, 840, 900, 15, ["online", "phone"]],
        ["vs-dinner", 1020, 1260, 1380, 30, ["phone"]],
      ]);
    });

    it("replaces the special hours a date already has, leaving one rule for it", async () => {
      const config = venueConfig(ownHours("own-sat", SATURDAY));
      const { dialog } = await copyToSaturday(config);
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const next = applyChanges(config, sentBody().changes, "2026-10-28T00:00:00.000Z");
      expect(next.dateRules.filter((r) => r.startsOn === SATURDAY)).toHaveLength(1);
      const saturday = resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, SATURDAY);
      expect(saturday.services.map((s) => [s.name, s.closesAt])).toEqual([
        ["Lunch", 900],
        ["Dinner", 1380],
      ]);
    });

    it("offers Undo for the save, naming the date", async () => {
      const { dialog } = await copyToSaturday(venueConfig());
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      await waitFor(() => expect(undoOffers()).toHaveLength(1));
      expect((undoOffers()[0]![0] as { title: string }).title).toBe(
        "Copied Friday’s hours to Sat, Oct 31"
      );
    });

    it("shows a refused save in the dialog, which stays open with no Undo", async () => {
      save.mockRejectedValue(new Error("Network down"));
      const { dialog } = await copyToSaturday(venueConfig());
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/\S/);
      expect(dialog).toBeInTheDocument();
      expect(undoOffers()).toHaveLength(0);
    });

    it("Every week… saves nothing itself: it opens the regular hours form with the days filled in", async () => {
      const { dialog } = await copyToSaturday(venueConfig());
      fireEvent.click(within(dialog).getByRole("button", { name: "Every week…" }));
      expect(await screen.findByRole("dialog", { name: /regular week/i })).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("from another day, where the venue has one set of hours", () => {
    async function useNextFriday(config: AvailabilityConfig) {
      const view = renderDrawer(config);
      const dialog = await openCopyFrom(/Use another day/);
      fireEvent.change(within(dialog).getByLabelText("Copy hours from"), {
        target: { value: NEXT_FRIDAY },
      });
      return { ...view, dialog };
    }

    it("previews the very change it then saves: special hours on this date only", async () => {
      const { dialog, onFinished } = await useNextFriday(venueConfig(NEXT_FRIDAY_LUNCH));
      const shown = previewed.mock.calls.at(-1)![0] as {
        changes: AvailabilityConfigChanges;
        scopeConflicts: string;
        dates: string[];
      };
      expect(shown.dates).toEqual([FIXTURE_DATE]);
      expect(shown.scopeConflicts).toBe("replace");
      expect(save).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "Apply to 1 date" }));
      await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
      const body = sentBody();
      expect(body.expectedVersion).toBe(7);
      expect(body.scopeConflicts).toBe("replace");
      expect(withoutIds(body.changes)).toEqual(withoutIds(shown.changes));
      expect(Object.keys(body.changes.upsert)).toEqual(["dateRules"]);
      const rules = body.changes.upsert.dateRules ?? [];
      expect(rules.map((r) => [r.kind, r.startsOn, r.endsOn, r.repeat ?? null])).toEqual([
        ["special_hours", FIXTURE_DATE, FIXTURE_DATE, null],
      ]);
      // The other day's seating and booking values come with its times.
      expect(hoursOf(rules[0])).toEqual([["vs-lunch", 660, 780, 840, 20, ["online"]]]);
      expect(undoOffers()).toHaveLength(1);
    });

    it("removes the special hours this date already has", async () => {
      const config = venueConfig(NEXT_FRIDAY_LUNCH, ownHours("own-fri", FIXTURE_DATE));
      const { dialog } = await useNextFriday(config);
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply to 1 date" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(sentBody().changes.remove).toEqual({ dateRules: ["own-fri"] });
      const next = applyChanges(config, sentBody().changes, "2026-10-28T00:00:00.000Z");
      expect(next.dateRules.filter((r) => r.startsOn === FIXTURE_DATE)).toHaveLength(1);
      expect(next.dateRules.find((r) => r.id === "next-friday")).toEqual(NEXT_FRIDAY_LUNCH);
    });

    it("shows a refused save in the dialog and does not close the drawer", async () => {
      save.mockRejectedValue(new Error("Network down"));
      const { dialog, onFinished } = await useNextFriday(venueConfig(NEXT_FRIDAY_LUNCH));
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply to 1 date" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/\S/);
      expect(onFinished).not.toHaveBeenCalled();
      expect(undoOffers()).toHaveLength(0);
    });
  });

  describe("from other hours, where the venue has two sets", () => {
    it("writes a rule for this date only that follows those hours, replacing its special hours", async () => {
      const config = withSummer(venueConfig(ownHours("own-fri", FIXTURE_DATE)));
      const { onFinished } = renderDrawer(config);
      const dialog = await openCopyFrom(/Use a schedule/);
      fireEvent.click(within(dialog).getByRole("combobox", { name: "Schedule" }));
      fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
      expect(save).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply to 1 date" }));
      await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
      const body = sentBody();
      expect(body.scopeConflicts).toBe("replace");
      expect(Object.keys(body.changes.upsert)).toEqual(["dateRules"]);
      expect(body.changes.upsert.dateRules).toMatchObject([
        {
          kind: "use_schedule",
          targetKind: "venue",
          useScheduleId: "summer",
          startsOn: FIXTURE_DATE,
          endsOn: FIXTURE_DATE,
        },
      ]);
      expect(body.changes.remove).toEqual({ dateRules: ["own-fri"] });
      expect(undoOffers()).toHaveLength(1);
    });
  });
});
