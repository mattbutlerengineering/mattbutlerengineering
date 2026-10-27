import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
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

function renderSheet() {
  const onStale = vi.fn();
  const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <main>
        <AddSpecialDatesSheet
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          onStale={onStale}
          onClose={onClose}
        />
      </main>
    </ToastProvider>
  );
  return { onClose, onStale };
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
