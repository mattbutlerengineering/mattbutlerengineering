import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
// The preview has its own tests; here it never answers.
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
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
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { CopyDayAction } from "./CopyDayAction.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/** Friday Oct 30, 2026 is the copied day; today is Wednesday Oct 28 (Mon Oct 26 is past). */
const TODAY = "2026-10-28";

const stateOf = (config: AvailabilityConfig): AvailabilityConfigState => ({
  config,
  version: 7,
  source: "rows",
});

function renderCopy(config: AvailabilityConfig = fixtureConfig()) {
  render(
    <main>
      <CopyDayAction
        venueId="venue-1"
        state={stateOf(config)}
        timezone={FIXTURE_TIMEZONE}
        date={FIXTURE_DATE}
        day={resolveFixtureDay()}
        today={TODAY}
        onStale={vi.fn()}
      />
    </main>
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
  return screen.getByRole("dialog", { name: /Copy .* to other days/ });
}

/** The chips are named in full (as in the week form); the sentences use the short names. */
const LONG: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
const chip = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole("checkbox", { name: LONG[name] });
const pick = (dialog: HTMLElement, ...names: string[]) =>
  names.forEach((name) => fireEvent.click(chip(dialog, name)));

/** The same hours as the copied Friday, as one-off special hours on `date`. */
const sameAsFriday = (date: string): DateRule => ({
  kind: "special_hours",
  targetKind: "venue",
  id: `same-${date}`,
  startsOn: date,
  endsOn: date,
  payload: {
    version: 1,
    services: [
      {
        venueServiceId: "vs-lunch",
        opensAt: 690,
        lastSeatingAt: 840,
        closesAt: 900,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
      {
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1380,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
    ],
  },
});

const HOURS = "Lunch 11:30 AM–3:00 PM, last seating 2:00 PM";

describe("Copy to other days", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("has no From, Until or date count", () => {
    const dialog = renderCopy();
    expect(within(dialog).queryByLabelText("From")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Until")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/future dates?/)).not.toBeInTheDocument();
  });

  it("shows the copied weekday ticked and unchangeable, even under Every day", () => {
    const dialog = renderCopy();
    const friday = chip(dialog, "Fri");
    expect(friday).toBeChecked();
    expect(friday).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Every day" }));
    expect(chip(dialog, "Sat")).toBeChecked();
    expect(friday).toBeChecked();
  });

  it("says why nothing can be copied until a day is chosen", () => {
    const dialog = renderCopy();
    expect(within(dialog).getByText("Choose at least one day to copy to.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  describe("Just this week", () => {
    it("is the primary, and its consequence names the days, hours and dates", () => {
      const dialog = renderCopy();
      pick(dialog, "Sat", "Sun");
      expect(
        within(dialog).getByText(
          new RegExp(
            "^Sat and Sun will use Friday’s hours \\(.*\\) on Sat, Oct 31 and Sun, Nov 1\\.$"
          )
        )
      ).toBeInTheDocument();
      expect(within(dialog).getByText(new RegExp(HOURS))).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Copy to Sat and Sun" })).toBeEnabled();
    });

    it("saves one single-date special-hours rule per date, with no repeat", async () => {
      const dialog = renderCopy();
      pick(dialog, "Sat", "Sun");
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat and Sun" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const sent = save.mock.calls[0]![0] as {
        body: { changes: { upsert: { dateRules: DateRule[] } } };
      };
      const rules = sent.body.changes.upsert.dateRules;
      expect(rules.map((r) => [r.kind, r.startsOn, r.endsOn])).toEqual([
        ["special_hours", "2026-10-31", "2026-10-31"],
        ["special_hours", "2026-11-01", "2026-11-01"],
      ]);
      expect(rules.every((r) => r.repeat == null)).toBe(true);
    });

    it("skips a weekday that has already passed this week, and says so", async () => {
      const dialog = renderCopy();
      pick(dialog, "Mon", "Sat");
      expect(within(dialog).getByText("Mon has already passed this week.")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const sent = save.mock.calls[0]![0] as {
        body: { changes: { upsert: { dateRules: DateRule[] } } };
      };
      expect(sent.body.changes.upsert.dateRules.map((r) => r.startsOn)).toEqual(["2026-10-31"]);
    });

    it("cannot copy to weekdays that are all past, and says so", () => {
      const dialog = renderCopy();
      pick(dialog, "Mon");
      expect(
        within(dialog).getByText("Those days have already passed this week.")
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Copy" })).toBeDisabled();
    });

    it("names the dates in the toast, never a count", async () => {
      const dialog = renderCopy();
      pick(dialog, "Sat", "Sun");
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat and Sun" }));
      await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
      expect(toast.mock.calls[0]![0].title).toBe(
        "Copied Friday’s hours to Sat, Oct 31 and Sun, Nov 1"
      );
    });

    it("skips and names a day that already has the hours, copying to the others", async () => {
      const dialog = renderCopy(fixtureConfig(sameAsFriday("2026-11-01")));
      pick(dialog, "Sat", "Sun");
      expect(within(dialog).getByText("Sun already has these hours.")).toBeInTheDocument();
      expect(within(dialog).getByText(/^Sat will use Friday’s hours/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Copy to Sat" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const sent = save.mock.calls[0]![0] as {
        body: { changes: { upsert: { dateRules: DateRule[] } } };
      };
      expect(sent.body.changes.upsert.dateRules.map((r) => r.startsOn)).toEqual(["2026-10-31"]);
    });

    it("uses plural wording when several days already match", () => {
      const dialog = renderCopy(
        fixtureConfig(sameAsFriday("2026-10-31"), sameAsFriday("2026-11-01"))
      );
      pick(dialog, "Thu", "Sat", "Sun");
      expect(within(dialog).getByText("Sat and Sun already have these hours.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Copy to Thu" })).toBeEnabled();
    });

    it("disables the primary with the reason when every day already matches", () => {
      const dialog = renderCopy(fixtureConfig(sameAsFriday("2026-10-31")));
      pick(dialog, "Sat");
      const primary = within(dialog).getByRole("button", { name: "Copy" });
      expect(primary).toBeDisabled();
      const reason = within(dialog).getByText("These days already have Friday’s hours.");
      expect(primary).toHaveAttribute("aria-describedby", reason.id);
      fireEvent.click(primary);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("Every week…", () => {
    it("says under the sentence that it changes the regular week, and from when", () => {
      const dialog = renderCopy();
      pick(dialog, "Sat", "Sun");
      expect(
        within(dialog).getByText("Every week… changes your regular week from Oct 28.")
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Every week…" })).toBeEnabled();
      expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    });

    it("opens Change regular week with the weekdays and the start prefilled, saving nothing", async () => {
      const dialog = renderCopy();
      pick(dialog, "Sat");
      fireEvent.click(within(dialog).getByRole("button", { name: "Every week…" }));

      // The Copy dialog closes as the drawer opens.
      const drawer = await screen.findByRole("dialog", { name: "Change regular week" });
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: /Copy .* to other days/ })
        ).not.toBeInTheDocument()
      );
      // Starting is the later of the week's Monday (Oct 26) and today (Oct 28).
      expect(within(drawer).getByLabelText("Starting")).toHaveValue(TODAY);
      const days = within(drawer).getAllByRole("checkbox", { name: "Saturday" });
      expect(days.length).toBeGreaterThan(0);
      expect(days.every((box) => (box as HTMLInputElement).checked)).toBe(true);
      expect(within(drawer).getByRole("checkbox", { name: "Monday" })).not.toBeChecked();
      expect(save).not.toHaveBeenCalled();
    });

    it("starts on the week's Monday when it is still ahead of today", () => {
      render(
        <main>
          <CopyDayAction
            venueId="venue-1"
            state={stateOf(fixtureConfig())}
            timezone={FIXTURE_TIMEZONE}
            date={FIXTURE_DATE}
            day={resolveFixtureDay()}
            today="2026-10-20"
            onStale={vi.fn()}
          />
        </main>
      );
      fireEvent.click(screen.getByRole("button", { name: "Copy to other days…" }));
      const dialog = screen.getByRole("dialog", { name: /Copy .* to other days/ });
      pick(dialog, "Sat");
      expect(within(dialog).getByText(/regular week from Oct 26\./)).toBeInTheDocument();
    });

    const regularSaturday: AvailabilityConfig = {
      ...fixtureConfig(),
      assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: [5, 6], precedence: 0 }],
    };

    it("is still enabled for a past weekday, which the regular week does reach", () => {
      const dialog = renderCopy();
      pick(dialog, "Mon");
      expect(within(dialog).getByRole("button", { name: "Every week…" })).toBeEnabled();
      expect(within(dialog).getByRole("button", { name: "Copy" })).toBeDisabled();
    });

    it("disables only itself, with the reason, when the regular week already matches", () => {
      const dialog = renderCopy({
        ...regularSaturday,
        dateRules: [{ ...EARLY_DINNER, id: "own", startsOn: "2026-10-31", endsOn: "2026-10-31" }],
      });
      pick(dialog, "Sat");
      const every = within(dialog).getByRole("button", { name: "Every week…" });
      expect(every).toBeDisabled();
      const reason = within(dialog).getByText("These days already have Friday’s hours.");
      expect(every).toHaveAttribute("aria-describedby", reason.id);
      expect(within(dialog).getByRole("button", { name: "Copy to Sat" })).toBeEnabled();
    });

    it("leaves out the weekdays that already match when it opens the week", async () => {
      const dialog = renderCopy(regularSaturday);
      pick(dialog, "Sat", "Sun");
      fireEvent.click(within(dialog).getByRole("button", { name: "Every week…" }));
      const drawer = await screen.findByRole("dialog", { name: "Change regular week" });
      const sunday = within(drawer).getAllByRole("checkbox", { name: "Sunday" });
      expect(sunday.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    });
  });
});
