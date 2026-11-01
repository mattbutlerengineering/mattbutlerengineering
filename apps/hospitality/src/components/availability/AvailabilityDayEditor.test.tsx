import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";
import { resolveDay } from "@mbe/availability";

const save = vi.hoisted(() => vi.fn());
const revertAsync = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revertAsync }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({
  AvailabilityGuestPreview: (props: { dates: string[]; focusDate: string }) => (
    <div data-testid="guest-preview">{`${props.focusDate} x${props.dates.length}`}</div>
  ),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
  VENUE_CLOSURE,
} from "./resolved-day-fixtures.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function renderEditor(rules: DateRule[] = [], fixedDates?: readonly string[]) {
  const state: AvailabilityConfigState = {
    config: fixtureConfig(...rules),
    version: 4,
    source: "rows",
  };
  const handlers = {
    onDirtyChange: vi.fn(),
    onCancel: vi.fn(),
    onFinished: vi.fn(),
    onStale: vi.fn(),
  };
  const utils = render(
    <ToastProvider>
      <main>
        <AvailabilityDayEditor
          venueId="venue-1"
          date={FIXTURE_DATE}
          day={resolveFixtureDay(...rules)}
          state={state}
          timezone={FIXTURE_TIMEZONE}
          today="2026-10-28"
          fixedDates={fixedDates}
          {...handlers}
        />
      </main>
    </ToastProvider>
  );
  return { ...utils, ...handlers };
}

function chooseScope(name: RegExp | string) {
  fireEvent.click(screen.getByRole("combobox", { name: "You’re changing" }));
  fireEvent.click(screen.getByRole("option", { name }));
}

/** The body of the most recent save call. */
function sentBody() {
  return save.mock.calls.at(-1)?.[0] as {
    venueId: string;
    overwrite?: boolean;
    body: {
      expectedVersion: number;
      scopeConflicts: string;
      changes: { upsert: Record<string, unknown[]>; remove: Record<string, string[]> };
    };
  };
}

function conflict(code: string, extra: Record<string, unknown> = {}) {
  return new ApiClientError({
    type: "about:blank",
    title: code,
    status: code === "invalid-config" ? 422 : 409,
    detail: "Server said no.",
    code,
    ...extra,
  } as never);
}

describe("AvailabilityDayEditor", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 5, changeId: "chg-1" });
  });

  it("offers an edit control per service and no scope until the first one is tapped", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Edit Lunch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Dinner" })).toBeInTheDocument();
    expect(screen.queryByText("You’re changing")).not.toBeInTheDocument();
  });

  it("previews the draft once it differs, across every date in the chosen scope", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.queryByTestId("guest-preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(screen.getByTestId("guest-preview")).toHaveTextContent(`${FIXTURE_DATE} x1`);
    chooseScope(/Every Friday/);
    expect(screen.getByTestId("guest-preview")).toHaveTextContent(`${FIXTURE_DATE} x53`);
  });

  describe("on a phone", () => {
    afterEach(() => {
      Reflect.deleteProperty(window, "matchMedia");
    });

    function phone() {
      window.matchMedia = vi.fn((query: string) => ({
        media: query,
        matches: /\(max-width:\s*(\d+)px\)/.test(query),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    }

    it("moves the preview to a Preview tab, with Save still in reach", () => {
      phone();
      renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      expect(screen.queryByTestId("guest-preview")).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Edit", selected: true })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
      expect(screen.getByTestId("guest-preview")).toHaveTextContent(`${FIXTURE_DATE} x1`);
      expect(screen.getByRole("button", { name: /^Save/ })).toBeEnabled();
      fireEvent.click(screen.getByRole("tab", { name: "Edit" }));
      expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeInTheDocument();
    });

    it("keeps the typing field mounted and focused as the draft becomes previewable", () => {
      phone();
      renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
      fireEvent.click(screen.getByRole("option", { name: "A new service…" }));
      const name = screen.getByRole("textbox", { name: /Service name/ });
      name.focus();
      fireEvent.change(name, { target: { value: "B" } });
      expect(name).toBeInTheDocument();
      expect(name).toHaveFocus();
      fireEvent.change(name, { target: { value: "Br" } });
      expect(name).toBeInTheDocument();
      expect(name).toHaveFocus();
    });

    it("keeps the Preview tab off until there is a draft to preview", () => {
      phone();
      renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("makes no preview when the chosen scope reaches no dates", () => {
    // "Brunch" is in no regular-week day; only a use_schedule rule on the fixture date uses it.
    const base = fixtureConfig();
    const lunch = base.scheduleServices[0]!;
    const config = {
      ...base,
      schedules: [
        ...base.schedules,
        { id: "brunch", name: "Brunch", kind: "alternate" as const, isRegular: false },
      ],
      scheduleServices: [
        ...base.scheduleServices,
        { ...lunch, id: "ss-brunch", scheduleId: "brunch" },
      ],
      dateRules: [
        {
          id: "dr-brunch",
          kind: "use_schedule" as const,
          targetKind: "venue" as const,
          startsOn: FIXTURE_DATE,
          endsOn: FIXTURE_DATE,
          useScheduleId: "brunch",
        },
      ],
    };
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayEditor
            venueId="venue-1"
            date={FIXTURE_DATE}
            day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE)}
            state={{ config, version: 4, source: "rows" }}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            onDirtyChange={vi.fn()}
            onCancel={vi.fn()}
            onFinished={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(screen.getByTestId("guest-preview")).toHaveTextContent(`${FIXTURE_DATE} x1`);
    chooseScope(/Everywhere “Brunch” is used/);
    expect(screen.getByText("Applies to 0 dates")).toBeTruthy();
    expect(screen.queryByTestId("guest-preview")).not.toBeInTheDocument();
  });

  it("holds the preview while a new service has no name (the server would refuse it)", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
    fireEvent.click(screen.getByRole("option", { name: "A new service…" }));
    expect(screen.queryByTestId("guest-preview")).not.toBeInTheDocument();
  });

  it("shows the scope, defaulting to this date only, once an edit starts", () => {
    const { onDirtyChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.getByRole("combobox", { name: "You’re changing" })).toHaveTextContent(
      "This date only"
    );
    expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
    // Looking is not a draft.
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it("this date only: saves one single-date rule against the version it read", async () => {
    const { onDirtyChange, onFinished } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    const { venueId, body, overwrite } = sentBody();
    expect(venueId).toBe("venue-1");
    expect(overwrite).toBeFalsy();
    expect(body.expectedVersion).toBe(4);
    const [rule] = body.changes.upsert.dateRules as DateRule[];
    expect(rule).toMatchObject({
      kind: "special_hours",
      startsOn: FIXTURE_DATE,
      endsOn: FIXTURE_DATE,
    });
    expect(
      rule?.kind === "special_hours" && rule.payload.services.map((s) => s.venueServiceId)
    ).toEqual(["vs-dinner"]);
    expect(await screen.findByText("Friday, October 30 updated")).toBeInTheDocument();
  });

  it("selected dates: hides the scope select and saves exactly those dates", async () => {
    const picked = [
      "2026-10-30",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-09",
    ];
    const { onFinished } = renderEditor([], picked);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.queryByRole("combobox", { name: "You’re changing" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 6 dates" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    const rules = sentBody().body.changes.upsert.dateRules as {
      startsOn: string;
      endsOn: string;
    }[];
    expect(rules.map((r) => [r.startsOn, r.endsOn])).toEqual(picked.map((d) => [d, d]));
  });

  it("every Friday from a date: saves a repeating rule and names how many dates", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    chooseScope(/Every Friday from/);
    expect(screen.getByRole("button", { name: /^Save 53 dates$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save 53 dates$/ }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const [rule] = sentBody().body.changes.upsert.dateRules as DateRule[];
    expect(rule).toMatchObject({
      startsOn: FIXTURE_DATE,
      endsOn: null,
      repeat: { version: 1, weekdays: [5] },
    });
    expect(await screen.findByText("53 dates updated")).toBeInTheDocument();
  });

  it("offers Undo on the save toast, reverting that save against the version it produced", async () => {
    revertAsync.mockResolvedValue({ version: 6, changeId: "chg-2" });
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    const undo = await screen.findByRole("button", { name: "Undo" });
    // Saved means finished: the drawer takes the editor away, and only then can Undo run.
    rerender(<ToastProvider>{null}</ToastProvider>);
    fireEvent.click(undo);
    await waitFor(() =>
      expect(revertAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        changeId: "chg-1",
        expectedVersion: 5,
      })
    );
  });

  it("everywhere the schedule is used: rewrites the schedule's services", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    chooseScope(/Your regular week/);
    expect(screen.getByRole("button", { name: "Save 52 dates" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 52 dates" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const { changes } = sentBody().body;
    expect(changes.upsert.dateRules).toBeUndefined();
    expect(changes.remove.scheduleServices).toEqual(["ss-lunch"]);
    expect(changes.upsert.scheduleServices).toHaveLength(1);
  });

  it("asks keep or replace for dates that already have their own changes, defaulting to keep", async () => {
    renderEditor([EARLY_DINNER]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.queryByText(/already have their own changes/)).not.toBeInTheDocument();

    chooseScope(/Every Friday from/);
    expect(screen.getByText("1 date in this scope already has its own changes")).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: /own changes/ });
    expect(within(group).getByRole("radio", { name: "Keep theirs" })).toBeChecked();

    fireEvent.click(within(group).getByRole("radio", { name: "Replace them" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save 53 dates$/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentBody().body.scopeConflicts).toBe("replace");
  });

  it("under Keep theirs counts only the dates that will change, in the label and the toast", async () => {
    renderEditor([EARLY_DINNER]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    chooseScope(/Every Friday from/);
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(screen.getByRole("button", { name: "Save 52 dates" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save 52 dates" }));
    expect(await screen.findByText("52 dates updated")).toBeInTheDocument();
  });

  it("saves against the version the draft began on, not one a background refetch brought in", async () => {
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    rerender(
      <ToastProvider>
        <main>
          <AvailabilityDayEditor
            venueId="venue-1"
            date={FIXTURE_DATE}
            day={resolveFixtureDay()}
            state={{ config: fixtureConfig(), version: 9, source: "rows" }}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            onDirtyChange={vi.fn()}
            onCancel={vi.fn()}
            onFinished={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentBody().body.expectedVersion).toBe(4);
  });

  it("keeps the draft open with an alert when the server rejects the hours", async () => {
    save.mockRejectedValueOnce(
      conflict("invalid-config", {
        issues: [{ path: "dateRules.0", code: "overlap", message: "Lunch overlaps Dinner." }],
      })
    );
    const { onFinished } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Lunch overlaps Dinner.");
    expect(onFinished).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
  });

  it("disables Save when Keep theirs would write no dates", () => {
    const second = {
      ...EARLY_DINNER,
      id: "r-special-2",
      startsOn: "2026-11-02",
      endsOn: "2026-11-02",
    };
    renderEditor([EARLY_DINNER, second], [FIXTURE_DATE, "2026-11-02"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(screen.getByRole("button", { name: "Save 0 dates" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Replace them" }));
    expect(screen.getByRole("button", { name: "Save 2 dates" })).toBeEnabled();
  });

  it("explains a save that would strand bookings", async () => {
    save.mockRejectedValueOnce(
      conflict("stranded-bookings", {
        reservations: [
          { id: "r1", startTime: "2026-10-30T20:00:00Z", partySize: 4, reason: "outside_service" },
          { id: "r2", startTime: "2026-10-30T21:00:00Z", partySize: 2, reason: "outside_service" },
        ],
      })
    );
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "2 bookings would fall outside these hours"
    );
  });

  describe("when someone else saved first", () => {
    const winningChange = {
      id: "chg-9",
      actorId: "auth0|ana",
      at: "2026-10-25T22:42:00.000Z",
      kind: "config",
      summary: "Dinner closes at 10:00 PM on Fri, Oct 30",
    };

    async function raiseConflict() {
      save.mockRejectedValueOnce(conflict("version-conflict", { winningChange }));
      const utils = renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
      const dialog = await screen.findByRole("dialog", {
        name: "Someone changed availability first",
      });
      return { ...utils, dialog };
    }

    it("names the change and offers Review, Overwrite and Discard", async () => {
      const { dialog } = await raiseConflict();
      expect(within(dialog).getByText(/Dinner closes at 10:00 PM on Fri, Oct 30/)).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Review their change" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Overwrite" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Discard mine" })).toBeTruthy();
    });

    it("Review shows their change beside the draft", async () => {
      const { dialog } = await raiseConflict();
      fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
      expect(within(dialog).getByRole("heading", { name: "Their change" })).toBeTruthy();
      expect(within(dialog).getByRole("heading", { name: "Your draft" })).toBeTruthy();
      expect(within(dialog).getByText("Dinner 5:00 PM – 11:00 PM")).toBeTruthy();
    });

    it("Overwrite saves again against the latest version", async () => {
      const { dialog, onFinished } = await raiseConflict();
      fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite" }));
      await waitFor(() => expect(onFinished).toHaveBeenCalled());
      expect(sentBody().overwrite).toBe(true);
    });

    it("reloads the config when Discard mine drops the draft, so the next edit starts current", async () => {
      const { dialog, onStale } = await raiseConflict();
      fireEvent.click(within(dialog).getByRole("button", { name: "Discard mine" }));
      expect(onStale).toHaveBeenCalled();
    });

    it("reloads the config when the save is refused as out of date", async () => {
      const { onStale } = await raiseConflict();
      expect(onStale).toHaveBeenCalled();
    });

    it("shows a failed Overwrite inside the conflict dialog, not behind it", async () => {
      const { dialog, onFinished } = await raiseConflict();
      save.mockRejectedValueOnce(
        conflict("invalid-config", {
          issues: [{ path: "x", code: "overlap", message: "Lunch overlaps Dinner." }],
        })
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Lunch overlaps Dinner.");
      expect(onFinished).not.toHaveBeenCalled();
    });

    it("Discard mine drops the draft without saving again", async () => {
      const { dialog, onFinished, onDirtyChange } = await raiseConflict();
      fireEvent.click(within(dialog).getByRole("button", { name: "Discard mine" }));
      expect(onFinished).toHaveBeenCalled();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  it("hands Cancel back to the drawer", () => {
    const { onCancel } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  describe("inside the drawer, when the picked dates change for the same date", () => {
    const PICKED = [FIXTURE_DATE, "2026-11-02", "2026-11-03"];

    function drawerFor(fixedDates?: readonly string[]) {
      const state: AvailabilityConfigState = {
        config: fixtureConfig(),
        version: 4,
        source: "rows",
      };
      return (
        <ToastProvider>
          <main>
            <AvailabilityDayDrawer
              date={FIXTURE_DATE}
              day={resolveFixtureDay()}
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
                fixedDates,
              }}
            />
          </main>
        </ToastProvider>
      );
    }

    it("a draft begun on one date then picked for three saves all three", async () => {
      const { rerender } = render(drawerFor());
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      rerender(drawerFor(PICKED));
      // A new pick is a new draft: the editor is back to reading, so Edit starts it afresh.
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: "Save 3 dates" }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(sentBody().body.changes.upsert.dateRules).toHaveLength(3);
    });

    it("a draft begun on three dates then a plain click returns to this date only", () => {
      const { rerender } = render(drawerFor(PICKED));
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      rerender(drawerFor());
      fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
      expect(screen.getByRole("combobox", { name: "You’re changing" })).toHaveTextContent(
        "This date only"
      );
      expect(screen.getByRole("button", { name: "Save 1 date" })).toBeInTheDocument();
    });
  });

  describe("switching to Your regular week after editing", () => {
    const SEATING = { version: 1, interval: 15 } as const;
    const HOURS = { seating: SEATING, bookingTypes: ["online", "phone"] as ("online" | "phone")[] };

    /** The regular week also holds a colleague's Brunch, and Fri Oct 30 has its own Dinner-only hours. */
    function withOwnDay(
      extra: DateRule["id"] = "r-own",
      dinner: { lastSeatingAt: number; closesAt: number; bookingTypes?: ("online" | "phone")[] } = {
        lastSeatingAt: 1200,
        closesAt: 1320,
      }
    ) {
      const base = fixtureConfig();
      const rule = {
        ...EARLY_DINNER,
        id: extra,
        payload: {
          version: 1,
          services: [
            {
              venueServiceId: "vs-dinner",
              opensAt: 1020,
              ...HOURS,
              ...dinner,
            },
            {
              venueServiceId: "vs-late",
              opensAt: 1380,
              lastSeatingAt: 1400,
              closesAt: 1430,
              ...HOURS,
            },
          ],
        },
      } as DateRule;
      const config = {
        ...base,
        venueServices: [
          ...base.venueServices,
          { id: "vs-brunch", name: "Brunch", position: 2 },
          { id: "vs-late", name: "Late", position: 3 },
        ],
        scheduleServices: [
          ...base.scheduleServices,
          {
            id: "ss-brunch",
            scheduleId: "regular",
            venueServiceId: "vs-brunch",
            opensAt: 400,
            lastSeatingAt: 500,
            closesAt: 600,
            ...HOURS,
          },
        ],
        dateRules: [rule],
      };
      const onDirtyChange = vi.fn();
      render(
        <ToastProvider>
          <main>
            <AvailabilityDayEditor
              venueId="venue-1"
              date={FIXTURE_DATE}
              day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE)}
              state={{ config, version: 4, source: "rows" }}
              timezone={FIXTURE_TIMEZONE}
              today="2026-10-28"
              onDirtyChange={onDirtyChange}
              onCancel={vi.fn()}
              onFinished={vi.fn()}
            />
          </main>
        </ToastProvider>
      );
      return { onDirtyChange };
    }

    /** Makes the nth Booking select (rows run in opening order) Phone only. */
    function phoneOnlyOn(index: number) {
      fireEvent.click(screen.getAllByRole("combobox", { name: "Booking" })[index]!);
      fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
    }

    function editDinnerThenSwitch() {
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      // Dinner opens first, so its Booking select is the first.
      phoneOnlyOn(0);
      chooseScope(/Your regular week/);
    }

    it("round trip: the date's own services come back, and Brunch and Lunch do not join it", async () => {
      withOwnDay();
      editDinnerThenSwitch();
      chooseScope("This date only");
      expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Late" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove Lunch" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove Brunch" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const [rule] = sentBody().body.changes.upsert.dateRules as {
        payload: { services: { venueServiceId: string; bookingTypes: string[] }[] };
      }[];
      expect(rule!.payload.services.map((s) => s.venueServiceId).sort()).toEqual([
        "vs-dinner",
        "vs-late",
      ]);
      expect(
        rule!.payload.services.find((s) => s.venueServiceId === "vs-dinner")?.bookingTypes
      ).toEqual(["phone"]);
    });

    it("an edit to a date-only service is held while away and returns with the round trip", async () => {
      withOwnDay();
      fireEvent.click(screen.getByRole("button", { name: "Edit Late" }));
      phoneOnlyOn(1);
      chooseScope(/Your regular week/);
      chooseScope("This date only");
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const [rule] = sentBody().body.changes.upsert.dateRules as {
        payload: { services: { venueServiceId: string; bookingTypes: string[] }[] };
      }[];
      expect(
        rule!.payload.services.find((s) => s.venueServiceId === "vs-late")?.bookingTypes
      ).toEqual(["phone"]);
    });

    it("says so when the only edit is to a service the regular week lacks, and does not look clean", () => {
      const { onDirtyChange } = withOwnDay();
      fireEvent.click(screen.getByRole("button", { name: "Edit Late" }));
      phoneOnlyOn(1);
      chooseScope(/Your regular week/);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your edit to Late won’t be saved: it isn’t in what you’re changing now."
      );
      // Nothing to save, but the edit is not gone without a word: closing still asks.
      expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
      // The line goes when the edit comes back.
      chooseScope("This date only");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("adding a service back in this scope drops the line about the edit held for it", async () => {
      withOwnDay();
      fireEvent.click(screen.getByRole("button", { name: "Edit Late" }));
      phoneOnlyOn(1);
      chooseScope(/Your regular week/);
      expect(screen.getByRole("status")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
      fireEvent.click(screen.getByRole("option", { name: "Late" }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      // Late is the Manager's addition now, so it is saved, and the old edit does not return.
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const rows = sentBody().body.changes.upsert.scheduleServices as { venueServiceId: string }[];
      expect(rows.map((r) => r.venueServiceId)).toContain("vs-late");
    });

    it("a removal made on the regular week is still a removal after a trip through the date", async () => {
      withOwnDay();
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      chooseScope(/Your regular week/);
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      chooseScope("This date only");
      chooseScope(/Your regular week/);
      expect(screen.queryByRole("button", { name: "Remove Lunch" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(sentBody().body.changes.remove.scheduleServices).toEqual(["ss-lunch"]);
    });

    it("the removal of a service only the date had survives a trip through the regular week", async () => {
      withOwnDay();
      fireEvent.click(screen.getByRole("button", { name: "Edit Late" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Late" }));
      chooseScope(/Your regular week/);
      chooseScope("This date only");
      expect(screen.queryByRole("button", { name: "Remove Late" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const [rule] = sentBody().body.changes.upsert.dateRules as {
        payload: { services: { venueServiceId: string }[] };
      }[];
      expect(rule!.payload.services.map((s) => s.venueServiceId)).toEqual(["vs-dinner"]);
    });

    it("a date edit that makes it equal to the regular week is named, not dropped quietly", () => {
      // The date's Dinner differs from the regular week's only in who can book it.
      withOwnDay("r-own", { lastSeatingAt: 1260, closesAt: 1380, bookingTypes: ["phone"] });
      fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
      fireEvent.click(screen.getAllByRole("combobox", { name: "Booking" })[0]!);
      fireEvent.click(screen.getByRole("option", { name: "Online + phone" }));
      chooseScope(/Your regular week/);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your hours for Dinner won’t be used: what you’re changing already has them."
      );
    });

    it("closed day: a service added there joins the regular week without removing its other rows", async () => {
      const closed = fixtureConfig(VENUE_CLOSURE);
      render(
        <ToastProvider>
          <main>
            <AvailabilityDayEditor
              venueId="venue-1"
              date={FIXTURE_DATE}
              day={resolveFixtureDay(VENUE_CLOSURE)}
              state={{ config: closed, version: 4, source: "rows" }}
              timezone={FIXTURE_TIMEZONE}
              today="2026-10-28"
              onDirtyChange={vi.fn()}
              onCancel={vi.fn()}
              onFinished={vi.fn()}
            />
          </main>
        </ToastProvider>
      );
      fireEvent.click(screen.getByRole("button", { name: "Add service" }));
      fireEvent.click(screen.getByRole("combobox", { name: "Add service" }));
      fireEvent.click(screen.getByRole("option", { name: "Dinner" }));
      chooseScope(/Your regular week/);
      // The regular week already has Dinner, so the hours just set are not the ones it keeps.
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your hours for Dinner won’t be used: what you’re changing already has them."
      );
      expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeInTheDocument();
      // Nothing differs from the regular week yet, so there is nothing to save.
      expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();

      // Only what the Manager removes afterwards is removed.
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(sentBody().body.changes.remove.scheduleServices).toEqual(["ss-lunch"]);
    });

    it("keeps the regular week's other services: nothing the Manager did not remove is deleted", async () => {
      withOwnDay();
      editDinnerThenSwitch();
      // The regular week's rows are all in front of the Manager now, with their Dinner edit on top.
      expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Brunch" })).toBeInTheDocument();
      // The date's own extra service is not the regular week's, and is not carried into it.
      expect(screen.queryByRole("button", { name: "Remove Late" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const { body } = sentBody();
      expect(body.expectedVersion).toBe(4);
      expect(body.changes.remove.scheduleServices).toBeUndefined();
      const rows = body.changes.upsert.scheduleServices as {
        venueServiceId: string;
        bookingTypes: string[];
      }[];
      expect(rows.map((r) => r.venueServiceId).sort()).toEqual([
        "vs-brunch",
        "vs-dinner",
        "vs-lunch",
      ]);
      expect(rows.find((r) => r.venueServiceId === "vs-dinner")?.bookingTypes).toEqual(["phone"]);
    });

    it("still removes a service the Manager removes after switching", async () => {
      withOwnDay();
      editDinnerThenSwitch();
      fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
      fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => expect(save).toHaveBeenCalled());
      const { changes } = sentBody().body;
      expect(changes.remove.scheduleServices).toEqual(["ss-lunch"]);
    });
  });

  it("names the weekday of a close after midnight for one date, and none for the regular week", () => {
    const base = fixtureConfig();
    const config = {
      ...base,
      scheduleServices: base.scheduleServices.map((s) =>
        s.id === "ss-dinner" ? { ...s, closesAt: 1500 } : s
      ),
    };
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayEditor
            venueId="venue-1"
            date={FIXTURE_DATE}
            day={resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE)}
            state={{ config, version: 4, source: "rows" }}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            onDirtyChange={vi.fn()}
            onCancel={vi.fn()}
            onFinished={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
    expect(screen.getByText(/the next day \(Saturday\)/)).toBeInTheDocument();
    chooseScope(/Your regular week/);
    expect(screen.queryByText(/\(Saturday\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/the next day$/)).toBeInTheDocument();
  });

  it("has no axe violations reading or editing", async () => {
    const { container } = renderEditor();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
