import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const saving = vi.hoisted(() => ({ value: false }));
const impactState = vi.hoisted(() => ({ value: null as unknown }));
const refetchImpact = vi.hoisted(() => vi.fn());
/**
 * How the impact query answers. By default it always has data. `keyed` models react-query: only
 * the first rule it saw has cached data, so a rule that changes (a new id included) starts empty.
 */
const impactQuery = vi.hoisted(() => ({
  keyed: false,
  firstKey: null as string | null,
  loading: false,
  error: null as unknown,
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: saving.value }),
  useClosureImpact: ({ rule }: { rule: unknown }) => {
    const key = JSON.stringify(rule);
    if (impactQuery.keyed && impactQuery.firstKey === null) impactQuery.firstKey = key;
    const absent = impactQuery.loading || (impactQuery.keyed && key !== impactQuery.firstKey);
    return {
      data: absent ? undefined : impactState.value,
      isLoading: absent && impactQuery.error === null,
      error: impactQuery.error,
      refetch: refetchImpact,
    };
  },
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => refresh }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CloseDialog } from "./CloseDialog.js";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const DATE = "2026-12-24";

/** A weekly dinner-only closure from 10:00 PM: the series whose one date is being edited. */
const DINNER_SERIES: DateRule = {
  id: "series-1",
  kind: "closure",
  targetKind: "service",
  venueServiceId: "vs-dinner",
  startsOn: "2026-10-01",
  endsOn: "2027-03-31",
  repeat: { version: 1, weekdays: [4] },
  window: { version: 1, from: 1320, to: 2880 },
};

const IMPACT: ClosureImpact = {
  reservations: 14,
  covers: 52,
  depositsHeld: 3,
  groups: [
    {
      groupKey: `${DATE}:closed`,
      date: DATE,
      kind: "closed",
      covers: 52,
      depositsHeld: 3,
      reservations: Array.from({ length: 14 }, (_, i) => ({
        id: `r${i}`,
        startTime: `${DATE}T17:30:00Z`,
        endTime: `${DATE}T19:00:00Z`,
        partySize: 4,
        guestName: `Guest ${i + 1}`,
        deposit: null,
        runsIntoClosure: false,
      })),
    },
  ],
};

function renderDialog(extra: Partial<React.ComponentProps<typeof CloseDialog>> = {}) {
  const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
  const onClose = vi.fn();
  const utils = render(
    <ToastProvider>
      <main>
        <CloseDialog
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          initialDate={DATE}
          onClose={onClose}
          {...extra}
        />
      </main>
    </ToastProvider>
  );
  return { ...utils, onClose };
}

describe("CloseDialog", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    refresh.mockReset();
    saving.value = false;
    impactState.value = IMPACT;
    Object.assign(impactQuery, { keyed: false, firstKey: null, loading: false, error: null });
  });

  it("shows the guest-message character counter once", () => {
    renderDialog();
    expect(screen.getAllByText("0/200")).toHaveLength(1);
  });

  it("explains an over-limit guest message", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Message for guests/), {
      target: { value: "x".repeat(201) },
    });
    expect(screen.getByText("Keep it to 200 characters.").getAttribute("role")).toBe("alert");
  });

  it("judges the guest message length trimmed, as Next does", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Message for guests/), {
      target: { value: `${"x".repeat(199)}  ` },
    });
    expect(screen.queryByText("Keep it to 200 characters.")).toBeNull();
  });

  it("starts the date picker's weeks on Monday", () => {
    renderDialog();
    fireEvent.click(screen.getAllByRole("combobox", { name: "Date" })[0]!);
    expect(screen.getAllByRole("columnheader")[0]!.textContent).toMatch(/^Mo/);
  });

  it("edits one date of a series: When is fixed to that date and What starts as the series", async () => {
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 14, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    renderDialog({ series: DINNER_SERIES });
    const dialog = screen.getByRole("dialog");

    // No range, repeat or until-reopen can be typed: the engine applies the edit on its start only.
    expect(within(dialog).queryByRole("radio", { name: "Date range" })).toBeNull();
    expect(within(dialog).queryByRole("radio", { name: "Repeats" })).toBeNull();
    expect(within(dialog).queryByRole("radio", { name: "Until I reopen" })).toBeNull();
    expect(within(dialog).getByRole("radio", { name: "One service" })).toHaveProperty(
      "checked",
      true
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const { body } = create.mock.calls[0]![0];
    expect(body.rule).toMatchObject({
      kind: "closure",
      seriesId: "series-1",
      targetKind: "service",
      venueServiceId: "vs-dinner",
      startsOn: DATE,
      endsOn: DATE,
      repeat: null,
      window: { from: 1320 },
    });
    expect(body.decisions).toHaveLength(1);
  });

  it("shows the live count, then requires a choice before it will save", async () => {
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 14, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    const { onClose } = renderDialog();
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("Step 1 of 2")).toBeTruthy();
    expect(
      within(dialog).getByText("14 reservations · 52 guests are booked in this closure")
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Closed for a private event" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));

    expect(within(dialog).getByText("Step 2 of 2")).toBeTruthy();
    // No outcome chosen yet, so the button asks for one instead of naming it, and is disabled.
    const primary = within(dialog).getByTestId("close-primary");
    expect(primary).toHaveTextContent(/^Choose for each group$/);
    expect(primary).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The toast counts what was notified: reservations, not the 52 guests booked.
    expect(await screen.findByText("Thu, Dec 24 closed · 14 reservations notified")).toBeTruthy();
    const call = create.mock.calls[0]?.[0] as {
      body: { expectedVersion: number; rule: Record<string, unknown>; decisions: unknown[] };
    };
    expect(call.body.expectedVersion).toBe(7);
    expect(call.body.rule).toMatchObject({
      kind: "closure",
      targetKind: "venue",
      startsOn: DATE,
      guestMessage: "Closed for a private event",
    });
    expect(call.body.decisions).toEqual([
      {
        groupKey: `${DATE}:closed`,
        action: "cancel",
        reservationIds: IMPACT.groups[0]!.reservations.map((r) => r.id),
      },
    ]);
  });

  it("refetches the impact and asks again when the group changed before the save", async () => {
    refetchImpact.mockReset();
    create.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "decision-required",
          status: 422,
          detail: "Every affected group needs a choice.",
          code: "decision-required",
          groupKeys: [`${DATE}:closed`],
        } as never,
        "POST",
        "closures"
      )
    );
    renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

    expect(
      await within(dialog).findByText(/bookings changed while you were deciding/i)
    ).toBeTruthy();
    expect(refetchImpact).toHaveBeenCalled();
    // The old choice is gone: the Manager decides again on the fresh group.
    expect(within(dialog).getByTestId("close-primary")).toBeDisabled();
  });

  it("asks for the acknowledgement before keeping bookings silent", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Keep, don't tell guests/ }));
    expect(within(dialog).getByRole("checkbox", { name: /14 guests won't be told/ })).toBeTruthy();
    const buttons = within(dialog).getAllByRole("button");
    expect((buttons.at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves straight away when nothing is booked, naming the date", async () => {
    impactState.value = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^Close Thu, Dec 24$/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].body.decisions).toEqual([]);
  });

  it("says online booking is paused, not that the date is closed, after a pause", async () => {
    impactState.value = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <main>
          <CloseDialog
            venueId="venue-1"
            state={state}
            timezone="America/Los_Angeles"
            today="2026-12-01"
            initialDate={null}
            pauseOnline
            onClose={onClose}
          />
        </main>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause online booking" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText("Online booking paused")).toBeTruthy();
    expect(screen.queryByText(/closed$/)).toBeNull();
  });

  it("names the channels the button pauses, not always online (#7978)", () => {
    impactState.value = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
    renderDialog({ initialDate: null, pauseOnline: true });
    const dialog = screen.getByRole("dialog");
    const primary = () => within(dialog).getByTestId("close-primary").textContent;
    expect(primary()).toBe("Pause online booking");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Phone" }));
    expect(primary()).toBe("Pause booking");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Online" }));
    expect(primary()).toBe("Pause phone booking");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Phone" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Waitlist" }));
    expect(primary()).toBe("Pause waitlist");
  });

  it("does not claim online booking paused when only another channel was paused", async () => {
    impactState.value = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <main>
          <CloseDialog
            venueId="venue-1"
            state={state}
            timezone="America/Los_Angeles"
            today="2026-12-01"
            initialDate={null}
            pauseOnline
            onClose={onClose}
          />
        </main>
      </ToastProvider>
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Phone" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Online" }));
    fireEvent.click(within(dialog).getByTestId("close-primary"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText(/^Booking paused on /)).toBeTruthy();
    expect(screen.queryByText("Online booking paused")).toBeNull();
  });

  it("keeps the dialog open and says why when the save fails", async () => {
    create.mockRejectedValue(new Error("boom"));
    const { onClose } = renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Keep them and notify/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and keep 14" }));
    expect(await within(dialog).findByText("Couldn't close")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names the change that won on a version conflict, and refreshes", async () => {
    create.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "Availability changed since you loaded it.",
          code: "version-conflict",
          winningChange: {
            id: "c1",
            actorId: "auth0|ana",
            at: "2026-12-01T20:15:00Z",
            kind: "closure",
            summary: "Closed Thu Dec 24",
          },
        } as never,
        "POST",
        "closures"
      )
    );
    renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Keep them and notify/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and keep 14" }));
    expect(
      await within(dialog).findByText(/changed first by a teammate: Closed Thu Dec 24/i)
    ).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("locks What and When to the whole venue tonight for a Host, as text", async () => {
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 14, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    renderDialog({ hostLocked: true, initialDate: null });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(within(dialog).getByText("Whole venue")).toBeTruthy();
    expect(within(dialog).getByText("Tonight")).toBeTruthy();
    // Step 2 is still required: the Host decides what happens to each booking.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const call = create.mock.calls[0]?.[0] as { body: { rule: Record<string, unknown> } };
    expect(call.body.rule).toMatchObject({
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-01",
      endsOn: "2026-12-01",
    });
  });

  describe("a retried or interrupted close (#7975)", () => {
    const RESULT = {
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 14, move: 0, keep_notify: 0, keep_silent: 0 },
    };
    const toStepTwo = (dialog: HTMLElement) => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
    };
    type Call = { idempotencyKey: string; body: { rule: { id: string }; decisions: unknown } };

    it("retries a lost response under the same key and rule id, then reports success", async () => {
      create.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(RESULT);
      const { onClose } = renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
      expect(await within(dialog).findByText("Couldn't close")).toBeTruthy();

      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      const [first, second] = create.mock.calls.map((c) => c[0] as Call);
      expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
      expect(second!.body.rule.id).toBe(first!.body.rule.id);
      expect(await screen.findByText("Thu, Dec 24 closed · 14 reservations notified")).toBeTruthy();
    });

    it("starts a new attempt when the Manager changes the request after a failure", async () => {
      create.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(RESULT);
      renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
      await within(dialog).findByText("Couldn't close");

      fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
      fireEvent.click(within(dialog).getByRole("radio", { name: "Tonight" }));
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0] as Call);
      expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
      expect(second!.body.rule.id).not.toBe(first!.body.rule.id);
    });

    // A lost response may still have committed. A retry under the same key would replay it and
    // hide that the Manager's later edit was ignored, so an edit after a failed save is a new
    // attempt: the stale expected version then gets an honest conflict.
    const failFirstSave = async (dialog: HTMLElement) => {
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
      await within(dialog).findByText("Couldn't close");
      fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    };

    it("starts a new attempt, keeping the decisions, when the guest message changes after a failed save", async () => {
      create.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(RESULT);
      renderDialog();
      const dialog = screen.getByRole("dialog");
      await failFirstSave(dialog);

      fireEvent.change(within(dialog).getByLabelText(/Message for guests/), {
        target: { value: "Closed for the holiday" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0] as Call);
      expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
      expect(second!.body.rule.id).not.toBe(first!.body.rule.id);
      expect(second!.body.decisions).toEqual(first!.body.decisions);
    });

    it("starts a new attempt when a decision changes after a failed save", async () => {
      create.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(RESULT);
      renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
      await within(dialog).findByText("Couldn't close");

      fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));
      fireEvent.click(within(dialog).getByTestId("close-primary"));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0] as Call);
      expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
      expect(second!.body.rule.id).not.toBe(first!.body.rule.id);
    });

    const dialogElement = (state: AvailabilityConfigState, onClose: () => void = vi.fn()) => (
      <ToastProvider>
        <main>
          <CloseDialog
            venueId="venue-1"
            state={state}
            timezone="America/Los_Angeles"
            today="2026-12-01"
            initialDate={DATE}
            onClose={onClose}
          />
        </main>
      </ToastProvider>
    );
    const STATE: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };

    it("keeps Step 2 and the choice when a decision changes after a failed save", async () => {
      impactQuery.keyed = true; // a new rule id would be a new query, with no data yet
      create.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(RESULT);
      renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
      await within(dialog).findByText("Couldn't close");

      fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));

      expect(within(dialog).getByRole("radio", { name: "Keep them and notify" })).toBeChecked();
      const primary = within(dialog).getByTestId("close-primary");
      expect(primary).toBeEnabled();
      fireEvent.click(primary);
      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const second = create.mock.calls[1]![0] as Call;
      expect(second.body.decisions).toEqual([
        expect.objectContaining({ groupKey: `${DATE}:closed`, action: "keep_notify" }),
      ]);
    });

    it("waits on Step 2, saving nothing, while the bookings to decide on are loading", () => {
      const view = renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);

      impactQuery.loading = true;
      view.rerender(dialogElement(STATE));

      expect(within(dialog).getByTestId("close-primary")).toBeDisabled();
      expect(within(dialog).getByText("Loading the bookings…")).toBeTruthy();
      expect(create).not.toHaveBeenCalled();
    });

    it("says so on Step 2, with the save disabled, when the bookings could not be read", () => {
      const view = renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);

      impactQuery.error = new Error("down");
      impactQuery.loading = true;
      view.rerender(dialogElement(STATE));

      expect(within(dialog).getByTestId("close-primary")).toBeDisabled();
      expect(within(dialog).getByText(/Couldn't load the bookings/)).toBeTruthy();
    });

    describe("when an earlier attempt turns out to have been saved", () => {
      const conflict = () =>
        new ApiClientError(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Availability changed since you loaded it.",
            code: "version-conflict",
          } as never,
          "POST",
          "closures"
        );
      /** Attempt 1 cancels and loses its response; attempt 2 keeps and gets a 409. */
      const savedThenChanged = async () => {
        create.mockRejectedValueOnce(new Error("lost")).mockRejectedValueOnce(conflict());
        const onClose = vi.fn();
        const view = renderDialog({ onClose });
        const dialog = screen.getByRole("dialog");
        toStepTwo(dialog);
        fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
        await within(dialog).findByText("Couldn't close");
        // The first response was lost but it committed; the Manager now picks the other choice.
        fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));
        fireEvent.click(within(dialog).getByTestId("close-primary"));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(refresh).toHaveBeenCalled());
        return { view, dialog, onClose };
      };
      const withFirstRule = () => {
        const firstRuleId = (create.mock.calls[0]![0] as Call).body.rule.id;
        const base = fixtureConfig();
        return {
          config: {
            ...base,
            dateRules: [
              ...base.dateRules,
              {
                id: firstRuleId,
                kind: "closure",
                targetKind: "venue",
                startsOn: DATE,
                endsOn: DATE,
              },
            ],
          } as AvailabilityConfigState["config"],
          version: 8,
          source: "rows" as const,
        };
      };

      it("reports the first attempt's outcome, not a failure, and never says to try again", async () => {
        const { view, dialog, onClose } = await savedThenChanged();
        view.rerender(dialogElement(withFirstRule(), onClose));

        expect(within(dialog).getByText("Already closed")).toBeTruthy();
        expect(within(dialog).getByText(/cancel 14/)).toBeTruthy();
        expect(within(dialog).getByText(/did not apply/)).toBeTruthy();
        // No failure alert, and nothing that invites another save.
        expect(within(dialog).queryByText("Couldn't close")).toBeNull();
        expect(within(dialog).queryByText(/try again/i)).toBeNull();
        expect(within(dialog).queryByText(/changed first by a teammate/i)).toBeNull();
        // The Step 2 form, still showing the second choice, is gone.
        expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
        expect(within(dialog).queryByRole("button", { name: /Close and/ })).toBeNull();
      });

      it("names the choices of the send that committed, not of an earlier send of the same rule id", async () => {
        const decisionRequired = new ApiClientError(
          {
            type: "about:blank",
            title: "decision-required",
            status: 422,
            detail: "Every affected group needs a choice.",
            code: "decision-required",
            groupKeys: [`${DATE}:closed`],
          } as never,
          "POST",
          "closures"
        );
        create
          .mockRejectedValueOnce(decisionRequired) // send 1: cancel, rolled back
          .mockRejectedValueOnce(new Error("lost")) // send 2: keep, same id, committed
          .mockRejectedValueOnce(conflict()); // send 3: a later edit
        const onClose = vi.fn();
        const view = renderDialog({ onClose });
        const dialog = screen.getByRole("dialog");
        toStepTwo(dialog);
        fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
        await within(dialog).findByText(/bookings changed while you were deciding/i);

        // The choices were cleared and the rule id kept: the Manager now keeps the guests.
        fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Close and keep 14" }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
        expect((create.mock.calls[1]![0] as Call).body.rule.id).toBe(
          (create.mock.calls[0]![0] as Call).body.rule.id
        );
        await within(dialog).findByText("Couldn't close");

        // Send 2 committed with its response lost; an edit is sent, and gets a 409.
        fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
        fireEvent.click(within(dialog).getByTestId("close-primary"));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(refresh).toHaveBeenCalled());

        const committedId = (create.mock.calls[1]![0] as Call).body.rule.id;
        const base = fixtureConfig();
        view.rerender(
          dialogElement(
            {
              config: {
                ...base,
                dateRules: [
                  ...base.dateRules,
                  {
                    id: committedId,
                    kind: "closure",
                    targetKind: "venue",
                    startsOn: DATE,
                    endsOn: DATE,
                  },
                ],
              } as AvailabilityConfigState["config"],
              version: 8,
              source: "rows",
            },
            onClose
          )
        );

        expect(within(dialog).getByText(/keep 14/)).toBeTruthy();
        expect(within(dialog).queryByText(/cancel 14/)).toBeNull();
      });

      it("saves nothing more and closes, refreshing the calendar, on Done", async () => {
        const { view, dialog, onClose } = await savedThenChanged();
        view.rerender(dialogElement(withFirstRule(), onClose));
        refresh.mockClear();

        fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

        expect(create).toHaveBeenCalledTimes(2);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalled();
      });

      it("leaves at once on Escape, without asking to discard, and refreshes", async () => {
        const { view, onClose } = await savedThenChanged();
        view.rerender(dialogElement(withFirstRule(), onClose));
        refresh.mockClear();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(screen.queryByRole("dialog", { name: /Discard|Leave/ })).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalled();
      });
    });

    describe("leaving after a save that may have gone through", () => {
      it("asks in words that say it may have saved, then refreshes the calendar on leaving", async () => {
        create.mockRejectedValueOnce(new Error("lost"));
        const { onClose } = renderDialog();
        const dialog = screen.getByRole("dialog");
        toStepTwo(dialog);
        fireEvent.click(within(dialog).getByRole("button", { name: "Close and cancel 14" }));
        await within(dialog).findByText("Couldn't close");
        refresh.mockClear();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(screen.queryByText("Nothing has been closed.", { exact: false })).toBeNull();
        const ask = screen.getByRole("dialog", { name: "Leave this closure?" });
        expect(within(ask).getByText(/may have gone through/)).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalled();
      });

      it("asks even when nothing was edited, since a save was attempted", async () => {
        impactState.value = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
        create.mockRejectedValueOnce(new Error("lost"));
        const { onClose } = renderDialog();
        const dialog = screen.getByRole("dialog");
        fireEvent.click(within(dialog).getByTestId("close-primary"));
        await within(dialog).findByText("Couldn't close");

        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(screen.getByRole("dialog", { name: "Leave this closure?" })).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
      });

      it("does not refresh when the Manager never saved", () => {
        const { onClose } = renderDialog();
        refresh.mockClear();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
      });
    });

    it("keeps one attempt across edits made before the first save", async () => {
      create.mockResolvedValueOnce(RESULT);
      renderDialog();
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/Message for guests/), {
        target: { value: "Closed for the holiday" },
      });
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));
      fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(within(dialog).getByTestId("close-primary"));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect((create.mock.calls[0]![0] as Call).body.rule.id).toBeTruthy();
    });

    it("keeps the decisions when only the guest message changes", () => {
      renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));

      fireEvent.change(within(dialog).getByLabelText(/Message for guests/), {
        target: { value: "Closed for the holiday" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));

      expect(within(dialog).getByTestId("close-primary")).toHaveTextContent(
        /^Close and cancel 14$/
      );
    });

    it("clears the decisions when what or when changes", () => {
      renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));

      fireEvent.click(within(dialog).getByRole("radio", { name: "Tonight" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));

      expect(within(dialog).getByTestId("close-primary")).toHaveTextContent(
        /^Choose for each group$/
      );
    });

    it("asks before Escape throws away an edited draft", () => {
      const { onClose } = renderDialog();
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/Message for guests/), {
        target: { value: "Closed for the holiday" },
      });

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
      const ask = screen.getByRole("dialog", { name: "Discard this closure?" });
      fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Close" })).toBeTruthy();

      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Discard this closure?" })).getByRole("button", {
          name: "Discard",
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes straight away on Escape when nothing was edited", () => {
      const { onClose } = renderDialog();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("locks Escape, Cancel and Back while the save is in flight", () => {
      saving.value = true;
      const { onClose } = renderDialog();
      const dialog = screen.getByRole("dialog");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();

      saving.value = false;
    });

    it("routes the backdrop and the X through the discard guard", () => {
      const { onClose } = renderDialog();
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/Message for guests/), {
        target: { value: "Closed for the holiday" },
      });

      fireEvent.click(dialog.parentElement!);
      expect(screen.getByRole("dialog", { name: "Discard this closure?" })).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

      fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
      expect(screen.getByRole("dialog", { name: "Discard this closure?" })).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("ignores the backdrop and the X while the save is in flight", () => {
      saving.value = true;
      const { onClose } = renderDialog();
      const dialog = screen.getByRole("dialog");

      fireEvent.click(dialog.parentElement!);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));

      expect(onClose).not.toHaveBeenCalled();
      saving.value = false;
    });

    it("locks What and When on step 1 while the save is in flight", () => {
      saving.value = true;
      renderDialog();

      expect(
        within(screen.getByRole("dialog")).getByRole("radio", { name: "Tonight" })
      ).toBeDisabled();
      saving.value = false;
    });

    it("locks the decisions on step 2 while the save is in flight", () => {
      const view = renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      saving.value = true;
      view.rerender(
        <ToastProvider>
          <main>
            <CloseDialog
              venueId="venue-1"
              state={{ config: fixtureConfig(), version: 7, source: "rows" }}
              timezone="America/Los_Angeles"
              today="2026-12-01"
              initialDate={DATE}
              onClose={vi.fn()}
            />
          </main>
        </ToastProvider>
      );

      for (const radio of within(dialog).getAllByRole("radio")) expect(radio).toBeDisabled();
      saving.value = false;
    });

    it("disables Back while the save is in flight on step 2", () => {
      const { rerender } = renderDialog();
      const dialog = screen.getByRole("dialog");
      toStepTwo(dialog);
      saving.value = true;
      rerender(
        <ToastProvider>
          <main>
            <CloseDialog
              venueId="venue-1"
              state={{ config: fixtureConfig(), version: 7, source: "rows" }}
              timezone="America/Los_Angeles"
              today="2026-12-01"
              initialDate={DATE}
              onClose={vi.fn()}
            />
          </main>
        </ToastProvider>
      );
      expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled();
    });
  });

  describe("wording and options (#7978)", () => {
    const FRIDAY = "2026-12-25";
    const NO_BOOKINGS: ClosureImpact = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };

    /** The fixture week with its dinner running to 2:00 AM (minute 1560 of the service day). */
    function overnightState(...rules: DateRule[]): AvailabilityConfigState {
      const base = fixtureConfig(...rules);
      return {
        config: {
          ...base,
          scheduleServices: base.scheduleServices.map((s) => ({ ...s, closesAt: 1560 })),
        },
        version: 7,
        source: "rows",
      };
    }

    it("offers start times after midnight on a day that runs past it, and sends them", async () => {
      impactState.value = NO_BOOKINGS;
      create.mockResolvedValue({
        ruleId: "r",
        version: 8,
        changeId: "c",
        outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
      });
      renderDialog({ state: overnightState(), initialDate: FRIDAY });
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("combobox", { name: "Starting at" }));
      fireEvent.click(screen.getByRole("option", { name: "From 1:00 AM (next day)" }));
      fireEvent.click(within(dialog).getByTestId("close-primary"));
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![0].body.rule.window).toEqual({
        version: 1,
        from: 1500,
        to: 2880,
      });
    });

    it("offers them from the closure's first real date, not the From date of a repeat (#7978)", () => {
      // 2026-12-21 is a Monday, with no service; the repeat first falls on Friday the 25th.
      renderDialog({ state: overnightState(), initialDate: "2026-12-21" });
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: "Repeats" }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fri" }));
      fireEvent.click(within(dialog).getByRole("combobox", { name: "Starting at" }));
      expect(screen.getByRole("option", { name: "From 1:30 AM (next day)" })).toBeTruthy();
    });

    describe("Step 2 at 01:05 on Friday's service (#7978)", () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-12-26T09:05:00Z")); // 1:05 AM Saturday in Los Angeles
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it("shows the Urgent notice for a start later that night", () => {
        renderDialog({ state: overnightState(), today: FRIDAY, initialDate: FRIDAY });
        const dialog = screen.getByRole("dialog");
        fireEvent.click(within(dialog).getByRole("combobox", { name: "Starting at" }));
        fireEvent.click(screen.getByRole("option", { name: "From 1:30 AM (next day)" }));
        fireEvent.click(within(dialog).getByTestId("close-primary"));
        expect(within(dialog).getByText(/^Urgent/)).toBeTruthy();
      });
    });

    it("offers none on a day that closes before midnight", () => {
      renderDialog({ initialDate: FRIDAY });
      fireEvent.click(screen.getByRole("combobox", { name: "Starting at" }));
      expect(screen.queryByRole("option", { name: /next day/ })).toBeNull();
    });

    it("warns that a range replaces the special hours inside it, not only on its first day", () => {
      const special: DateRule = { ...EARLY_DINNER, id: "sh", startsOn: FRIDAY, endsOn: FRIDAY };
      renderDialog({ state: overnightState(special), initialDate: "2026-12-24" });
      expect(screen.queryByText(/has special hours/)).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: "Date range" }));
      expect(screen.getByText(/Fri, Dec 25 has special hours/)).toBeTruthy();
    });

    it("says a Host's emergency close is all day, with no start time to pick", () => {
      renderDialog({ hostLocked: true, initialDate: null });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).queryByRole("combobox", { name: "Starting at" })).toBeNull();
      expect(within(dialog).getByText("All day")).toBeTruthy();
    });

    it("does not say the guest sees the whole day closed when only the evening is", () => {
      renderDialog({ initialDate: FRIDAY });
      expect(screen.getByText(/Fri, Dec 25 · Closed$/)).toBeTruthy();
      fireEvent.click(screen.getByRole("combobox", { name: "Starting at" }));
      fireEvent.click(screen.getByRole("option", { name: "From 8:00 PM" }));
      expect(screen.queryByText(/Fri, Dec 25 · Closed$/)).toBeNull();
      expect(screen.getByText(/Fri, Dec 25 · Closed from 8:00 PM/)).toBeTruthy();
    });
  });

  it("has no axe violations on either step", async () => {
    renderDialog();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
