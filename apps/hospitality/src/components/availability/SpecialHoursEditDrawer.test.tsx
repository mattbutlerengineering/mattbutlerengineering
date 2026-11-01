import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
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
    const copy = () => screen.getByRole("button", { name: "Copy to other days…" });
    expect(copy()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit / })[0]!);
    expect(copy()).toHaveAttribute("aria-disabled", "true");
  });
});
