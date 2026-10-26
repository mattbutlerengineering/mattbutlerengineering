import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfigState,
  ClosureCallListEntry,
  ClosureSummary,
  DateRule,
} from "@mbe/types";

const summaries = vi.hoisted(() => ({ value: [] as ClosureSummary[] }));
const callList = vi.hoisted(() => ({ value: [] as ClosureCallListEntry[] }));
const reopen = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: summaries.value, isLoading: false, error: null }),
  useClosureCallList: () => ({ data: callList.value, isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: retry, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { SpecialDatesTab } from "./SpecialDatesTab.js";

const summary = (ruleId: string, over: Partial<ClosureSummary> = {}): ClosureSummary => ({
  ruleId,
  total: 14,
  cancelled: 14,
  sent: 11,
  rebooked: 1,
  unreachable: 2,
  refundFailed: 0,
  refundPending: 0,
  ...over,
});

const RULES = [
  {
    id: "xmas",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    guestMessage: "Closed for a private event.",
  },
  {
    id: "mondays",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2027-01-05",
    endsOn: "2027-03-30",
    repeat: { version: 1, weekdays: [1] },
  },
] as DateRule[];

const STATE = {
  version: 7,
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: RULES,
  },
} as unknown as AvailabilityConfigState;

function renderTab(isManager = true, state: AvailabilityConfigState = STATE) {
  return render(
    <ToastProvider>
      <main>
        <SpecialDatesTab
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          onStale={vi.fn()}
          isManager={isManager}
        />
      </main>
    </ToastProvider>
  );
}

describe("SpecialDatesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summaries.value = [summary("xmas")];
    callList.value = [];
    reopen.mockResolvedValue({ version: 6, changeId: "c" });
    retry.mockResolvedValue({ enqueued: 1 });
  });

  it("lists closures with Sent, Rebooked and Unreachable counts", () => {
    renderTab();
    expect(screen.getByText("Closed for a private event.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Sent 11 · Rebooked 1 · Unreachable 2")).toBeTruthy();
    expect(screen.getByText("Closed · Repeating")).toBeTruthy();
  });

  it("skips one date of a repeating closure and leaves the series alone", async () => {
    saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "This and following" })).toBeTruthy();
    expect(within(dialog).getByRole("radio", { name: "All dates in the series" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const { body } = saveConfig.mock.calls[0]![0];
    expect(body.expectedVersion).toBe(7);
    expect(body.changes.remove).toEqual({});
    expect(body.changes.upsert.dateRules).toHaveLength(1);
    expect(body.changes.upsert.dateRules[0]).toMatchObject({
      kind: "skip",
      seriesId: "mondays",
      startsOn: "2027-01-11",
      endsOn: "2027-01-11",
    });
  });

  it("refuses to skip a date that is already skipped, or to edit one that has its own change", () => {
    const skip = {
      id: "skip-1",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2027-01-11",
      endsOn: "2027-01-11",
      seriesId: "mondays",
    } as DateRule;
    const state = {
      ...STATE,
      config: { ...STATE.config, dateRules: [...RULES, skip] },
    } as AvailabilityConfigState;
    renderTab(true, state);
    expect(screen.getByText(/Skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip this date" }));
    expect(
      within(dialog).getByText("This date already has its own change. Remove it first.")
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit this date…" }));
    expect(screen.getByRole("dialog", { name: "Edit dates" })).toBeTruthy();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("names the closure, not the hours, when a series edit would strand bookings", async () => {
    saveConfig.mockRejectedValue({
      problemDetails: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "x",
        code: "stranded-bookings",
        reservations: [
          { id: "r1", startTime: "2027-01-11T18:00:00Z", partySize: 2, reason: "closed" },
        ],
      },
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this date" }));

    expect(await screen.findByText(/would be left without service by this change/)).toBeTruthy();
    expect(screen.queryByText(/outside the new hours/)).toBeNull();
  });

  it("this and following ends the series before the date and starts a new one", async () => {
    saveConfig.mockResolvedValue({ version: 8, changeId: "c" });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit dates…" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "This and following" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const rows = saveConfig.mock.calls[0]![0].body.changes.upsert.dateRules as DateRule[];
    expect(rows.find((r) => r.id === "mondays")?.endsOn).toBe("2027-01-10");
    expect(rows.find((r) => r.id !== "mondays")).toMatchObject({
      kind: "closure",
      startsOn: "2027-01-11",
    });
  });

  it("filters to repeating closures", () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Repeating" }));
    expect(screen.queryByText("Sent 11 · Rebooked 1 · Unreachable 2")).toBeNull();
    expect(screen.getByText("Closed · Repeating")).toBeTruthy();
  });

  it("shows the empty state when nothing matches", () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Past" }));
    expect(screen.getByText("No special dates")).toBeTruthy();
  });

  it("reopens, telling the cancelled guests by default", async () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: /Tell the cancelled guests/ })
    ).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith({
        venueId: "venue-1",
        ruleId: "xmas",
        tellCancelledGuests: true,
      })
    );
  });

  it("reopens without telling guests when the box is cleared", async () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith(expect.objectContaining({ tellCancelledGuests: false }))
    );
  });

  it("retries refunds of a closure that still has a failed one", async () => {
    summaries.value = [summary("xmas", { refundFailed: 1 })];
    renderTab();
    expect(screen.getByText("Refund failed (1)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry refunds" }));

    await waitFor(() => expect(retry).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "xmas" }));
  });

  it("keeps a retry for a Tonight close-early whose rule ended", async () => {
    summaries.value = [summary("tonight-1", { refundPending: 2 })];
    renderTab();
    expect(screen.getByText("Earlier closure")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry refunds" }));

    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "tonight-1" })
    );
  });

  it("offers the call list only where guests are unreachable, and lists just those guests", () => {
    summaries.value = [summary("xmas", { unreachable: 1 }), summary("mondays", { unreachable: 0 })];
    callList.value = [
      {
        outcomeId: "o-2",
        reservationId: "r-2",
        guestName: "Rivera",
        partySize: 4,
        startTime: "2026-12-25T01:30:00.000Z",
        guestPhone: "+15555550100",
      },
    ];
    renderTab();
    const buttons = screen.getAllByRole("button", { name: "Call list" });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rivera")).toBeTruthy();
    expect(within(dialog).getByText("+15555550100")).toBeTruthy();
    expect(within(dialog).getAllByRole("row")).toHaveLength(2);
  });

  it("hides Remove and Retry from a Host but keeps the call list", () => {
    summaries.value = [summary("xmas", { refundFailed: 1 })];
    renderTab(false);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry refunds" })).toBeNull();
    expect(screen.getByRole("button", { name: "Call list" })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = renderTab();
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
