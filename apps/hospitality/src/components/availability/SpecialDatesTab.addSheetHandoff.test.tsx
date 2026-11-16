import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

const saveConfig = vi.hoisted(() => vi.fn());
const revert = vi.hoisted(() => vi.fn());
const previewImpacts = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpacts: () => ({ mutateAsync: previewImpacts, isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revert, isPending: false }),
}));
vi.mock("../../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig } }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { SpecialDatesTab } from "./SpecialDatesTab.js";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";

/**
 * availability-hub D5.1 (#8691 proposed change 1, Owner decision 2026-11-15): Special hours in
 * the Add special dates sheet hands off to the day editor on the chosen date, the same editor
 * the holiday line opens, so its save, its conflict dialog and its Undo are the ones already
 * there. Friday 2026-12-25 runs Lunch and Dinner in the fixture venue.
 */

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;
const STATE = { config: fixtureConfig(), version: 7, source: "rows" } as AvailabilityConfigState;

function renderTab(state: AvailabilityConfigState = STATE) {
  return render(
    <VenueContext.Provider value={VENUE}>
      <ToastProvider>
        <main>
          <SpecialDatesTab
            venueId="venue-1"
            state={state}
            timezone="America/Los_Angeles"
            today="2026-12-01"
            onStale={vi.fn()}
            isManager
          />
        </main>
      </ToastProvider>
    </VenueContext.Provider>
  );
}

async function pickDate(iso: string) {
  fireEvent.click(screen.getAllByLabelText("Date")[0]!);
  const cell = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-date="${iso}"]`);
    if (!el) throw new Error(`no day cell for ${iso}`);
    return el;
  });
  fireEvent.click(cell);
  await waitFor(() => expect(document.querySelector("[role=grid]")).toBeNull());
}

async function handOffChristmas() {
  fireEvent.click(screen.getByRole("button", { name: "Add special dates" }));
  await pickDate("2026-12-25");
  fireEvent.click(screen.getByRole("radio", { name: "Special hours" }));
  fireEvent.click(screen.getByTestId("add-dates-primary"));
}

const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T12:00:00"));
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  previewImpacts.mockResolvedValue([]);
  getConfig.mockResolvedValue({ version: 8 });
  saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
  revert.mockResolvedValue({ version: 9, changeId: "chg-9" });
});
afterEach(() => {
  vi.useRealTimers();
  window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

describe("Add special dates, Special hours", () => {
  it("opens the day editor on the chosen date, with its hours ready to change, and closes the sheet", async () => {
    renderTab();
    await handOffChristmas();
    expect(screen.queryByRole("dialog", { name: "Add special dates" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Remove Lunch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeTruthy();
    expect(previewImpacts).not.toHaveBeenCalled();
  });

  it("saves through the day editor and offers Undo on the toast", async () => {
    renderTab();
    await handOffChristmas();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    expect(saveConfig.mock.calls[0]![0].body.expectedVersion).toBe(7);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(revert).toHaveBeenCalledTimes(1));
  });
  it("from a holiday line, leaves the holiday buttons enabled once the day editor closes", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /^(Plan|View) holidays$/ }));
    const line = await screen.findByRole("group", { name: /^Christmas Day/ });
    fireEvent.click(within(line).getByRole("button", { name: "Closed" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Special hours" }));
    fireEvent.click(screen.getByTestId("add-dates-primary"));
    await screen.findByRole("button", { name: "Remove Dinner" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Dinner" })).toBeNull());
    for (const b of within(screen.getByRole("group", { name: /^Christmas Day/ })).getAllByRole(
      "button"
    )) {
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });
  it("from a holiday already on special hours, saving the editor never removes that rule", async () => {
    const own = { ...EARLY_DINNER, id: "r1", startsOn: "2026-12-25", endsOn: "2026-12-25" };
    renderTab({ ...STATE, config: fixtureConfig(own) });
    fireEvent.click(screen.getByRole("button", { name: /^(Plan|View) holidays$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Decided/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Change Christmas Day, Fri, Dec 25" })
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: /^Christmas Day/ })).getByRole("button", {
        name: "Closed",
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Close Christmas Day" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Special hours" }));
    fireEvent.click(screen.getByTestId("add-dates-primary"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Undo" });
    // The chain's mocked reads and saves settle in microtasks; give them several turns.
    for (let turn = 0; turn < 10; turn += 1) await act(async () => Promise.resolve());
    for (const [arg] of saveConfig.mock.calls) {
      expect(arg.body.changes.remove?.dateRules ?? []).not.toContain("r1");
    }
  });
});
