import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState, ScheduleService } from "@mbe/types";

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
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

import { EVERY_DAY, draftBlock, draftService } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { RegularWeekPanel } from "./RegularWeekPanel.js";

/**
 * The weekly form and a service's seating and booking values (availability-hub E4.1). The first
 * test is the before/after pin: it passed on the form as it was before the shared service fields.
 */

const LUNCH_SEATING = { version: 1, interval: 30 } as const;
const WEEKEND_SEATING = { version: 1, interval: 20 } as const;
const DINNER_SEATING = { version: 1, fixed: [1080, 1200] } as const;

/**
 * Every shape a stored row can take: Lunch seats every 30 minutes, booked by phone and online in
 * that order, with weekend hours that seat every 20 minutes online only; Dinner has two fixed
 * seating times, online only; Bar is walk-in only.
 */
function storedWeek(): AvailabilityConfig {
  let n = 0;
  return draftToConfig(
    {
      days: EVERY_DAY,
      services: [
        draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"], {
          kept: { seating: LUNCH_SEATING, bookingTypes: ["phone", "online"] },
          blocks: [
            {
              ...draftBlock("weekend", [6, 0], ["10:00", "14:00", "15:00"]),
              kept: { seating: WEEKEND_SEATING, bookingTypes: ["online"] },
            },
          ],
        }),
        draftService("bar", "Bar", ["15:30", "16:00", "16:30"], {
          kept: { seating: { version: 1, interval: 15 }, bookingTypes: [] },
        }),
        draftService("dinner", "Dinner", ["17:00", "21:00", "22:00"], {
          kept: {
            seating: { ...DINNER_SEATING, fixed: [...DINNER_SEATING.fixed] },
            bookingTypes: ["online"],
          },
        }),
      ],
    },
    () => `stored-${++n}`
  );
}

/** Rows as they are compared: without the ids a save makes anew, in a fixed order. */
const stripped = (rows: readonly ScheduleService[]) =>
  rows
    .map(({ id: _id, scheduleId: _scheduleId, ...row }) => row)
    .sort((a, b) => a.venueServiceId.localeCompare(b.venueServiceId));

const state = (config: AvailabilityConfig): AvailabilityConfigState => ({
  config,
  version: 7,
  source: "rows",
});

const renderPanel = () => renderPanelWith(storedWeek());

function renderPanelWith(config: AvailabilityConfig) {
  render(
    <main>
      <RegularWeekPanel
        venueId="venue-1"
        state={state(config)}
        today="2026-10-25"
        onStale={vi.fn()}
        onStartLater={vi.fn()}
      />
    </main>
  );
  return config;
}

const openService = (name: string) => {
  const line = screen.getByRole("button", { name: new RegExp(`^${name}, `) });
  if (line.getAttribute("aria-expanded") === "false") fireEvent.click(line);
};

const moreOptions = () => fireEvent.click(screen.getByRole("button", { name: "More options" }));

const choose = (select: string, option: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: select }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};

/** Saves and answers the rows sent, by service name. */
async function savedRows(config: AvailabilityConfig) {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const rows: ScheduleService[] = save.mock.calls[0]![0].body.changes.upsert.scheduleServices;
  const idOf = (name: string) => config.venueServices.find((v) => v.name === name)?.id;
  const row = (name: string) => rows.find((r) => r.venueServiceId === idOf(name));
  return { lunch: row("Lunch"), dinner: row("Dinner") };
}

describe("RegularWeekPanel: seating and booking values", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("a week loaded and saved without More options writes every stored row as it was", async () => {
    const config = renderPanel();
    // An edit that touches no stored service: a fourth one, after Dinner.
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    fireEvent.click(screen.getByText("Late"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const rows: ScheduleService[] = save.mock.calls[0]![0].body.changes.upsert.scheduleServices;
    const storedIds = new Set(config.venueServices.map((v) => v.id));
    expect(rows).toHaveLength(config.scheduleServices.length + 1);
    // Whole rows, not two fields: times, seating, booking types in their stored order, and the
    // weekend hours with their own values.
    expect(stripped(rows.filter((row) => storedIds.has(row.venueServiceId)))).toEqual(
      stripped(config.scheduleServices)
    );
  });

  it("changing Seat every writes the new interval and leaves Booked by alone", async () => {
    const config = renderPanel();
    openService("Lunch");
    moreOptions();
    expect(screen.getByRole("combobox", { name: "Seat every" })).toHaveTextContent("30 min");
    choose("Seat every", "10 min");
    const { lunch, dinner } = await savedRows(config);
    expect(lunch?.seating).toEqual({ version: 1, interval: 10 });
    expect(lunch?.bookingTypes).toEqual(["phone", "online"]);
    // The weekend hours had values of their own: they keep them.
    expect(lunch?.dayHours.sets[0]?.seating).toEqual(WEEKEND_SEATING);
    expect(dinner?.seating).toEqual(DINNER_SEATING);
    expect(dinner?.bookingTypes).toEqual(["online"]);
  });

  it("changing Booked by writes the new value and leaves Seat every alone", async () => {
    const config = renderPanel();
    openService("Lunch");
    moreOptions();
    expect(screen.getByRole("combobox", { name: "Booked by" })).toHaveTextContent("Online + phone");
    choose("Booked by", "Phone only");
    const { lunch } = await savedRows(config);
    expect(lunch?.bookingTypes).toEqual(["phone"]);
    expect(lunch?.seating).toEqual(LUNCH_SEATING);
    expect(lunch?.dayHours.sets[0]?.bookingTypes).toEqual(["online"]);
  });

  it("shows fixed seating times as text and saves them untouched", async () => {
    const config = renderPanel();
    openService("Dinner");
    moreOptions();
    expect(screen.getByText("Fixed seating times: 6:00 PM and 8:00 PM")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Seat every" })).not.toBeInTheDocument();
    choose("Booked by", "Phone only");
    const { dinner } = await savedRows(config);
    expect(dinner?.seating).toEqual(DINNER_SEATING);
    expect(dinner?.bookingTypes).toEqual(["phone"]);
  });

  it("More options is closed until pressed, and says so", () => {
    renderPanel();
    openService("Lunch");
    const button = screen.getByRole("button", { name: "More options" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Seat every" })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Booked by" })).toBeInTheDocument();
  });

  it("a change to Seat every alone is an edit: Save appears", () => {
    renderPanel();
    openService("Lunch");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    moreOptions();
    choose("Seat every", "20 min");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a change put back reads clean: Save goes, though the stored order is phone then online", () => {
    renderPanel();
    openService("Lunch");
    moreOptions();
    choose("Booked by", "Online only");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    choose("Booked by", "Online + phone");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    choose("Seat every", "10 min");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    choose("Seat every", "30 min");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  describe("a service removed and added again under its stored name", () => {
    /** Lunch goes, and a form-made Lunch (the name chip) takes its place. */
    const replaceLunch = () => {
      renderPanelWith(storedWeek());
      openService("Lunch");
      fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
      fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
      fireEvent.click(
        within(screen.getByRole("group", { name: "Service names" })).getByText("Lunch")
      );
      moreOptions();
    };

    it("shows what the save will write: the stored 30 min and Online + phone", () => {
      replaceLunch();
      expect(screen.getByRole("combobox", { name: "Seat every" })).toHaveTextContent("30 min");
      expect(screen.getByRole("combobox", { name: "Booked by" })).toHaveTextContent(
        "Online + phone"
      );
    });

    it("changing only Booked by saves the stored interval with the new booking types", async () => {
      const config = storedWeek();
      replaceLunch();
      choose("Booked by", "Online only");
      const { lunch } = await savedRows(config);
      expect(lunch?.seating).toEqual(LUNCH_SEATING);
      expect(lunch?.bookingTypes).toEqual(["online"]);
    });

    it("changing only Seat every saves the stored booking types with the new interval", async () => {
      const config = storedWeek();
      replaceLunch();
      choose("Seat every", "10 min");
      const { lunch } = await savedRows(config);
      expect(lunch?.seating).toEqual({ version: 1, interval: 10 });
      expect(lunch?.bookingTypes).toEqual(["phone", "online"]);
    });
  });

  describe("different hours that keep their own seating or booking", () => {
    const CAPTION = "These days keep their own settings: seat every 20 min, online only.";
    const weekend = () => screen.getByRole("group", { name: "Lunch: different hours" });

    it("say so, in the group's description", () => {
      renderPanel();
      openService("Lunch");
      expect(within(weekend()).getByText(CAPTION)).toBeInTheDocument();
      expect(weekend()).toHaveAccessibleDescription(CAPTION);
    });

    it("say nothing when they have the service's values", () => {
      renderPanel();
      openService("Dinner");
      fireEvent.click(screen.getByRole("button", { name: "Different hours on some days" }));
      expect(screen.queryByText(/keep their own settings/)).not.toBeInTheDocument();
    });

    it("stop saying so once the service is changed to match", () => {
      renderPanel();
      openService("Lunch");
      moreOptions();
      choose("Seat every", "20 min");
      // Booking still differs, so the caption stays, with both values.
      expect(within(weekend()).getByText(CAPTION)).toBeInTheDocument();
      choose("Booked by", "Online only");
      expect(screen.queryByText(/keep their own settings/)).not.toBeInTheDocument();
      expect(weekend()).not.toHaveAccessibleDescription();
    });
  });

  // Measured, not a budget: with three services and one open, today's panel had 35 before More
  // options. ux.md's budget of 30 is for the regular hours page that replaces this panel (E4.4).
  it("adds one control to the form after one edit: 35 before More options, 36 with it", () => {
    renderPanel();
    openService("Dinner");
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    const controls = [
      ...screen
        .getByTestId("week-panel")
        .querySelectorAll("button, input, select, textarea, a[href], [role='combobox']"),
    ];
    expect(controls.filter((c) => c.textContent === "More options")).toHaveLength(1);
    expect(controls.length).toBe(36);
  });

  it("the onboarding wizard's form offers no More options: its save has no such values", () => {
    render(
      <QuickSetupForm
        draft={{
          days: EVERY_DAY,
          services: [draftService("d", "Dinner", ["17:00", "21:00", "22:00"])],
        }}
        onChange={vi.fn()}
        issues={[]}
        local
      />
    );
    expect(screen.getByLabelText("Closes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More options" })).not.toBeInTheDocument();
  });
});
