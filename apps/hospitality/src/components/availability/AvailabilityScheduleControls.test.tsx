import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AvailabilityTab } from "./availability-address.js";
import { AvailabilityScheduleControls } from "./AvailabilityScheduleControls.js";

function renderControls(isManager = true, tab: AvailabilityTab = "schedules") {
  const onTabChange = vi.fn();
  render(
    <AvailabilityScheduleControls isManager={isManager} tab={tab} onTabChange={onTabChange} />
  );
  return { onTabChange };
}

const layers = () => screen.getAllByRole("radio").map((r) => r.textContent);

describe("AvailabilityScheduleControls", () => {
  it("lists the layers Schedules, Calendar, Special dates to a Manager", () => {
    renderControls();
    expect(layers()).toEqual(["Schedules", "Calendar", "Special dates"]);
    expect(screen.getByRole("radio", { name: "Schedules" })).toBeChecked();
  });

  it("never offers the Schedules layer to a Host", () => {
    renderControls(false, "calendar");
    expect(layers()).toEqual(["Calendar", "Special dates"]);
  });

  it("asks for the layer picked", () => {
    const { onTabChange } = renderControls();
    fireEvent.click(screen.getByRole("radio", { name: "Special dates" }));
    expect(onTabChange).toHaveBeenCalledWith("special");
  });

  it("no longer carries a Change regular week… button", () => {
    renderControls(true, "calendar");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
