import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { ManageReservationPage } from "./ManageReservationPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatLongDateWithYear, formatTimeIn } from "../utils/format.js";

const mockSearchParams = new URLSearchParams();
vi.mock("react-router", () => ({
  useSearchParams: () => [mockSearchParams],
}));

// ApiClient uses fetch internally. Stub it so we control responses and can
// assert on the URL pattern it calls (verifying ApiClient routing is used).
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeOkResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const validVenue = {
  id: "venue_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  phone: "+15035551234",
};

const validReservation = {
  id: "res_1",
  date: "2026-06-15",
  startTime: "2026-06-15T19:00:00.000Z",
  endTime: "2026-06-15T21:00:00.000Z",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  status: "PENDING",
  notes: null,
};

function makeManagedPayload(
  overrides: {
    reservation?: Partial<typeof validReservation>;
    venue?: Partial<typeof validVenue> | null;
  } = {}
) {
  return {
    data: {
      reservation: { ...validReservation, ...overrides.reservation },
      venue: overrides.venue === null ? null : { ...validVenue, ...overrides.venue },
    },
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ManageReservationPage />
    </Wrapper>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete("token");
});

describe("ManageReservationPage", () => {
  describe("document title (#4973)", () => {
    it("sets a venue-specific reservation title once the reservation resolves", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();

      await waitFor(() => {
        expect(document.title).toBe("The Oak Table — Your reservation");
      });
    });
  });

  describe("no-access-link state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", () => {
      renderPage();
      expect(screen.getByText("No Access Link")).toBeDefined();
      expect(screen.getByText("Please check the link in your confirmation email.")).toBeDefined();
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });

  it("routes reservation lookup through ApiClient — calls manage endpoint via structured URL", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

    renderPage();
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

    // ApiClient constructs the URL from baseUrl + path
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/public/v1/reservations/manage");
    expect(calledUrl).toContain("token=valid-token-abc");
  });

  describe("valid reservation (#4980)", () => {
    it("formats date and time instead of showing raw ISO values", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      const expectedDate = formatLongDateWithYear(validReservation.date);
      const expectedStart = formatTimeIn(validReservation.startTime, validVenue.ianaTimezone);
      const expectedEnd = formatTimeIn(validReservation.endTime, validVenue.ianaTimezone);

      expect(screen.getByText(expectedDate)).toBeDefined();
      expect(screen.getByText(`${expectedStart} – ${expectedEnd}`)).toBeDefined();
      expect(screen.queryByText(validReservation.date)).toBeNull();
      expect(screen.queryByText(validReservation.startTime)).toBeNull();
    });

    it("shows reservation details for valid token", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(makeManagedPayload({ reservation: { notes: "Window seat please" } }))
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeDefined();
      });
      expect(screen.getByText("The Oak Table")).toBeDefined();
      expect(screen.getByText("4 guests")).toBeDefined();
    });

    it("offers add-to-calendar links and a call-the-venue link (no dead end)", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      expect(screen.getByRole("button", { name: /download \.ics/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /google calendar/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /outlook/i })).toBeDefined();
      const callLink = screen.getByRole("link", { name: /call the oak table/i });
      expect(callLink.getAttribute("href")).toBe(`tel:${validVenue.phone}`);
    });

    it("cancels the reservation via the reused CancelReservationDialog", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      fireEvent.click(screen.getByRole("button", { name: /cancel reservation/i }));

      const dialog = await screen.findByRole("dialog");
      mockFetch.mockResolvedValueOnce(makeOkResponse({ data: { status: "CANCELLED" } }));
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(makeManagedPayload({ reservation: { status: "CANCELLED" } }))
      );

      fireEvent.click(within(dialog).getByRole("button", { name: /^cancel reservation$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      const cancelCall = mockFetch.mock.calls.find(
        (call) =>
          (call[1] as RequestInit | undefined)?.method === "DELETE" &&
          String(call[0]).includes("/public/v1/reservations/manage")
      );
      expect(cancelCall).toBeDefined();
      const headers = (cancelCall![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer valid-token-abc");
    });
  });

  describe("link-expired state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", async () => {
      mockSearchParams.set("token", "expired-token");
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(410, { status: 410, detail: "Token expired" })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Link Expired")).toBeDefined();
      });
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });

  describe("invalid-link state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", async () => {
      mockSearchParams.set("token", "bad-token");
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(401, { status: 401, detail: "Invalid token" })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Invalid Link")).toBeDefined();
        expect(screen.getByText("This link has already been used or is invalid.")).toBeDefined();
      });
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });
});
