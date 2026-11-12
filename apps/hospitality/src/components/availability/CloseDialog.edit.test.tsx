import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const impactState = vi.hoisted(() => ({ value: null as unknown }));
/** What the impact query was last asked: the draft rule and what it replaces. */
const asked = vi.hoisted(() => ({ rule: null as unknown, alongside: undefined as unknown }));
vi.mock("../../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: [{ id: "sec-bar", name: "Bar" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureNoticePreview: () => ({ data: undefined, isLoading: true, error: null }),
  useClosureImpact: (params: { rule: unknown; alongside?: unknown }) => {
    asked.rule = params.rule;
    asked.alongside = params.alongside;
    return { data: impactState.value, isLoading: false, error: null, refetch: vi.fn() };
  },
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CloseDialog } from "./CloseDialog.js";
import { guestMessageField } from "./close-dialog-test-helpers.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

/** Dec 24 to 26, whole venue, with a message: the closure being edited. */
const RANGE: DateRule = {
  id: "range-1",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-26",
  guestMessage: "Closed for the holidays",
};

const NONE: ClosureImpact = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
const NEW_DATE: ClosureImpact = {
  reservations: 1,
  covers: 2,
  depositsHeld: 0,
  groups: [
    {
      groupKey: "2026-12-27:closed",
      date: "2026-12-27",
      kind: "closed",
      covers: 2,
      depositsHeld: 0,
      reservations: [
        {
          id: "r1",
          startTime: "2026-12-27T17:30:00Z",
          endTime: "2026-12-27T19:00:00Z",
          partySize: 2,
          guestName: "Guest 1",
          deposit: null,
          runsIntoClosure: false,
        },
      ],
    },
  ],
};

const saved = (cancel: number) => ({
  ruleId: "new",
  version: 8,
  changeId: "chg-1",
  outcomes: { cancel, move: 0, keep_notify: 0, keep_silent: 0 },
});

function renderEdit(opts: { live?: DateRule | null; onSavedQuietly?: () => void } = {}) {
  const base = fixtureConfig();
  const live = opts.live === undefined ? RANGE : opts.live;
  const state: AvailabilityConfigState = {
    config: { ...base, dateRules: live ? [...base.dateRules, live] : base.dateRules },
    version: 7,
    source: "rows",
  };
  const onClose = vi.fn();
  const onSavedQuietly = opts.onSavedQuietly ?? vi.fn();
  render(
    <ToastProvider>
      <main>
        <CloseDialog
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          initialDate={RANGE.startsOn}
          editing={RANGE}
          onSavedQuietly={onSavedQuietly}
          onClose={onClose}
        />
      </main>
    </ToastProvider>
  );
  return { onClose, onSavedQuietly };
}

describe("CloseDialog editing a saved closure (#7984)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    impactState.value = NONE;
  });

  it("opens on the closure as saved, and asks about it replacing the saved one", () => {
    renderEdit();
    const dialog = screen.getByRole("dialog", { name: "Edit closure" });

    expect(within(dialog).getByRole("combobox", { name: "When" })).toHaveTextContent("Date range");
    expect(guestMessageField()).toHaveValue("Closed for the holidays");
    expect(asked.alongside).toEqual({ upsert: [], remove: ["range-1"], replaces: RANGE });
    // The draft is a new closure, never the saved id: the saved one goes in the same save.
    expect(asked.rule).toMatchObject({
      kind: "closure",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
    });
    expect((asked.rule as DateRule).id).not.toBe("range-1");
  });

  it("offers One date, Date range and Until I reopen, never Tonight, Several dates or Repeats", () => {
    renderEdit();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("combobox", { name: "When" }));
    const offered = screen.getAllByRole("option").map((o) => o.textContent);
    expect(offered).toEqual(["One date", "Date range", "Until I reopen"]);
  });

  it("saves with nothing to decide, replacing the saved closure, and hands the change over for Undo", async () => {
    create.mockResolvedValue(saved(0));
    const { onClose, onSavedQuietly } = renderEdit();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { body } = create.mock.calls[0]![0];
    expect(body).toMatchObject({
      expectedVersion: 7,
      alongside: { upsert: [], remove: ["range-1"], replaces: RANGE },
      decisions: [],
    });
    expect(body.rule.id).not.toBe("range-1");
    expect(onSavedQuietly).toHaveBeenCalledWith(saved(0));
  });

  it("decides only on the bookings the new dates close, in Step 2, and offers no Undo once a guest is told", async () => {
    impactState.value = NEW_DATE;
    create.mockResolvedValue(saved(1));
    const { onClose, onSavedQuietly } = renderEdit();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText(/closed · 1 booking/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 1" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create.mock.calls[0]![0].body.decisions).toHaveLength(1);
    expect(onSavedQuietly).not.toHaveBeenCalled();
  });

  describe("an edit that gives dates back to cancelled guests (#8413)", () => {
    const GIVES_BACK: ClosureImpact = { ...NONE, givenBack: { guests: 2 } };

    it("asks about them in Step 2, told by default, and sends the choice with the save", async () => {
      impactState.value = GIVES_BACK;
      create.mockResolvedValue(saved(0));
      const { onClose } = renderEdit();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      const tell = within(dialog).getByRole("checkbox", { name: /Tell the 2 guests we cancelled/ });
      expect(tell).toBeChecked();
      expect(within(dialog).getByText(/Guests are told right away/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(create.mock.calls[0]![0].body).toMatchObject({ tellGivenBackGuests: true });
    });

    it("tells no one, and still offers Undo, when the Manager unticks it", async () => {
      impactState.value = GIVES_BACK;
      create.mockResolvedValue(saved(0));
      const { onClose, onSavedQuietly } = renderEdit();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /Tell the 2 guests/ }));
      expect(within(dialog).queryByText(/Guests are told right away/)).toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(create.mock.calls[0]![0].body).toMatchObject({ tellGivenBackGuests: false });
      expect(onSavedQuietly).toHaveBeenCalledWith(saved(0));
    });

    it("describes the primary button by the note only while the note is shown", () => {
      impactState.value = GIVES_BACK;
      renderEdit();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      const save = within(dialog).getByRole("button", { name: "Save changes" });
      expect(save).toHaveAttribute("aria-describedby", "close-step-two-note");
      expect(document.getElementById("close-step-two-note")).not.toBeNull();

      fireEvent.click(within(dialog).getByRole("checkbox", { name: /Tell the 2 guests/ }));
      expect(save).not.toHaveAttribute("aria-describedby");
      expect(document.getElementById("close-step-two-note")).toBeNull();
    });

    it("offers no Undo once the save told a given-back guest", async () => {
      impactState.value = GIVES_BACK;
      create.mockResolvedValue({ ...saved(0), givenBackNotified: 2 });
      const { onClose, onSavedQuietly } = renderEdit();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(onSavedQuietly).not.toHaveBeenCalled();
    });

    it("decides the new dates' bookings and the given-back guests in the same Step 2", async () => {
      impactState.value = { ...NEW_DATE, givenBack: { guests: 1 } };
      create.mockResolvedValue(saved(1));
      const { onClose } = renderEdit();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      expect(within(dialog).getByText(/closed · 1 booking/)).toBeInTheDocument();
      expect(
        within(dialog).getByRole("checkbox", { name: /Tell the 1 guest we cancelled/ })
      ).toBeChecked();
      fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 1" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(create.mock.calls[0]![0].body).toMatchObject({ tellGivenBackGuests: true });
    });

    it("asks nothing when the edit gives back no told guest", async () => {
      impactState.value = NONE;
      create.mockResolvedValue(saved(0));
      const { onClose } = renderEdit();

      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(create.mock.calls[0]![0].body).not.toHaveProperty("tellGivenBackGuests");
    });
  });

  it("will not save over a closure a teammate changed while it was open", () => {
    renderEdit({ live: { ...RANGE, endsOn: "2026-12-30" } });
    expect(screen.getByText(/Someone changed this closure/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("will not save when the closure was removed while it was open", () => {
    renderEdit({ live: null });
    expect(screen.getByText(/This closure was removed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});
