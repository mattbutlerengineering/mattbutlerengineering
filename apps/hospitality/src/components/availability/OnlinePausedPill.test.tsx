import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DateRule } from "@mbe/types";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const config = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenueId: "venue-1",
    selectedVenue: { id: "venue-1", ianaTimezone: "America/New_York", currencyCode: "USD" },
  }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useAvailabilityConfig: () => ({ data: config.value }),
}));

import { OnlinePausedPill } from "./OnlinePausedPill.js";

const FROM_SIX: DateRule = {
  id: "pause-1",
  kind: "closure",
  targetKind: "booking",
  bookingTypes: ["online"],
  startsOn: "2026-11-13",
  endsOn: null,
  window: { version: 1, from: 18 * 60, to: 2880 },
};

const renderAt = (iso: string, rule = FROM_SIX) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  config.value = { config: fixtureConfig(rule), version: 7, source: "rows" };
  render(<OnlinePausedPill />);
};

describe("OnlinePausedPill (#8032)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not say paused while a pause waits for its time: online booking is open", () => {
    renderAt("2026-11-14T10:00:00-05:00");
    expect(screen.queryByText("Online booking paused")).toBeNull();
  });

  it("says paused when its time takes every online seating of the day", () => {
    // Friday, the fixture's open day: a pause from 10:00 AM comes before lunch and dinner.
    renderAt("2026-11-13T09:00:00-05:00", {
      ...FROM_SIX,
      window: { version: 1, from: 10 * 60, to: 2880 },
    });
    expect(screen.getByText("Online booking paused")).toBeTruthy();
  });

  it("says paused once its time has come", () => {
    renderAt("2026-11-14T19:00:00-05:00");
    expect(screen.getByText("Online booking paused")).toBeTruthy();
  });
});
