import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useRetryClosureRefunds: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpact: () => ({ data: undefined, isLoading: true, error: null, refetch: vi.fn() }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { SpecialHoursEditDrawer } from "./SpecialHoursEditDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

describe("SpecialHoursEditDrawer", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("makes Copy wait as soon as its editor is open, like the calendar's drawer", () => {
    const state: AvailabilityConfigState = {
      config: fixtureConfig(EARLY_DINNER),
      version: 4,
      source: "rows",
    };
    render(
      <ToastProvider>
        <main>
          <SpecialHoursEditDrawer
            venueId="venue-1"
            state={state}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            date={FIXTURE_DATE}
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    const copy = () => screen.getByRole("button", { name: "Copy hours…" });
    expect(copy()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit (Lunch|Dinner)/ })[0]!);
    expect(copy()).toHaveAttribute("aria-disabled", "true");
  });

  it("names a section closure on the same date by its section", () => {
    const section = {
      id: "bar",
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      tableIds: ["t1"],
      startsOn: FIXTURE_DATE,
      endsOn: FIXTURE_DATE,
    } as DateRule;
    const state: AvailabilityConfigState = {
      config: fixtureConfig(EARLY_DINNER, section),
      version: 4,
      source: "rows",
    };
    render(
      <ToastProvider>
        <main>
          <SpecialHoursEditDrawer
            venueId="venue-1"
            state={state}
            timezone={FIXTURE_TIMEZONE}
            today="2026-10-28"
            date={FIXTURE_DATE}
            sectionNames={new Map([["sec-bar", "Bar"]])}
            onStale={vi.fn()}
            onClose={vi.fn()}
          />
        </main>
      </ToastProvider>
    );
    expect(screen.getByText("Bar closed")).toBeInTheDocument();
  });
});
