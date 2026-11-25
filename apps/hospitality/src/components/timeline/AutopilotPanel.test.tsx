import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AutopilotMove } from "@mbe/types";
import { AutopilotPanel } from "./AutopilotPanel.js";

const reseat: AutopilotMove = {
  id: "reseat:r1>t2",
  kind: "reseat",
  partyLabel: "Ana",
  reservationId: "r1",
  waitlistEntryId: null,
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
  reservationId: null,
  waitlistEntryId: "w1",
  partySize: 5,
  fromTableId: null,
  fromTableName: null,
  toTableId: "t6",
  toTableName: "Booth",
  startTime: "2026-06-19T01:00:00.000Z",
  endTime: "2026-06-19T02:30:00.000Z",
  reason: "english server reason",
};

function setup(
  moves: readonly AutopilotMove[] = [reseat, offer],
  approvingMoveId: string | null = null
) {
  const onDismissMove = vi.fn();
  const onDismissNight = vi.fn();
  const onApproveMove = vi.fn().mockResolvedValue("applied");
  render(
    <AutopilotPanel
      moves={moves}
      approvingMoveId={approvingMoveId}
      onApproveMove={onApproveMove}
      onDismissMove={onDismissMove}
      onDismissNight={onDismissNight}
    />
  );
  return { onApproveMove, onDismissMove, onDismissNight };
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

  it("says nothing moves until approved", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    expect(screen.getByText("Nothing moves until you approve it.")).toBeTruthy();
  });

  it("approves one move in one tap, with no confirm step", () => {
    const { onApproveMove } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve the suggestion for Kim" }));
    expect(onApproveMove).toHaveBeenCalledWith(offer);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("says before the tap that seating a waiting party can't be undone, and not for a reseat", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    const notice = "Seats them now. This can't be undone.";

    const items = screen.getAllByRole("listitem");
    expect(items[0]!.textContent).not.toContain(notice);
    expect(items[1]!.textContent).toContain(notice);

    const offerApprove = screen.getByRole("button", { name: "Approve the suggestion for Kim" });
    expect(offerApprove).toHaveAccessibleDescription(notice);
    const reseatApprove = screen.getByRole("button", { name: "Approve the suggestion for Ana" });
    expect(reseatApprove.hasAttribute("aria-describedby")).toBe(false);
  });

  it("disables the move being applied and says it is busy", () => {
    setup([reseat, offer], reseat.id);
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    const busy = screen.getByRole("button", { name: "Approve the suggestion for Ana" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    // Another move can still not be double-applied: the whole row set waits for the one in flight.
    expect(
      screen
        .getByRole("button", { name: "Approve the suggestion for Kim" })
        .hasAttribute("disabled")
    ).toBe(true);
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

  it("names an unnamed party by its size, never by an id", () => {
    setup([{ ...reseat, partyLabel: null }]);
    fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
    expect(screen.getByText("Move Party of 2 (2) from Booth to Two-top")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Dismiss the suggestion for Party of 2" })
    ).toBeTruthy();
  });

  describe("focus after approving one move", () => {
    function ApproveHarness({ outcome }: { outcome: "applied" | "stale" | "failed" }) {
      const [moves, setMoves] = useState<readonly AutopilotMove[]>([reseat, offer]);
      return (
        <AutopilotPanel
          moves={moves}
          approvingMoveId={null}
          onApproveMove={async (move) => {
            if (outcome !== "failed") setMoves((m) => m.filter((x) => x.id !== move.id));
            return outcome;
          }}
          onDismissMove={() => undefined}
          onDismissNight={() => undefined}
        />
      );
    }

    it("lands on the next row once the approved move leaves the list", async () => {
      render(<ApproveHarness outcome="applied" />);
      fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
      fireEvent.click(screen.getByRole("button", { name: "Approve the suggestion for Ana" }));
      const next = await screen.findByRole("button", { name: "Dismiss the suggestion for Kim" });
      await waitFor(() => expect(document.activeElement).toBe(next));
    });

    it("returns to the same Approve button when the move failed", async () => {
      render(<ApproveHarness outcome="failed" />);
      fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
      const approve = screen.getByRole("button", { name: "Approve the suggestion for Ana" });
      fireEvent.click(approve);
      await waitFor(() => expect(document.activeElement).toBe(approve));
    });
  });

  describe("focus after dismissing one move", () => {
    const third: AutopilotMove = { ...offer, id: "offer:w2>t9", partyLabel: "Lee" };

    function Harness({ initial }: { initial: readonly AutopilotMove[] }) {
      const [moves, setMoves] = useState(initial);
      return (
        <AutopilotPanel
          moves={moves}
          approvingMoveId={null}
          onApproveMove={async () => "applied"}
          onDismissMove={(id) => setMoves((m) => m.filter((x) => x.id !== id))}
          onDismissNight={() => undefined}
        />
      );
    }

    function openAndDismiss(initial: readonly AutopilotMove[], party: string) {
      render(<Harness initial={initial} />);
      fireEvent.click(screen.getByRole("button", { name: /Autopilot/ }));
      fireEvent.click(screen.getByRole("button", { name: `Dismiss the suggestion for ${party}` }));
    }

    it("moves to the next row's dismiss button", () => {
      openAndDismiss([reseat, offer, third], "Ana");
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Dismiss the suggestion for Kim" })
      );
    });

    it("moves to the previous row's when the last row goes", () => {
      openAndDismiss([reseat, offer, third], "Lee");
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Dismiss the suggestion for Kim" })
      );
    });

    it("stays on the one remaining row when two were listed", () => {
      openAndDismiss([reseat, offer], "Kim");
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Dismiss the suggestion for Ana" })
      );
    });
  });
});
