import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AvailabilityConfigState, Schedule } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../../utils/demo-week.fixture.js";

vi.mock("../../hooks/useViewport.js", () => ({ useViewport: () => "desktop" }));

import { AvailabilityScheduleControls } from "./AvailabilityScheduleControls.js";

function stateWith(...extra: Schedule[]): AvailabilityConfigState {
  return {
    config: { ...DEMO_WEEK_CONFIG, schedules: [...DEMO_WEEK_CONFIG.schedules, ...extra] },
    version: 1,
    source: "rows",
  } as AvailabilityConfigState;
}

function renderControls(state: AvailabilityConfigState, isManager = true) {
  return render(
    <AvailabilityScheduleControls
      venueId="venue-1"
      isManager={isManager}
      state={state}
      today="2026-11-04"
      tab="calendar"
      onTabChange={vi.fn()}
      onStale={vi.fn()}
    />
  );
}

const tab = () => screen.queryByRole("radio", { name: "Schedules" });

describe("AvailabilityScheduleControls Schedules tab", () => {
  it("shows to a Manager when every schedule is a regular week, superseded versions included", () => {
    renderControls(
      stateWith({ id: "old", name: "Regular week", kind: "regular", isRegular: false })
    );
    expect(tab()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create another schedule…" })).toBeNull();
  });

  it("shows to a Manager of a venue with one schedule", () => {
    renderControls(stateWith());
    expect(tab()).toBeInTheDocument();
  });

  it("never shows to a Host", () => {
    renderControls(stateWith(), false);
    expect(tab()).not.toBeInTheDocument();
    renderControls(
      stateWith({ id: "xmas", name: "Holiday", kind: "holiday", isRegular: false }),
      false
    );
    expect(tab()).not.toBeInTheDocument();
  });

  it("shows while a live schedule of another kind exists", () => {
    renderControls(stateWith({ id: "xmas", name: "Holiday", kind: "holiday", isRegular: false }));
    expect(tab()).toBeInTheDocument();
  });
});
