import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpact: () => ({
    data: { reservations: 0, covers: 0, depositsHeld: 0, groups: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { SpecialDatesTab } from "./SpecialDatesTab.js";

const rule = (patch: Partial<DateRule> & { id: string }): DateRule =>
  ({ kind: "closure", targetKind: "venue", ...patch }) as DateRule;

const RANGE = rule({ id: "holidays", startsOn: "2026-12-24", endsOn: "2026-12-26" });
const ONE_DATE = rule({ id: "party", startsOn: "2026-12-31", endsOn: "2026-12-31" });
const PAST = rule({ id: "past", startsOn: "2026-11-02", endsOn: "2026-11-03" });
const WEEKLY = rule({
  id: "mondays",
  startsOn: "2027-01-05",
  endsOn: "2027-03-30",
  repeat: { version: 1, weekdays: [1] },
});
const ENDS_EARLY = rule({
  id: "stop",
  startsOn: "2027-02-01",
  endsOn: "2027-02-01",
  window: { version: 1, from: 1320, to: 1380 },
});

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

function renderTab(rules: DateRule[], isManager = true) {
  const state = {
    version: 7,
    config: {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules: rules,
    },
  } as unknown as AvailabilityConfigState;
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
            isManager={isManager}
          />
        </main>
      </ToastProvider>
    </VenueContext.Provider>
  );
}

describe("SpecialDatesTab: Edit on a one-date or range closure (#7984)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("offers Edit on an upcoming one-date and range closure, each named by its dates", () => {
    renderTab([RANGE, ONE_DATE]);
    expect(screen.getAllByRole("button", { name: /^Edit closure for / })).toHaveLength(2);
  });

  it.each([
    ["a Host", [RANGE], false],
    ["a closure that is over", [PAST], true],
    ["a repeating closure, which has Edit dates…", [WEEKLY], true],
    ["a closure that ends within the day", [ENDS_EARLY], true],
  ])("offers no Edit to %s", (_name, rules, isManager) => {
    renderTab(rules as DateRule[], isManager as boolean);
    expect(screen.queryByRole("button", { name: /^Edit closure for / })).toBeNull();
  });

  it("opens the closure in the Close dialog, as it is saved", () => {
    renderTab([RANGE]);
    fireEvent.click(screen.getByRole("button", { name: /^Edit closure for / }));
    const dialog = screen.getByRole("dialog", { name: "Edit closure" });
    expect(within(dialog).getByRole("radio", { name: "Date range" })).toBeChecked();
  });
});
