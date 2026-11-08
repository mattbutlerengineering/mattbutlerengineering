import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The real hook and model run; only the reads under them are stubbed.
const reads = vi.hoisted(() => ({ staff: {} as unknown }));
vi.mock("../../hooks/useStaffTonight.js", () => ({ useStaffTonight: () => reads.staff }));
vi.mock("../../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [] }),
}));
vi.mock("../../hooks/useNow.js", () => ({ useNow: () => new Date("2026-11-08T20:00:00Z") }));

import { TodayLine } from "./TodayLine.js";

const DINNER = {
  venueServiceId: "vs-d",
  name: "Dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
};

function stage(bookingTypes: string[]) {
  reads.staff = {
    serviceDate: "2026-11-08",
    config: { venueServices: [{ id: "vs-d", name: "Dinner" }] },
    rules: [{ id: "c1", kind: "closure", targetKind: "booking", startsOn: "2026-11-08" }],
    summary: {
      serviceDate: "2026-11-08",
      label: "Regular week",
      scheduleId: "s1",
      serviceCount: 1,
      closures: [{ ruleId: "c1", targetKind: "booking", bookingTypes, from: 0, to: 2880 }],
      bookingOpen: { online: true, phone: true, waitlist: true },
      services: [DINNER],
    },
    readStatus: "ready",
    refetch: vi.fn(),
  };
}

function renderLine(bannerShowsOnline: boolean) {
  return render(
    <MemoryRouter>
      <TodayLine venueId="venue-1" bannerShowsOnline={bannerShowsOnline} />
    </MemoryRouter>
  );
}

describe("TodayLine with the online-pause banner", () => {
  beforeEach(() => stage(["online", "phone"]));

  it("says the online pause itself when no banner does", () => {
    renderLine(false);
    expect(screen.getByRole("list", { name: "In force tonight" })).toHaveTextContent(
      "Online and phone paused"
    );
  });

  it("says it once: with the banner up the line keeps only the phone", () => {
    renderLine(true);
    const items = screen.getByRole("list", { name: "In force tonight" });
    expect(items).toHaveTextContent("Phone paused");
    expect(items).not.toHaveTextContent(/Online/);
  });

  it("drops the item altogether when online was the only channel", () => {
    stage(["online"]);
    renderLine(true);
    expect(screen.queryByRole("list", { name: "In force tonight" })).toBeNull();
    expect(screen.getByRole("region", { name: "Today" })).not.toHaveTextContent(/Online/);
  });
});
