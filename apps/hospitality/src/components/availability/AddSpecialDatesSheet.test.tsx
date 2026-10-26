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

const impact = (date: string, count: number): ClosureImpact => ({
  reservations: count,
  covers: count * 2,
  depositsHeld: 0,
  groups:
    count === 0
      ? []
      : [
          {
            groupKey: `${date}:closed`,
            date,
            kind: "closed",
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
          onStale={vi.fn()}
          onClose={onClose}
        />
      </main>
    </ToastProvider>
  );
  return { onClose };
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

  it("saves a Special hours row through the config save, then the closure with that version", async () => {
    preview.mockResolvedValue([impact("2026-12-26", 0)]);
    saveConfig.mockResolvedValue({ version: 8, changeId: "chg-hours" });
    create.mockResolvedValue({ version: 9, results: [result("b", 0, 0)] });
    renderSheet();
    await pickDate(0, "2026-12-25");
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    addRow();
    await pickDate(1, "2026-12-26");
    // Closed is the default for the second row, with a message of its own.
    fireEvent.change(screen.getAllByLabelText(/Message for guests/)[1]!, {
      target: { value: "Closed for the holiday" },
    });

    expect(primary().textContent).toBe("Next");
    fireEvent.click(primary());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const config = saveConfig.mock.calls[0]![0];
    expect(config.body.expectedVersion).toBe(7);
    expect(config.body.changes.upsert.dateRules).toHaveLength(1);
    expect(config.body.changes.upsert.dateRules[0]).toMatchObject({
      kind: "special_hours",
      startsOn: "2026-12-25",
      endsOn: "2026-12-25",
    });
    const closures = create.mock.calls[0]![0].body;
    expect(closures.expectedVersion).toBe(8);
    expect(closures.items).toHaveLength(1);
    expect(closures.items[0].rule).toMatchObject({
      startsOn: "2026-12-26",
      guestMessage: "Closed for the holiday",
    });
  });

  it("copies the regular Friday's hours for a Same as Friday row", async () => {
    saveConfig.mockResolvedValue({ version: 8, changeId: "chg-same" });
    const { onClose } = renderSheet();
    await pickDate(0, "2026-12-31"); // a Thursday
    fireEvent.click(screen.getByRole("radio", { name: "Same as another day" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Copy hours from" }));
    fireEvent.click(await screen.findByRole("option", { name: "Same as Friday" }));

    expect(primary().textContent).toBe("Save 1 date");
    fireEvent.click(primary());

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const [rule] = saveConfig.mock.calls[0]![0].body.changes.upsert.dateRules;
    expect(rule).toMatchObject({ kind: "special_hours", startsOn: "2026-12-31" });
    expect(
      rule.payload.services.map((s: { venueServiceId: string; opensAt: number }) => [
        s.venueServiceId,
        s.opensAt,
      ])
    ).toEqual([
      ["vs-lunch", 690],
      ["vs-dinner", 1020],
    ]);
    expect(create).not.toHaveBeenCalled();
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

  it("keeps the saved hours when the closures are refused, and does not save them twice", async () => {
    preview.mockResolvedValue([impact("2026-12-26", 0)]);
    saveConfig.mockResolvedValue({ version: 8, changeId: "chg-hours" });
    create.mockRejectedValueOnce(new Error("version moved")).mockResolvedValueOnce({
      version: 9,
      results: [result("b", 0, 0)],
    });
    renderSheet();
    await pickDate(0, "2026-12-25");
    fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
    addRow();
    await pickDate(1, "2026-12-26");
    fireEvent.click(primary());

    await screen.findByText(/The special hours were saved, but the closures were not/);
    expect(screen.getByText(/No booking was cancelled/)).toBeTruthy();

    fireEvent.click(primary());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(saveConfig).toHaveBeenCalledTimes(1);
    // Retried under the same key and rule id, from the version the hours left.
    expect(create.mock.calls[1]![0].idempotencyKey).toBe(create.mock.calls[0]![0].idempotencyKey);
    expect(create.mock.calls[1]![0].body.items[0].rule.id).toBe(
      create.mock.calls[0]![0].body.items[0].rule.id
    );
  });

  it("blocks Next on a missing date", () => {
    renderSheet();
    fireEvent.click(primary());
    expect(screen.getByRole("alert").textContent).toMatch(/Pick a date/);
    expect(preview).not.toHaveBeenCalled();
  });
});
