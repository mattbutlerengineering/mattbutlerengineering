import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AutopilotMove } from "@mbe/types";

const api = {
  reservations: {
    getAutopilotProposals: vi.fn(),
    update: vi.fn(),
    walkIn: vi.fn(),
  },
  waitlist: { seat: vi.fn() },
};
vi.mock("./useApiClient.js", () => ({ useApiClient: () => api }));

import { useApproveAutopilotMove, type ApproveOutcome } from "./useApproveAutopilotMove.js";

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
  reason: "r",
};

const offer: AutopilotMove = {
  ...reseat,
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
};

let outcome: ApproveOutcome | null = null;

function Approve({ move }: { readonly move: AutopilotMove }) {
  const { approve, pendingMoveId } = useApproveAutopilotMove("v1", "2026-06-19");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void approve(move).then((o) => {
            outcome = o;
          });
        }}
      >
        approve
      </button>
      <output>{pendingMoveId ?? "idle"}</output>
    </>
  );
}

function renderApprove(move: AutopilotMove) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <main>
          <Approve move={move} />
        </main>
      </ToastProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "approve" }));
  return { invalidate };
}

describe("useApproveAutopilotMove", () => {
  beforeEach(() => {
    outcome = null;
    for (const fn of [
      api.reservations.getAutopilotProposals,
      api.reservations.update,
      api.reservations.walkIn,
      api.waitlist.seat,
    ]) {
      fn.mockReset();
    }
    api.reservations.getAutopilotProposals.mockResolvedValue({
      date: "2026-06-19",
      venueId: "v1",
      moves: [reseat, offer],
    });
    api.reservations.update.mockResolvedValue({ id: "r1" });
    api.reservations.walkIn.mockResolvedValue({ id: "r9" });
    api.waitlist.seat.mockResolvedValue({ id: "w1" });
  });

  it("re-checks the move against fresh proposals, then moves the booking to the shown table", async () => {
    renderApprove(reseat);

    expect(await screen.findByText("Moved Ana to Two-top")).toBeInTheDocument();
    expect(api.reservations.getAutopilotProposals).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-06-19",
    });
    expect(api.reservations.update).toHaveBeenCalledWith("r1", { tableId: "t2" });
    expect(outcome).toBe("applied");
  });

  it("shows the move as pending while it applies", async () => {
    let finish: (v: unknown) => void = () => {};
    api.reservations.update.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderApprove(reseat);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("reseat:r1>t2"));
    finish({ id: "r1" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("idle"));
  });

  it("undo puts the booking back on the table it was on", async () => {
    renderApprove(reseat);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(api.reservations.update).toHaveBeenLastCalledWith("r1", { tableId: "t6" })
    );
    expect(await screen.findByText("Moved Ana back to Booth")).toBeInTheDocument();
  });

  it("says plainly when an undo cannot be applied", async () => {
    renderApprove(reseat);
    const undo = await screen.findByRole("button", { name: "Undo" });
    api.reservations.update.mockRejectedValue(new Error("table taken"));
    fireEvent.click(undo);

    expect(
      await screen.findByText("Couldn't put Ana back. Nothing was changed.")
    ).toBeInTheDocument();
  });

  it("applies nothing and says so when the move no longer holds, and refreshes the list", async () => {
    api.reservations.getAutopilotProposals.mockResolvedValue({
      date: "2026-06-19",
      venueId: "v1",
      moves: [],
    });
    const { invalidate } = renderApprove(reseat);

    expect(await screen.findByText(/no longer holds/)).toBeInTheDocument();
    expect(api.reservations.update).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["autopilot-proposals"] });
    expect(outcome).toBe("stale");
  });

  it("seats a waiting party with a walk-in, then takes them off the waitlist, with no undo", async () => {
    renderApprove(offer);

    expect(await screen.findByText("Seated Kim at Booth")).toBeInTheDocument();
    expect(api.reservations.walkIn).toHaveBeenCalledWith({
      venueId: "v1",
      partySize: 5,
      tableId: "t6",
      guestName: "Kim",
    });
    expect(api.waitlist.seat).toHaveBeenCalledWith("w1");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(outcome).toBe("applied");
  });

  it("reports a failed write and leaves the move on the list", async () => {
    api.reservations.update.mockRejectedValue(new Error("boom"));
    renderApprove(reseat);

    expect(
      await screen.findByText("Couldn't make that move. Nothing was changed.")
    ).toBeInTheDocument();
    expect(outcome).toBe("failed");
  });
});
