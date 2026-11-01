import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: preview, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => refresh }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { SeriesEditDialog } from "./SeriesEditDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const SERIES: DateRule = {
  id: "s1",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-07",
  endsOn: "2027-02-01",
  repeat: { version: 1, weekdays: [1] },
  guestMessage: "Old message",
};
const WINNER: DateRule = {
  ...SERIES,
  endsOn: "2027-03-01",
  repeat: { version: 1, weekdays: [1, 3] },
  guestMessage: "Winner's message",
};

const IMPACT: ClosureImpact = {
  reservations: 2,
  covers: 4,
  depositsHeld: 0,
  groups: [
    {
      groupKey: "2026-12-08:closed",
      date: "2026-12-08",
      kind: "closed",
      covers: 4,
      depositsHeld: 0,
      reservations: ["r1", "r2"].map((id) => ({
        id,
        startTime: "2026-12-08T17:30:00Z",
        endTime: "2026-12-08T19:00:00Z",
        partySize: 2,
        guestName: id,
        deposit: null,
        runsIntoClosure: false,
      })),
    },
  ],
};

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

function renderSeriesDialog(initial: readonly DateRule[] = [SERIES]) {
  const onClose = vi.fn();
  const onStale = vi.fn();
  const element = (rules: readonly DateRule[], version: number) => (
    <ToastProvider>
      <main>
        <SeriesEditDialog
          venueId="venue-1"
          state={
            { config: fixtureConfig(...rules), version, source: "rows" } as AvailabilityConfigState
          }
          series={SERIES}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          onStale={onStale}
          onEditDate={vi.fn()}
          onClose={onClose}
        />
      </main>
    </ToastProvider>
  );
  const view = render(element(initial, 7));
  return {
    onClose,
    onStale,
    reload: (rules: readonly DateRule[], version: number) => view.rerender(element(rules, version)),
  };
}

const allDatesAddingTuesday = () => {
  fireEvent.click(screen.getByRole("radio", { name: "All dates in the series" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Tue" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
};

async function toStepTwoAndCancel() {
  allDatesAddingTuesday();
  fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));
  fireEvent.click(screen.getByRole("button", { name: /Close and cancel/ }));
}

describe("SeriesEditDialog after someone else's change (#7978)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    [create, preview, saveConfig, refresh].forEach((mock) => mock.mockReset());
    preview.mockResolvedValue(IMPACT);
  });

  it("builds the retry from the series that won, not the one captured on open", async () => {
    create.mockRejectedValueOnce(conflict());
    const { reload } = renderSeriesDialog();
    await toStepTwoAndCancel();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await screen.findByRole("radio", { name: "All dates in the series" });

    reload([WINNER], 8);
    fireEvent.click(screen.getByRole("radio", { name: "All dates in the series" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    const { rule } = preview.mock.calls[1]![0];
    expect(rule.guestMessage).toBe("Winner's message");
    expect(rule.endsOn).toBe("2027-03-01");
    expect(rule.repeat.weekdays).toEqual(expect.arrayContaining([1, 3, 5]));
  });

  it("shows the Manager that the series changed, with the form on the new days and end", async () => {
    const { reload } = renderSeriesDialog();
    fireEvent.click(screen.getByRole("radio", { name: "All dates in the series" }));
    expect(screen.getByRole("checkbox", { name: "Wed" })).not.toBeChecked();
    const endsOn = () => (screen.getByLabelText("Ends on") as HTMLInputElement).value;
    const before = endsOn();

    reload([WINNER], 8);

    expect(await screen.findByText(/Someone else changed this series/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Wed" })).toBeChecked();
    expect(endsOn()).not.toBe(before);
    expect(endsOn()).toMatch(/Mar/);
  });

  it("drops Step 2 when the series changes under it: its plan is no longer true", async () => {
    const { reload } = renderSeriesDialog();
    allDatesAddingTuesday();
    await screen.findByRole("radio", { name: /Cancel, notify & refund/ });

    reload([WINNER], 8);

    expect(await screen.findByText(/Someone else changed this series/)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Cancel, notify & refund/ })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("closes with a message when the series is gone", async () => {
    const { reload, onClose } = renderSeriesDialog();

    reload([], 8);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Someone else removed this repeating closure/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows what really applied when an earlier try of the growth was saved", async () => {
    create
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(conflict());
    const { reload, onClose, onStale } = renderSeriesDialog();
    await toStepTwoAndCancel();
    await screen.findByText(/Can't reach/);
    fireEvent.click(screen.getByRole("radio", { name: "Keep them and notify" }));
    fireEvent.click(screen.getByRole("button", { name: /Close and keep/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const saved = create.mock.calls[0]![0].body.rule as DateRule;

    // The saved growth replaced the series, so it is gone, and that must not read as someone else.
    reload([saved], 8);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/An earlier try of this closure was saved: cancel 2/)
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Someone else/)).toBeNull();
    onStale.mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("warns on leaving the form after Back from a lost response", async () => {
    create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { onClose } = renderSeriesDialog();
    await toStepTwoAndCancel();
    await screen.findByText(/Can't reach/);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("dialog", { name: "Leave this closure?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves without asking when the Manager goes Back having saved nothing", async () => {
    const { onClose } = renderSeriesDialog();
    allDatesAddingTuesday();
    fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("a plan older than the config (#7978)", () => {
    const SKIP_DEC_14: DateRule = {
      id: "skip-dec14",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-12-14",
      endsOn: "2026-12-14",
      seriesId: SERIES.id,
    };
    const sendCancel = () =>
      fireEvent.click(screen.getByRole("button", { name: /Close and cancel/ }));

    it("sends the version it was built on when the winner arrives during the preview", async () => {
      let answer: (impact: ClosureImpact) => void = () => undefined;
      preview.mockReturnValueOnce(
        new Promise<ClosureImpact>((resolve) => {
          answer = resolve;
        })
      );
      create.mockRejectedValueOnce(conflict());
      const { reload, onStale } = renderSeriesDialog();
      allDatesAddingTuesday();
      await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));

      reload([WINNER], 8);
      await act(async () => answer(IMPACT));
      fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));
      sendCancel();

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const { body } = create.mock.calls[0]![0];
      // The plan is the old series: only the version it was built on can get it refused.
      expect(body.rule.guestMessage).toBe("Old message");
      expect(body.expectedVersion).toBe(7);
      expect(await screen.findByText(/Availability changed since you opened this/)).toBeTruthy();
      expect(onStale).toHaveBeenCalled();
    });

    it("sends the version it was built on when a colleague skips a date during Step 2", async () => {
      create.mockRejectedValueOnce(conflict());
      const { reload } = renderSeriesDialog();
      allDatesAddingTuesday();
      fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));

      // The series row is unchanged, so nothing voids the plan, which has not moved this skip.
      reload([SERIES, SKIP_DEC_14], 8);
      sendCancel();

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const { body } = create.mock.calls[0]![0];
      expect(body.alongside.upsert).toEqual([]);
      expect(body.expectedVersion).toBe(7);
      expect(await screen.findByText(/Availability changed since you opened this/)).toBeTruthy();
    });
  });

  describe("the Manager's own config save whose response was lost (#7978)", () => {
    const TWO_DAYS: DateRule = { ...SERIES, repeat: { version: 1, weekdays: [1, 3] } };
    const dropWednesday = async () => {
      saveConfig.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const view = renderSeriesDialog([TWO_DAYS]);
      fireEvent.click(screen.getByRole("radio", { name: "All dates in the series" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Wed" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText(/Can't reach/);
      return view;
    };

    it("does not call the committed save someone else's change", async () => {
      const { reload } = await dropWednesday();

      // What the server sends back may spell the row differently from what was sent.
      const { id, ...rest } = TWO_DAYS;
      reload([{ ...rest, repeat: { version: 1, weekdays: [1] }, window: null, id } as DateRule], 8);

      await waitFor(() => expect(screen.getByRole("checkbox", { name: "Wed" })).not.toBeChecked());
      expect(screen.queryByText(/Someone else changed this series/)).toBeNull();
    });

    it("still names a colleague's different change after it", async () => {
      const { reload } = await dropWednesday();

      reload([{ ...TWO_DAYS, repeat: { version: 1, weekdays: [1, 5] } }], 8);

      expect(await screen.findByText(/Someone else changed this series/)).toBeTruthy();
    });
  });

  it("does not say nothing changed when a config save gets a 502, which may have committed (#8032)", async () => {
    saveConfig.mockRejectedValueOnce(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Bad Gateway",
          status: 502,
          detail: "Bad gateway",
          code: "bad-gateway",
        } as never,
        "PUT",
        "availability/config"
      )
    );
    renderSeriesDialog([{ ...SERIES, repeat: { version: 1, weekdays: [1, 3] } }]);
    fireEvent.click(screen.getByRole("radio", { name: "All dates in the series" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Wed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/hit a snag/)).toBeTruthy();
    expect(screen.queryByText(/nothing was changed/)).toBeNull();
  });

  it("leaves without asking after Back from a refusal that decided nothing (#7978)", async () => {
    create.mockRejectedValueOnce(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Decision required",
          status: 422,
          detail: "Refused.",
          code: "decision-required",
        } as never,
        "POST",
        "closures"
      )
    );
    const { onClose } = renderSeriesDialog();
    await toStepTwoAndCancel();
    await screen.findByText(/bookings changed while you were deciding/i);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Leave this closure?" })).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
