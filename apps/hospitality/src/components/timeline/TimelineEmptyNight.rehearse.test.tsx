import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TimelineEmptyNight, type TimelineEmptyNightProps } from "./TimelineEmptyNight.js";

function renderNight(variant: TimelineEmptyNightProps["variant"], onRehearse?: () => void) {
  render(
    <TimelineEmptyNight
      variant={variant}
      dateLabel="Wednesday, Sep 4"
      onWalkIn={vi.fn()}
      onToday={vi.fn()}
      onRehearse={onRehearse}
    />
  );
  return within(screen.getByTestId("timeline-empty-night"));
}

describe("TimelineEmptyNight rehearsal entry (SC-9, empty-night part)", () => {
  it("tonight with onRehearse: a secondary 'Run a Friday night' beside the primary Walk-in", () => {
    const onRehearse = vi.fn();
    const night = renderNight("today", onRehearse);
    const rehearse = night.getByRole("button", { name: "Run a Friday night" });
    expect(rehearse.className).toMatch(/secondary/);
    expect(night.getByRole("button", { name: "Walk-in" }).className).toMatch(/primary/);

    fireEvent.click(rehearse);
    expect(onRehearse).toHaveBeenCalledTimes(1);
  });

  it("tonight without onRehearse: no rehearsal button", () => {
    const night = renderNight("today");
    expect(night.queryByRole("button", { name: "Run a Friday night" })).toBeNull();
  });

  it("another date never shows it, even when onRehearse is provided", () => {
    const night = renderNight("otherDate", vi.fn());
    expect(night.queryByRole("button", { name: "Run a Friday night" })).toBeNull();
    expect(night.getByRole("button", { name: "Back to today" })).toBeInTheDocument();
  });
});
