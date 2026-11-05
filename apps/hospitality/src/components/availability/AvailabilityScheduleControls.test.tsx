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
      onCreateSchedule={vi.fn()}
      onStale={vi.fn()}
    />
  );
}

const tab = () => screen.queryByRole("radio", { name: "Schedules" });

describe("AvailabilityScheduleControls Schedules tab", () => {
  it("is absent when every schedule is a regular week, superseded versions included", () => {
    renderControls(
      stateWith({ id: "old", name: "Regular week", kind: "regular", isRegular: false })
    );
    expect(tab()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another schedule…" })).toBeInTheDocument();
  });

  it("shows while a live schedule of another kind exists", () => {
    renderControls(stateWith({ id: "xmas", name: "Holiday", kind: "holiday", isRegular: false }));
    expect(tab()).toBeInTheDocument();
  });

  it("lists a schedule saved before this change with kind alternate", () => {
    renderControls(
      stateWith({ id: "thu", name: "Thu–Fri hours", kind: "alternate", isRegular: false })
    );
    expect(tab()).toBeInTheDocument();
  });

  it("ignores an archived schedule of another kind", () => {
    renderControls(
      stateWith({
        id: "gone",
        name: "Holiday",
        kind: "holiday",
        isRegular: false,
        archivedAt: "2026-10-01T00:00:00Z",
      })
    );
    expect(tab()).not.toBeInTheDocument();
  });
});
