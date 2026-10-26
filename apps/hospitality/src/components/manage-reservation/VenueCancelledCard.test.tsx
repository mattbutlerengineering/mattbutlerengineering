import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import type { ManagedVenueCancellation } from "@mbe/api-client";
import { VenueCancelledCard } from "./VenueCancelledCard.js";

const createForVenue = vi.fn();
const confirmForVenue = vi.fn();
vi.mock("../../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: () => ({ holds: { createForVenue, confirmForVenue } }),
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const OFFERS: ManagedVenueCancellation["offers"] = [
  { id: "2026-11-06T02:00:00.000Z", date: "2026-11-05", startTime: "2026-11-06T02:00:00.000Z" },
  { id: "2026-11-08T02:00:00.000Z", date: "2026-11-07", startTime: "2026-11-08T02:00:00.000Z" },
  { id: "2026-11-09T02:15:00.000Z", date: "2026-11-08", startTime: "2026-11-09T02:15:00.000Z" },
];

const format = {
  formatTime: (iso: string) => `T(${iso})`,
  formatCalendarDate: (d: string) => `D(${d})`,
};

function renderCard(
  cancellation: ManagedVenueCancellation,
  extra: { preferredOfferId?: string } = {}
) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const onRebooked = vi.fn();
  const view = render(
    <main>
      <VenueCancelledCard
        venue={{ name: "The Oak Table", slug: "the-oak-table", phone: "+15035551234" }}
        reservation={{ guestName: "Jane Doe", guestEmail: "jane@example.com", partySize: 2 }}
        cancellation={cancellation}
        format={format}
        onRefresh={onRefresh}
        onRebooked={onRebooked}
        {...extra}
      />
    </main>
  );
  return { ...view, onRefresh, onRebooked };
}

const problem = (status: number) =>
  new ApiClientError({ type: "about:blank", title: "x", status, detail: "nope" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VenueCancelledCard", () => {
  it("shows the cancelled heading, the refund status and one button per offer", () => {
    renderCard({ refundStatus: "done", offers: OFFERS });
    expect(screen.getByText("Your reservation was cancelled")).toBeDefined();
    expect(screen.getByText(/deposit has been refunded/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /^Rebook/ })).toHaveLength(3);
  });

  it("says nothing about a refund when none applies", () => {
    renderCard({ refundStatus: "none", offers: OFFERS });
    expect(screen.queryByText(/refund/i)).toBeNull();
  });

  it("shows the failed-refund line with a way to reach the venue", () => {
    renderCard({ refundStatus: "failed", offers: OFFERS });
    expect(screen.getByText(/couldn.t refund your deposit automatically/i)).toBeDefined();
  });

  it("with no offers shows only the picker link", () => {
    renderCard({ refundStatus: "none", offers: [] });
    expect(screen.queryByRole("button", { name: /^Rebook/ })).toBeNull();
    const link = screen.getByRole("link", { name: /other dates and times/i });
    expect(link.getAttribute("href")).toBe(`${import.meta.env.BASE_URL}book/the-oak-table`);
  });

  it("always offers Other dates alongside offers", () => {
    renderCard({ refundStatus: "none", offers: OFFERS });
    expect(screen.getByRole("link", { name: /other dates and times/i })).toBeDefined();
  });

  it("rebooks on tap: holds the slot, confirms with the guest, hands over the new token", async () => {
    createForVenue.mockResolvedValue({ hold: { id: "hold_1" }, sessionId: "s" });
    confirmForVenue.mockResolvedValue({ reservation: { id: "res_2" }, manageToken: "new-token" });
    const { onRebooked } = renderCard({ refundStatus: "none", offers: OFFERS });

    fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[1]!);

    await waitFor(() => expect(onRebooked).toHaveBeenCalledWith("new-token"));
    expect(createForVenue).toHaveBeenCalledWith("the-oak-table", {
      date: "2026-11-07",
      startTime: "2026-11-08T02:00:00.000Z",
      partySize: 2,
    });
    expect(confirmForVenue).toHaveBeenCalledWith("the-oak-table", "hold_1", {
      guestName: "Jane Doe",
      guestEmail: "jane@example.com",
    });
  });

  it.each([409, 422])(
    "a %s on the hold says the time was taken and refreshes the offers",
    async (status) => {
      createForVenue.mockRejectedValue(problem(status));
      const { onRefresh, onRebooked } = renderCard({ refundStatus: "none", offers: OFFERS });

      fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[0]!);

      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("alert").textContent).toMatch(/that time was just taken/i);
      expect(onRebooked).not.toHaveBeenCalled();
      expect(confirmForVenue).not.toHaveBeenCalled();
    }
  );

  it("any other failure shows a retryable error and does not refresh", async () => {
    createForVenue.mockRejectedValue(problem(500));
    const { onRefresh } = renderCard({ refundStatus: "none", offers: OFFERS });

    fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[0]!);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t rebook/i);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("tells the guest when the time from their link is no longer offered", () => {
    renderCard({ refundStatus: "none", offers: OFFERS }, { preferredOfferId: "gone" });
    expect(screen.getByRole("alert").textContent).toMatch(/that time was just taken/i);
  });

  it("has no axe violations", async () => {
    const { container } = renderCard({ refundStatus: "failed", offers: OFFERS });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
