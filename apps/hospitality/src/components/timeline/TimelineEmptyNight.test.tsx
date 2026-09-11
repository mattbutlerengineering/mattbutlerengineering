import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TimelineEmptyNight, type TimelineEmptyNightProps } from "./TimelineEmptyNight.js";

function renderNight(variant: TimelineEmptyNightProps["variant"]) {
  const onWalkIn = vi.fn();
  const onToday = vi.fn();
  render(
    <TimelineEmptyNight
      variant={variant}
      dateLabel="Wednesday, Sep 4"
      onWalkIn={onWalkIn}
      onToday={onToday}
    />
  );
  return { onWalkIn, onToday, overlay: screen.getByTestId("timeline-empty-night") };
}

describe("TimelineEmptyNight (A7.1 / A7.2 leaf half)", () => {
  it("tonight: 'Quiet so far.' and a primary Walk-in", () => {
    const { onWalkIn, onToday, overlay } = renderNight("today");
    expect(within(overlay).getByRole("heading", { name: "Quiet so far." })).toBeInTheDocument();
    expect(
      within(overlay).getByText("Nothing on the book for tonight. Walk-ins go straight to a table.")
    ).toBeInTheDocument();
    const walkIn = within(overlay).getByRole("button", { name: "Walk-in" });
    expect(walkIn.className).toMatch(/primary/);
    expect(within(overlay).queryByRole("button", { name: "Back to today" })).toBeNull();

    fireEvent.click(walkIn);
    expect(onWalkIn).toHaveBeenCalledTimes(1);
    expect(onToday).not.toHaveBeenCalled();
  });

  it("another date: 'Nothing on the book for <dateLabel>.' and a secondary Back to today", () => {
    const { onWalkIn, onToday, overlay } = renderNight("otherDate");
    expect(
      within(overlay).getByRole("heading", { name: "Nothing on the book for Wednesday, Sep 4." })
    ).toBeInTheDocument();
    expect(
      within(overlay).getByText("Bookings for that night will show here.")
    ).toBeInTheDocument();
    const today = within(overlay).getByRole("button", { name: "Back to today" });
    expect(today.className).toMatch(/secondary/);
    expect(within(overlay).queryByRole("button", { name: "Walk-in" })).toBeNull();

    fireEvent.click(today);
    expect(onToday).toHaveBeenCalledTimes(1);
    expect(onWalkIn).not.toHaveBeenCalled();
  });

  it.each(["today", "otherDate"] as const)("%s is never an alert (A7.2)", (variant) => {
    const { overlay } = renderNight(variant);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(overlay).not.toHaveAttribute("role");
    expect(overlay.querySelector('[role="alert"]')).toBeNull();
  });

  it("gives the action a 44 px minimum under the coarse-pointer / tablet query", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "TimelineEmptyNight.module.css"),
      "utf-8"
    );
    const coarseBlock = css.match(
      /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
    );
    expect(coarseBlock).not.toBeNull();
    expect(coarseBlock?.[1]).toMatch(/\.card button\s*\{[^}]*min-block-size:\s*44px/);
  });
});
