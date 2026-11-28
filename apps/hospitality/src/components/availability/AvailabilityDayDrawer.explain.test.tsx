import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import { resolveFixtureDay } from "./resolved-day-fixtures.js";

function renderDrawer(onExplain?: (date: string) => void) {
  render(
    <main>
      <AvailabilityDayDrawer
        date="2026-10-30"
        day={resolveFixtureDay()}
        isLoading={false}
        error={null}
        viewerRole="host"
        onExplain={onExplain}
        onClose={vi.fn()}
      />
    </main>
  );
}

describe("the day drawer's Explain this day action", () => {
  it("opens the explanation for the drawer's date, for a Host too", () => {
    const onExplain = vi.fn();
    renderDrawer(onExplain);
    fireEvent.click(screen.getByRole("button", { name: "Explain this day" }));
    expect(onExplain).toHaveBeenCalledWith("2026-10-30");
  });

  it("is not shown where nothing can open it", () => {
    renderDrawer();
    expect(screen.queryByRole("button", { name: "Explain this day" })).toBeNull();
  });
});
