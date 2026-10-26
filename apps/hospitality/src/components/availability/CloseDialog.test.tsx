import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const impactState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
  useClosureImpact: () => ({
    data: impactState.value,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CloseDialog } from "./CloseDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

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
    impactState.value = IMPACT;
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
    expect(call.body.decisions).toEqual([{ groupKey: `${DATE}:closed`, action: "cancel" }]);
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

  it("has no axe violations on either step", async () => {
    renderDialog();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
