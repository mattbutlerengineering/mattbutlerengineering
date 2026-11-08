import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import type { AvailabilityDaySummary } from "@mbe/types";
import { defaultT as t } from "../../i18n/default-t.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { useSetupNodeText } from "../venue-setup/useSetupNodeText.js";
import type { SetupNode } from "../venue-setup/setup-tree.js";
import { presentDay } from "./day-summary.js";
import { RegularWeekLine } from "./RegularWeekLine.js";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";

/** The same service on every surface that names it (PRD 16): open 690, last seating 840, close 900. */
const LUNCH = "11:30 AM–3:00 PM, last seating 2:00 PM";

describe("one service, one string", () => {
  it("prints the same hours on the regular-week line", () => {
    render(
      <RegularWeekLine
        config={fixtureConfig()}
        timeZone={FIXTURE_TIMEZONE}
        now={new Date("2026-10-28T19:00:00Z")}
      />
    );
    expect(screen.getByText(new RegExp(`Lunch ${LUNCH}`))).toBeInTheDocument();
  });

  it("prints the same hours on the hub's service row", () => {
    const node: SetupNode = {
      id: "service:regular:vs-lunch",
      kind: "service",
      name: "Lunch",
      state: {
        kind: "service",
        opensAt: 690,
        lastSeatingAt: 840,
        closesAt: 900,
        weekdays: [5],
        changes: [],
      },
      actions: [],
      children: [],
    };
    const { result } = renderHook(() => useSetupNodeText());
    expect(result.current.state(node)).toBe(`${LUNCH} · Fri`);
  });

  it("prints the same hours on the day summary", () => {
    const summary: AvailabilityDaySummary = {
      serviceDate: "2026-10-30",
      label: "Regular hours",
      scheduleId: "regular",
      serviceCount: 1,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: true },
      services: [
        { venueServiceId: "vs-lunch", name: "Lunch", opensAt: 690, lastSeatingAt: 840, closesAt: 900 },
      ],
    };
    const { result } = renderHook(() => useVenueFormat());
    const format: VenueFormat = result.current;
    expect(presentDay("2026-10-30", summary, true, t, format).services[0]?.text).toBe(
      `Lunch ${LUNCH}`
    );
  });
});
