import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AutopilotMove } from "@mbe/types";
import { AutopilotPanel } from "./AutopilotPanel.js";

const reseat: AutopilotMove = {
  id: "reseat:r1>t2",
  kind: "reseat",
  partyLabel: "Ana",
  partySize: 2,
  fromTableId: "t6",
  fromTableName: "Booth",
  toTableId: "t2",
  toTableName: "Two-top",
  startTime: "2026-06-19T02:00:00.000Z",
  endTime: "2026-06-19T03:30:00.000Z",
  reason: "english server reason",
};

const offer: AutopilotMove = {
  id: "offer:w1>t6",
  kind: "waitlist_offer",
  partyLabel: "Kim",
  partySize: 5,
  fromTableId: null,
  fromTableName: null,
  toTableId: "t6",
  toTableName: "Booth",
  startTime: "2026-06-19T01:00:00.000Z",
  endTime: "2026-06-19T02:30:00.000Z",
  reason: "english server reason",
};

function setup(moves: readonly AutopilotMove[] = [reseat, offer]) {
  const onDismissMove = vi.fn();
  const onDismissNight = vi.fn();
  render(
    <AutopilotPanel moves={moves} onDismissMove={onDismissMove} onDismissNight={onDismissNight} />
  );
  return { onDismissMove, onDismissNight };
}

describe("AutopilotPanel", () => {
  it("renders nothing when there are no suggestions", () => {
    setup([]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("opens collapsed with the suggestion count in the button's name", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Autopilot: 2 suggestions" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("is a labelled region with a heading", () => {
    setup();
    const region = screen.getByRole("region", { name: "Autopilot" });
    expect(within(region).getByRole("heading", { name: "Autopilot" })).toBeTruthy();
  });

  it("lists each move in plain words: who, from, to, why", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot: 2 suggestions/ }));

    const items = within(screen.getByRole("list", { name: "Suggested moves" })).getAllByRole(
      "listitem"
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Move Ana (2) from Booth to Two-top");
    expect(items[0]!.textContent).toContain("Frees Booth for a waiting party.");
    expect(items[1]!.textContent).toContain("Seat Kim (5) at Booth");
    expect(items[1]!.textContent).toContain("Booth is free and fits them.");
  });

  it("says suggestions only: it has no approve control", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    expect(screen.getByText(/Suggestions only/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /approve|apply|accept/i })).toBeNull();
  });

  it("dismisses one move by id", () => {
    const { onDismissMove } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss the suggestion for Ana" }));
    expect(onDismissMove).toHaveBeenCalledWith("reseat:r1>t2");
  });

  it("dismisses for tonight", () => {
    const { onDismissNight } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss for tonight" }));
    expect(onDismissNight).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the toggle", () => {
    setup();
    const toggle = screen.getByRole("button", { name: /Autopilot/ });
    fireEvent.click(toggle);
    const dismiss = screen.getByRole("button", { name: "Dismiss for tonight" });
    dismiss.focus();

    fireEvent.keyDown(dismiss, { key: "Escape" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});
