import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

const saveConfig = vi.hoisted(() => vi.fn());
const clearDecision = vi.hoisted(() => vi.fn());
const decisions = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpacts: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({
    data: decisions.value,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: clearDecision, isPending: false }),
}));
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
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
import { fixtureConfig } from "./resolved-day-fixtures.js";

/**
 * availability-hub D5.1 (#8691 proposed change 1): the holiday line's "Special hours…" opens the
 * day editor on that date, not the Add special dates sheet. Christmas Day 2026 is a Friday, which
 * the fixture venue runs Lunch and Dinner on.
 */

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;
const STATE = { config: fixtureConfig(), version: 7, source: "rows" } as AvailabilityConfigState;

function renderTab() {
  return render(
    <VenueContext.Provider value={VENUE}>
      <ToastProvider>
        <main>
          <SpecialDatesTab
            venueId="venue-1"
            state={STATE}
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

const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  vi.clearAllMocks();
  decisions.value = [];
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  saveConfig.mockResolvedValue({ version: 8, changeId: "chg-8" });
  clearDecision.mockResolvedValue(undefined);
});
afterEach(() => {
  window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

function pressSpecialHours() {
  fireEvent.click(screen.getByRole("button", { name: /^(Plan|View) holidays$/ }));
  const group = screen.getByRole("group", { name: "Christmas Day, Fri, Dec 25" });
  fireEvent.click(within(group).getByRole("button", { name: "Special hours…" }));
}

describe("a holiday's Special hours…", () => {
  it("opens the day editor on that date, with its hours ready to change, and no sheet", () => {
    renderTab();
    pressSpecialHours();
    expect(screen.queryByRole("dialog", { name: "Add special dates" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeTruthy();
  });

  it("saves through the date editor, and clears an Open as usual mark once it saved", async () => {
    decisions.value = [
      { serviceDate: "2026-12-25", decision: "open_as_usual", createdAt: "2026-11-01T00:00:00Z" },
    ];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /^(Plan|View) holidays$/ }));
    const panel = screen.getByRole("region", { name: "Upcoming holidays" });
    fireEvent.click(within(panel).getByRole("button", { name: /^Decided/ }));
    fireEvent.click(within(panel).getByRole("button", { name: /^Change Christmas Day/ }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Christmas Day, Fri, Dec 25" })).getByRole(
        "button",
        { name: "Special hours…" }
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    expect(saveConfig.mock.calls[0]![0].body.expectedVersion).toBe(7);
    await waitFor(() =>
      expect(clearDecision).toHaveBeenCalledWith({ venueId: "venue-1", serviceDate: "2026-12-25" })
    );
  });

  it("leaves the line pressable again when the editor is closed without saving", () => {
    renderTab();
    pressSpecialHours();
    const line = () =>
      within(
        screen.getByRole("group", { name: "Christmas Day, Fri, Dec 25", hidden: true })
      ).getByRole("button", { name: "Special hours…", hidden: true });
    expect(line()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(line()).toBeEnabled();
  });
});
