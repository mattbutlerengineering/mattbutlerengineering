import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
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

import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function renderEditor(rules: DateRule[] = []) {
  const state: AvailabilityConfigState = {
    config: fixtureConfig(...rules),
    version: 4,
    source: "rows",
  };
  const handlers = {
    onDirtyChange: vi.fn(),
    onCancel: vi.fn(),
    onFinished: vi.fn(),
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

  it("has no axe violations reading or editing", async () => {
    const { container } = renderEditor();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
