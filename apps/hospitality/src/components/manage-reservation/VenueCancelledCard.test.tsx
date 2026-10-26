import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import type { ManagedVenueCancellation } from "@mbe/api-client";
import { VenueCancelledCard } from "./VenueCancelledCard.js";

const rebookManaged = vi.fn();
vi.mock("../../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: () => ({ reservations: { rebookManaged } }),
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
  formatInstant: (v: string | number | Date) => `I(${String(v)})`,
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
        token="old-token"
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
    renderCard({
      refundStatus: "done",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });
    expect(screen.getByText("Your reservation was cancelled")).toBeDefined();
    expect(screen.getByText(/deposit has been refunded/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /^Rebook/ })).toHaveLength(3);
  });

  it("names the closure date and quotes the venue's message as text", () => {
    renderCard({
      refundStatus: "none",
      closureDate: "2026-12-24",
      closureMessage: "<b>Closed</b> for a private event",
      offers: [],
      rebooked: null,
    });
    expect(screen.getByText("The Oak Table is closed D(2026-12-24)")).toBeDefined();
    const quote = screen.getByText(/for a private event/);
    expect(quote.textContent).toBe("\u201C<b>Closed</b> for a private event\u201D");
    expect(quote.querySelector("b")).toBeNull();
  });

  it("omits the quote when the venue left no message", () => {
    renderCard({
      refundStatus: "none",
      closureDate: "2026-12-24",
      closureMessage: null,
      offers: [],
      rebooked: null,
    });
    expect(screen.queryByText(/\u201C/)).toBeNull();
  });

  it("says nothing about a refund when none applies", () => {
    renderCard({
      refundStatus: "none",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });
    expect(screen.queryByText(/refund/i)).toBeNull();
  });

  it("shows the failed-refund line with a way to reach the venue", () => {
    renderCard({
      refundStatus: "failed",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });
    expect(screen.getByText(/couldn.t refund your deposit automatically/i)).toBeDefined();
  });

  it("with no offers shows only the picker link", () => {
    renderCard({
      refundStatus: "none",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: [],
      rebooked: null,
    });
    expect(screen.queryByRole("button", { name: /^Rebook/ })).toBeNull();
    const link = screen.getByRole("link", { name: /other dates and times/i });
    expect(link.getAttribute("href")).toBe(`${import.meta.env.BASE_URL}book/the-oak-table`);
  });

  it("always offers Other dates alongside offers", () => {
    renderCard({
      refundStatus: "none",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });
    expect(screen.getByRole("link", { name: /other dates and times/i })).toBeDefined();
  });

  it("rebooks on tap through the server and hands over the new token", async () => {
    rebookManaged.mockResolvedValue({
      reservationId: "res_2",
      startTime: "2026-11-08T02:00:00.000Z",
      manageToken: "new-token",
    });
    const { onRebooked } = renderCard({
      refundStatus: "none",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[1]!);

    await waitFor(() => expect(onRebooked).toHaveBeenCalledWith("new-token"));
    expect(rebookManaged).toHaveBeenCalledWith("old-token", "2026-11-08T02:00:00.000Z");
  });

  it.each([409, 422])(
    "a %s on the rebook says the time was taken and refreshes the offers",
    async (status) => {
      rebookManaged.mockRejectedValue(problem(status));
      const { onRefresh, onRebooked } = renderCard({
        refundStatus: "none",
        closureDate: "2026-11-05",
        closureMessage: null,
        offers: OFFERS,
        rebooked: null,
      });

      fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[0]!);

      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("alert").textContent).toMatch(/that time was just taken/i);
      expect(onRebooked).not.toHaveBeenCalled();
    }
  );

  it("any other failure shows a retryable error and does not refresh", async () => {
    rebookManaged.mockRejectedValue(problem(500));
    const { onRefresh } = renderCard({
      refundStatus: "none",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^Rebook/ })[0]!);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t rebook/i);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("tells the guest when the time from their link is no longer offered", () => {
    renderCard(
      {
        refundStatus: "none",
        closureDate: "2026-11-05",
        closureMessage: null,
        offers: OFFERS,
        rebooked: null,
      },
      { preferredOfferId: "gone" }
    );
    expect(screen.getByRole("alert").textContent).toMatch(/that time was just taken/i);
  });

  it("names the venue in the failed-refund line", () => {
    renderCard({
      refundStatus: "failed",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: [],
      rebooked: null,
    });
    expect(screen.getByText(/The Oak Table will be in touch/)).toBeDefined();
    expect(screen.queryByText(/\{\{venue\}\}/)).toBeNull();
  });

  it("when already rebooked shows the new time with a link, and no offers", () => {
    renderCard({
      refundStatus: "done",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: [],
      rebooked: { startTime: "2026-11-08T02:00:00.000Z", manageToken: "new tok" },
    });
    expect(screen.getByText(/you.re rebooked for/i).textContent).toContain(
      "I(2026-11-08T02:00:00.000Z)"
    );
    expect(screen.queryByRole("button", { name: /^Rebook/ })).toBeNull();
    const link = screen.getByRole("link", { name: /view your new reservation/i });
    expect(link.getAttribute("href")).toBe("?token=new%20tok");
  });

  it("has no axe violations", async () => {
    const { container } = renderCard({
      refundStatus: "failed",
      closureDate: "2026-11-05",
      closureMessage: null,
      offers: OFFERS,
      rebooked: null,
    });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
