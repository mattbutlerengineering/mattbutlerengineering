import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, ClosureImpact } from "@mbe/types";

const preview = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useClosures.js", () => ({
  usePreviewClosureImpacts: () => ({ mutateAsync: preview, isPending: false }),
  useCreateClosures: () => ({ mutateAsync: create, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AddSpecialDatesSheet } from "./AddSpecialDatesSheet.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const impact = (
  date: string,
  count: number,
  kind: "closed" | "shortened" = "closed"
): ClosureImpact => ({
  reservations: count,
  covers: count * 2,
  depositsHeld: 0,
  groups:
    count === 0
      ? []
      : [
          {
            groupKey: `${date}:${kind}`,
            date,
            kind,
            covers: count * 2,
            depositsHeld: 0,
            reservations: Array.from({ length: count }, (_, i) => ({
              id: `${date}-${i}`,
              startTime: `${date}T17:30:00Z`,
              endTime: `${date}T19:00:00Z`,
              partySize: 2,
              guestName: `Guest ${date} ${i + 1}`,
              deposit: null,
              runsIntoClosure: false,
            })),
          },
        ],
});

const result = (ruleId: string, cancel: number, keep: number) => ({
  ruleId,
  version: 8,
  changeId: `chg-${ruleId}`,
  outcomes: { cancel, move: 0, keep_notify: keep, keep_silent: 0 },
});

/** The fixture week plus a Saturday that closes at 8:00 PM, so a second weekday has other hours. */
function withSaturday() {
  const base = fixtureConfig();
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "sat", name: "Saturday", kind: "regular" as const, isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      {
        id: "ss-sat",
        scheduleId: "sat",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1100,
        closesAt: 1200,
        seating: { version: 1 as const, interval: 15 },
        bookingTypes: ["online" as const],
      },
    ],
    assignments: [
      ...base.assignments,
      { id: "as-sat", scheduleId: "sat", weekdays: [6], precedence: 1 },
    ],
  };
}

function renderSheet(config = fixtureConfig()) {
  const onStale = vi.fn();
  const onClose = vi.fn();
  const element = (next: typeof config, version: number) => (
    <ToastProvider>
      <main>
        <AddSpecialDatesSheet
          venueId="venue-1"
          state={{ config: next, version, source: "rows" } as AvailabilityConfigState}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          onStale={onStale}
          onClose={onClose}
        />
      </main>
    </ToastProvider>
  );
  const view = render(element(config, 7));
  /** The config reloaded with `next`: what `onStale` brings back. */
  const reload = (next: typeof config, version: number) => view.rerender(element(next, version));
  return { onClose, onStale, reload };
}

/** Picks `iso` in the nth row's date picker (the calendar opens on the mocked December). */
async function pickDate(row: number, iso: string) {
  fireEvent.click(screen.getAllByLabelText("Date")[row]!);
  const cell = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-date="${iso}"]`);
    if (!el) throw new Error(`no day cell for ${iso}`);
    return el;
  });
  fireEvent.click(cell);
  await waitFor(() => expect(document.querySelector("[role=grid]")).toBeNull());
}

const addRow = () => fireEvent.click(screen.getByRole("button", { name: "Add another date" }));
const primary = () => screen.getByTestId("add-dates-primary");

describe("AddSpecialDatesSheet", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T12:00:00"));
    preview.mockReset();
    create.mockReset();
    saveConfig.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks one combined Step 2 for two closures and saves every decision in one call", async () => {
    preview.mockResolvedValue([impact("2026-12-24", 2), impact("2026-12-25", 3)]);
    create.mockResolvedValue({
      version: 8,
      results: [result("a", 2, 0), result("b", 0, 3)],
    });
    renderSheet();
    await pickDate(0, "2026-12-24");
    addRow();
    await pickDate(1, "2026-12-25");

    fireEvent.click(primary());
    await screen.findByText(/closed · 2 bookings/);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0]![0].rules.map((r: { startsOn: string }) => r.startsOn)).toEqual([
      "2026-12-24",
      "2026-12-25",
    ]);
    // One Step 2 holds the groups of both dates, each with its own required choice.
    expect(screen.getAllByRole("radiogroup", { name: /What should happen/ })).toHaveLength(2);
    expect(screen.getByText(/closed · 3 bookings/)).toBeTruthy();
    expect(primary().textContent).toBe("Choose for each group");
    expect(primary()).toHaveProperty("disabled", true);

    const groups = screen.getAllByRole("radiogroup", { name: /What should happen/ });
    fireEvent.click(within(groups[0]!).getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(within(groups[1]!).getByRole("radio", { name: /Keep them and notify/ }));
    expect(primary().textContent).toBe("Save 2 dates · cancel 2 · keep 3");

    fireEvent.click(primary());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const { body, venueId } = create.mock.calls[0]![0];
    expect(venueId).toBe("venue-1");
    expect(body.expectedVersion).toBe(7);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      rule: { kind: "closure", startsOn: "2026-12-24" },
      decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" }],
    });
    expect(body.items[1]).toMatchObject({
      rule: { kind: "closure", startsOn: "2026-12-25" },
      decisions: [{ groupKey: "2026-12-25:closed", action: "keep_notify" }],
    });
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("shows a shortened-hours group beside a closed one in the same Step 2, and names move and cancel", async () => {
    preview.mockResolvedValue([impact("2026-12-25", 2, "shortened"), impact("2026-12-26", 3)]);
    create.mockResolvedValue({
      version: 9,
      results: [
        { ...result("h", 0, 0), outcomes: { cancel: 0, move: 2, keep_notify: 0, keep_silent: 0 } },
        result("c", 3, 0),
      ],
    });
    renderSheet();
    await pickDate(0, "2026-12-25");
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    addRow();
    await pickDate(1, "2026-12-26");

    expect(primary().textContent).toBe("Next");
    fireEvent.click(primary());

    await screen.findByText(/shortened · 2 bookings/);
    expect(screen.getByText(/closed · 3 bookings/)).toBeTruthy();
    const groups = screen.getAllByRole("radiogroup", { name: /What should happen/ });
    expect(groups).toHaveLength(2);
    fireEvent.click(
      within(groups[0]!).getByRole("radio", { name: /Move to the nearest open time/ })
    );
    fireEvent.click(within(groups[1]!).getByRole("radio", { name: /Cancel, notify & refund/ }));
    expect(primary().textContent).toBe("Save 2 dates · cancel 3 · move 2");

    fireEvent.click(primary());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const { body } = create.mock.calls[0]![0];
    expect(body.expectedVersion).toBe(7);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      rule: { kind: "special_hours", startsOn: "2026-12-25", endsOn: "2026-12-25" },
      decisions: [{ groupKey: "2026-12-25:shortened", action: "move" }],
    });
    expect(body.items[1]).toMatchObject({
      rule: { kind: "closure", startsOn: "2026-12-26" },
      decisions: [{ groupKey: "2026-12-26:closed", action: "cancel" }],
    });
    // Everything goes in the one batch; no separate config save.
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("saves a Special hours row with no affected bookings in the batch", async () => {
    preview.mockResolvedValue([impact("2026-12-25", 0), impact("2026-12-26", 0)]);
    create.mockResolvedValue({ version: 9, results: [result("h", 0, 0), result("c", 0, 0)] });
    const { onClose } = renderSheet();
    await pickDate(0, "2026-12-25");
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    addRow();
    await pickDate(1, "2026-12-26");
    // Closed is the default for the second row, with a message of its own.
    fireEvent.change(screen.getAllByLabelText(/Message for guests/)[1]!, {
      target: { value: "Closed for the holiday" },
    });
    fireEvent.click(primary());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const { items } = create.mock.calls[0]![0].body;
    expect(items[0].rule).toMatchObject({ kind: "special_hours", startsOn: "2026-12-25" });
    expect(items[1].rule).toMatchObject({
      kind: "closure",
      startsOn: "2026-12-26",
      guestMessage: "Closed for the holiday",
    });
    expect(saveConfig).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("copies the regular Friday's hours for a Same as Friday row", async () => {
    preview.mockResolvedValue([impact("2026-12-31", 0)]);
    create.mockResolvedValue({ version: 8, results: [result("s", 0, 0)] });
    const { onClose } = renderSheet();
    await pickDate(0, "2026-12-31"); // a Thursday
    fireEvent.click(screen.getByRole("radio", { name: "Same as another day" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Copy hours from" }));
    fireEvent.click(await screen.findByRole("option", { name: "Same as Friday" }));
    fireEvent.click(primary());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [item] = create.mock.calls[0]![0].body.items;
    expect(item.rule).toMatchObject({ kind: "special_hours", startsOn: "2026-12-31" });
    expect(
      item.rule.payload.services.map((s: { venueServiceId: string; opensAt: number }) => [
        s.venueServiceId,
        s.opensAt,
      ])
    ).toEqual([
      ["vs-lunch", 690],
      ["vs-dinner", 1020],
    ]);
    expect(saveConfig).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("applies one shared message to every closure", async () => {
    preview.mockResolvedValue([impact("2026-12-24", 0), impact("2026-12-25", 0)]);
    create.mockResolvedValue({ version: 9, results: [result("a", 0, 0), result("b", 0, 0)] });
    renderSheet();
    await pickDate(0, "2026-12-24");
    addRow();
    await pickDate(1, "2026-12-25");
    fireEvent.click(screen.getByRole("checkbox", { name: "Use one message for every date" }));
    fireEvent.change(screen.getByLabelText(/Message for guests \(every date\)/), {
      target: { value: "Closed for the holiday" },
    });
    fireEvent.click(primary());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const { items } = create.mock.calls[0]![0].body;
    expect(items.map((i: { rule: { guestMessage: string } }) => i.rule.guestMessage)).toEqual([
      "Closed for the holiday",
      "Closed for the holiday",
    ]);
  });

  it("reloads the config on a version conflict and asks again before a retry", async () => {
    preview.mockResolvedValue([impact("2026-12-24", 0)]);
    create.mockRejectedValueOnce({
      message: "conflict",
      problemDetails: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Availability changed since you loaded it.",
        code: "version-conflict",
      },
    });
    const { onStale } = renderSheet();
    await pickDate(0, "2026-12-24");
    fireEvent.click(primary());

    await screen.findByText(/No booking was cancelled/);
    expect(onStale).toHaveBeenCalledTimes(1);
    // Back on Step 1 with a fresh preview due, not a retry of the stale save.
    expect(primary().textContent).toBe("Next");
    expect(create).toHaveBeenCalledTimes(1);
  });

  const problem = (status: number, code: string) => ({
    message: code,
    problemDetails: { type: "about:blank", title: code, status, detail: "Refused.", code },
  });

  it("asks again on the fresh bookings when a group changed before the save", async () => {
    preview
      .mockResolvedValueOnce([impact("2026-12-24", 2)])
      .mockResolvedValueOnce([impact("2026-12-24", 3)]);
    create.mockRejectedValueOnce(problem(422, "decision-required"));
    renderSheet();
    await pickDate(0, "2026-12-24");
    fireEvent.click(primary());
    await screen.findByText(/closed · 2 bookings/);
    fireEvent.click(screen.getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(primary());

    expect(await screen.findByText(/bookings changed while you were deciding/i)).toBeTruthy();
    // The new group replaces the old one, and the old choice is gone.
    await screen.findByText(/closed · 3 bookings/);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(primary().textContent).toBe("Choose for each group");
    // Deciding again sends the fresh reservation ids, not the first group's.
    create.mockResolvedValue({ version: 8, results: [result("a", 3, 0)] });
    fireEvent.click(screen.getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(primary());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![0].body.items[0].decisions[0].reservationIds).toHaveLength(3);
  });

  it("refreshes and stops when the attempt had already been saved", async () => {
    preview.mockResolvedValue([impact("2026-12-24", 2)]);
    create.mockRejectedValueOnce(problem(409, "closure-exists"));
    const { onStale } = renderSheet();
    await pickDate(0, "2026-12-24");
    fireEvent.click(primary());
    await screen.findByText(/closed · 2 bookings/);
    fireEvent.click(screen.getByRole("radio", { name: /Cancel, notify & refund/ }));
    fireEvent.click(primary());

    expect(await screen.findByText(/already saved/i)).toBeTruthy();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/No booking was cancelled/)).toBeNull();
  });

  it("refreshes the special hours to the new date's weekday when the date changes (#7978)", async () => {
    preview.mockResolvedValue([impact("2026-12-26", 0)]);
    create.mockResolvedValue({ version: 8, results: [result("a", 0, 0)] });
    renderSheet(withSaturday());
    await pickDate(0, "2026-12-25"); // a Friday: dinner closes at 11:00 PM
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    await pickDate(0, "2026-12-26"); // a Saturday: dinner closes at 8:00 PM
    fireEvent.click(primary());

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const dinner = preview.mock.calls[0]![0].rules[0].payload.services.find(
      (service: { venueServiceId: string }) => service.venueServiceId === "vs-dinner"
    );
    expect(dinner.closesAt).toBe(1200);
  });

  it("reseeds hours left over from another date when Special hours is chosen again (#7978)", async () => {
    preview.mockResolvedValue([impact("2026-12-26", 0)]);
    create.mockResolvedValue({ version: 8, results: [result("a", 0, 0)] });
    renderSheet(withSaturday());
    await pickDate(0, "2026-12-25"); // a Friday: dinner closes at 11:00 PM
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    fireEvent.click(screen.getByRole("radio", { name: "Closed" }));
    await pickDate(0, "2026-12-26"); // a Saturday: dinner closes at 8:00 PM
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    fireEvent.click(primary());

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const dinner = preview.mock.calls[0]![0].rules[0].payload.services.find(
      (service: { venueServiceId: string }) => service.venueServiceId === "vs-dinner"
    );
    expect(dinner.closesAt).toBe(1200);
  });

  describe("a save whose response was lost (#7978)", () => {
    const lost = () => new TypeError("Failed to fetch");
    const conflict = () => problem(409, "version-conflict");
    const saveDec24 = async () => {
      preview.mockResolvedValueOnce([impact("2026-12-24", 2)]);
      await pickDate(0, "2026-12-24");
      fireEvent.click(primary());
      await screen.findByText(/closed · 2 bookings/);
      fireEvent.click(screen.getByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(primary());
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    };

    it("does not say nothing was cancelled, since it may have been", async () => {
      create.mockRejectedValueOnce(lost());
      renderSheet();
      await saveDec24();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).not.toMatch(/No booking was cancelled/);
      expect(alert.textContent).toMatch(/may have gone through/);
    });

    it("still says nothing was cancelled when the server answered with a refusal", async () => {
      create.mockRejectedValueOnce(
        new ApiClientError(
          { type: "about:blank", title: "Invalid", status: 422, detail: "Refused." } as never,
          "POST",
          "closures"
        )
      );
      renderSheet();
      await saveDec24();

      expect((await screen.findByRole("alert")).textContent).toMatch(/No booking was cancelled/);
    });

    it("retries unchanged under the same key and rule ids, which replays the truth", async () => {
      create.mockRejectedValueOnce(lost()).mockResolvedValueOnce({
        version: 8,
        results: [result("a", 2, 0)],
      });
      renderSheet();
      await saveDec24();
      await screen.findByRole("alert");
      fireEvent.click(primary());

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0]);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(second.body.items[0].rule.id).toBe(first.body.items[0].rule.id);
    });

    it("sends an edit after the failure as a new attempt, not a replay of the old one", async () => {
      create.mockRejectedValueOnce(lost()).mockRejectedValueOnce(conflict());
      renderSheet();
      await saveDec24();
      await screen.findByRole("alert");

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      preview.mockResolvedValueOnce([impact("2026-12-26", 1)]);
      await pickDate(0, "2026-12-26");
      fireEvent.click(primary());
      fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(primary());

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0]);
      expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
      expect(second.body.items[0].rule.id).not.toBe(first.body.items[0].rule.id);
      expect(second.body.items[0].rule.startsOn).toBe("2026-12-26");
    });

    it("shows what really applied once the reload finds the earlier try saved", async () => {
      create.mockRejectedValueOnce(lost()).mockRejectedValueOnce(conflict());
      const { reload, onClose, onStale } = renderSheet();
      await saveDec24();
      await screen.findByRole("alert");
      const saved = create.mock.calls[0]![0].body.items[0].rule;

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      preview.mockResolvedValueOnce([impact("2026-12-26", 1)]);
      await pickDate(0, "2026-12-26");
      fireEvent.click(primary());
      fireEvent.click(await screen.findByRole("radio", { name: /Cancel, notify & refund/ }));
      fireEvent.click(primary());
      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(onStale).toHaveBeenCalled());

      reload(fixtureConfig(saved), 8);

      // Named, because the form now shows Dec 26 and this reads as that date otherwise (#7978).
      const notice = await screen.findByText(/An earlier try for Dec 24 was saved: cancel 2/);
      expect(notice).toBeTruthy();
      expect(screen.queryByText(/Dec 26/)).toBeNull();
      expect(screen.queryByTestId("add-dates-primary")).toBeNull();
      expect(screen.queryByText(/No booking was cancelled/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("warns and reloads when the Manager leaves after it", async () => {
      create.mockRejectedValueOnce(lost());
      const { onClose, onStale } = renderSheet();
      await saveDec24();
      await screen.findByRole("alert");
      onStale.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      const ask = screen.getByRole("dialog", { name: "Leave this closure?" });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks Next on a missing date", () => {
    renderSheet();
    fireEvent.click(primary());
    expect(screen.getByRole("alert").textContent).toMatch(/Pick a date/);
    expect(preview).not.toHaveBeenCalled();
  });

  it("says only 'Pick a date' for an empty date, and moves focus to that field", async () => {
    renderSheet();
    fireEvent.click(primary());
    expect(screen.getByRole("alert").textContent).toBe("Pick a date.");
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByLabelText("Date")[0]));
  });

  it("keeps the catch-all message for a date that is set but not allowed", async () => {
    renderSheet();
    await pickDate(0, "2026-12-24");
    addRow();
    await pickDate(1, "2026-12-24");
    fireEvent.click(primary());
    expect(screen.getByRole("alert").textContent).toMatch(/today or later, once/);
  });

  it("moves focus to the new row's date field on Add another date", async () => {
    renderSheet();
    addRow();
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByLabelText("Date")[1]));
  });

  it("shows the character counter once per message field", () => {
    renderSheet();
    expect(screen.getAllByText("0/200")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Use one message for every date" }));
    // The row's own message field goes away; the shared one takes its place.
    expect(screen.getAllByText(/^\d+\/200$/)).toHaveLength(1);
  });

  it("moves focus to Copy hours from when the chosen weekday has no regular hours", async () => {
    renderSheet();
    await pickDate(0, "2026-12-24"); // a Thursday: the fixture has regular hours on Friday only
    fireEvent.click(screen.getByRole("radio", { name: "Same as another day" }));
    fireEvent.click(primary());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Copy hours from" }))
    );
  });

  it("explains an over-limit message on a date row", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText(/Message for guests/), {
      target: { value: "x".repeat(201) },
    });
    expect(screen.getByText("Keep it to 200 characters.").getAttribute("role")).toBe("alert");
  });

  it("explains an over-limit shared message", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use one message for every date" }));
    fireEvent.change(screen.getByLabelText(/Message for guests \(every date\)/), {
      target: { value: "x".repeat(201) },
    });
    expect(screen.getByText("Keep it to 200 characters.").getAttribute("role")).toBe("alert");
  });

  it("clears the shared-message error once the text is back under the limit", async () => {
    renderSheet();
    await pickDate(0, "2026-12-24");
    fireEvent.click(screen.getByRole("checkbox", { name: "Use one message for every date" }));
    const field = screen.getByLabelText(/Message for guests \(every date\)/);
    fireEvent.change(field, { target: { value: "x".repeat(201) } });
    fireEvent.click(primary());
    fireEvent.change(field, { target: { value: "x".repeat(181) } });
    expect(screen.queryByText("Keep it to 200 characters.")).toBeNull();
  });

  it("judges message length trimmed, as Next does", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText(/Message for guests/), {
      target: { value: `${"x".repeat(199)}  ` },
    });
    expect(screen.queryByText("Keep it to 200 characters.")).toBeNull();
  });

  it("judges the shared message length trimmed, as Next does", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use one message for every date" }));
    fireEvent.change(screen.getByLabelText(/Message for guests \(every date\)/), {
      target: { value: `${"x".repeat(199)}  ` },
    });
    expect(screen.queryByText("Keep it to 200 characters.")).toBeNull();
  });

  it("starts the date picker's weeks on Monday", () => {
    renderSheet();
    fireEvent.click(screen.getAllByLabelText("Date")[0]!);
    expect(screen.getAllByRole("columnheader")[0]!.textContent).toMatch(/^Mo/);
  });
});
