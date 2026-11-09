import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSetHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { SpecialDatesTab } from "./SpecialDatesTab.js";

const SECTION_CLOSURE = {
  id: "bar",
  kind: "closure",
  targetKind: "tables",
  sectionId: "sec-bar",
  tableIds: ["t1"],
  startsOn: "2026-12-24",
  endsOn: "2026-12-24",
} as DateRule;

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

function renderTab(sectionNames?: ReadonlyMap<string, string>) {
  const state = {
    version: 7,
    config: {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [SECTION_CLOSURE],
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
            isManager
            sectionNames={sectionNames}
          />
        </main>
      </ToastProvider>
    </VenueContext.Provider>
  );
}

describe("SpecialDatesTab: a section closure (ADR-032)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("names the section the closure is for", () => {
    renderTab(new Map([["sec-bar", "Bar"]]));
    expect(screen.getByText(/ · Bar closed$/)).toBeInTheDocument();
  });

  it("reads as a plain closure while the section's name is not known", () => {
    renderTab();
    expect(screen.queryByText(/Bar closed/)).toBeNull();
    expect(screen.getByText(/ · Closed$/)).toBeInTheDocument();
  });
});
